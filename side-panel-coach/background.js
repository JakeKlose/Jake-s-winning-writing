// Service worker.
//
// - Opens the side panel when the user clicks the toolbar icon.
// - Bridges side-panel <-> content-script messages for "get-compose-text".
// - Runs the pre-send cross-model gate when the content script intercepts a Send.

import { CROSS_MODEL_SYSTEM_PROMPT } from './lib/cross-model-prompt.js';
import { loadRulesForIntent } from './lib/skill-loader.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((e) => console.error('[winning-writing] sidePanel setup:', e));
});

// ----- Helpers -----

function getStored(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (r) => resolve(r[key] || ''));
  });
}

function parseVerdict(text) {
  const m = (text || '').match(/##\s*Verdict\s*\n+\s*(PASS|FAIL)/i);
  return m ? m[1].toUpperCase() : null;
}

function extractSection(text, sectionName) {
  const re = new RegExp(`##\\s*${sectionName}[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, 'i');
  const m = (text || '').match(re);
  return m ? m[1].trim() : null;
}

// ----- Pre-send gate -----

async function runPreSendGate(draft) {
  const apiKey = await getStored('ww-coach.apikey');
  if (!apiKey) {
    return { ok: false, verdict: 'error', detail: 'No Anthropic API key set in the side panel. Open the panel, go to Settings, paste your key.' };
  }
  const model = (await getStored('ww-coach.model')) || 'claude-sonnet-4-6';
  const rules = await loadRulesForIntent('cold-email');

  const reviewerUser = `Below is a cold-email draft to gate. Run the catalog and produce the verdict per the system prompt format.

# DRAFT TO REVIEW

${draft}`;

  // We send the rule library as a cached system block + the cross-model prompt
  // as the dynamic instructions. The cross-model prompt already names the 14
  // failure modes inline — the rule library reinforces with the canonical files.
  const system = [
    { type: 'text', text: rules.markdown, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: CROSS_MODEL_SYSTEM_PROMPT },
  ];

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      system,
      messages: [{ role: 'user', content: reviewerUser }],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    return { ok: false, verdict: 'error', detail: `Anthropic API ${res.status}: ${t.slice(0, 300)}` };
  }
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  const verdict = parseVerdict(text);
  const failures = extractSection(text, 'Named failure modes') || extractSection(text, 'Failures');
  const counter = extractSection(text, 'Most likely counter-question');

  const detailParts = [];
  if (verdict === 'fail' && failures) detailParts.push(`Named failures:\n${failures}`);
  if (counter) detailParts.push(`Likely counter-question: ${counter}`);
  if (detailParts.length === 0) detailParts.push(text.trim().slice(0, 600));

  return {
    ok: true,
    verdict: verdict ? verdict.toLowerCase() : 'error',
    detail: detailParts.join('\n\n'),
    raw: text,
    model,
  };
}

// ----- Message router -----

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;

  if (msg.type === 'get-compose-text') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab) { sendResponse({ ok: false, error: 'No active tab.' }); return; }
      if (!/^https:\/\/mail\.google\.com\//.test(tab.url || '')) {
        sendResponse({ ok: false, error: 'Active tab is not Gmail.' });
        return;
      }
      chrome.tabs.sendMessage(tab.id, { type: 'get-compose-text' }, (resp) => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse(resp || { ok: false, error: 'No response from content script.' });
        }
      });
    });
    return true;
  }

  if (msg.type === 'presend-check') {
    runPreSendGate(msg.draft || '')
      .then((r) => sendResponse(r))
      .catch((err) => sendResponse({ ok: false, verdict: 'error', detail: err.message }));
    return true;
  }

  if (msg.type === 'set-send-interception-broadcast') {
    // Side panel toggled the setting; push it to all open Gmail tabs.
    chrome.tabs.query({ url: 'https://mail.google.com/*' }, (tabs) => {
      for (const t of tabs) {
        chrome.tabs.sendMessage(t.id, { type: 'set-send-interception', enabled: !!msg.enabled }, () => {
          if (chrome.runtime.lastError) {
            // Ignore — content script may not be loaded in older tabs.
          }
        });
      }
      sendResponse({ ok: true, broadcastTo: tabs.length });
    });
    return true;
  }
});

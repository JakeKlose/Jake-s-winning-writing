// Reads the active compose body from Gmail and returns it on request.
//
// Gmail's DOM is volatile but two anchors have been stable across redesigns:
// - The compose body: `div[role="textbox"]` with an aria-label containing "body"
// - The subject input: `input[name="subjectbox"]`
//
// We use the *last* matching compose body in the DOM so that when multiple
// drafts are open, we pick the most recently focused / opened one.

function findComposeBodies() {
  return Array.from(
    document.querySelectorAll(
      'div[role="textbox"][aria-label*="Body" i], div[role="textbox"][aria-label*="message body" i]'
    )
  );
}

function findFocusedComposeBody() {
  const bodies = findComposeBodies();
  if (bodies.length === 0) return null;
  // Prefer the body that is, or contains, the document's active element.
  const active = document.activeElement;
  for (const b of bodies) {
    if (b === active || b.contains(active)) return b;
  }
  // Otherwise return the most recently inserted one (Gmail appends newest last).
  return bodies[bodies.length - 1];
}

function findSubjectFor(composeBody) {
  // Walk up to the compose dialog and find its subject input.
  let node = composeBody;
  for (let i = 0; i < 20 && node; i++) {
    if (node.querySelector) {
      const subj = node.querySelector('input[name="subjectbox"]');
      if (subj) return subj.value || '';
    }
    node = node.parentElement;
  }
  return '';
}

function bodyToPlainText(body) {
  // Gmail uses <div> per line plus <br> for soft breaks. Walk children and
  // assemble plain text with newlines.
  function walk(node) {
    if (!node) return '';
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (node.nodeName === 'BR') return '\n';
    if (node.nodeName === 'DIV' || node.nodeName === 'P') {
      let inner = '';
      for (const child of node.childNodes) inner += walk(child);
      return inner.endsWith('\n') ? inner : inner + '\n';
    }
    let inner = '';
    for (const child of node.childNodes) inner += walk(child);
    return inner;
  }
  let text = '';
  for (const child of body.childNodes) text += walk(child);
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

function extractDraft() {
  const body = findFocusedComposeBody();
  if (!body) {
    return {
      ok: false,
      error:
        'No open compose box found. Click "Compose" or "Reply" in Gmail first, then try again.',
    };
  }
  const text = bodyToPlainText(body);
  const subject = findSubjectFor(body);
  return { ok: true, text, subject };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'get-compose-text') {
    sendResponse(extractDraft());
    return true;
  }
  if (msg && msg.type === 'set-send-interception') {
    setSendInterceptionEnabled(!!msg.enabled);
    sendResponse({ ok: true });
    return true;
  }
});

// ----- Send-button interception -----
//
// Two send paths in Gmail:
//   1. Click the "Send" button (div[role="button"][data-tooltip-id^="tt-"])
//   2. Cmd+Enter / Ctrl+Enter while the compose body is focused
//
// We intercept both. On intercept, we ask the side panel to run the pre-send
// check; while it runs, we hold the send. If PASS, we re-fire the original
// send; if FAIL, we show a blocking modal with the named failures plus a
// "Send anyway" escape hatch.

let sendInterceptionEnabled = false;
let intercepting = false;

function isSendButton(el) {
  if (!el || !el.getAttribute) return false;
  const role = el.getAttribute('role');
  if (role !== 'button') return false;
  const tooltip = el.getAttribute('data-tooltip') || el.getAttribute('aria-label') || '';
  // Gmail tooltips look like "Send ‪(⌘Enter)‬" / "Send (Ctrl-Enter)" / "Schedule send"
  if (/^send\b/i.test(tooltip)) return true;
  // Older fallback: descendant text reads "Send"
  const txt = (el.textContent || '').trim();
  return /^send$/i.test(txt);
}

function findActiveSendButton(target) {
  // Walk up from the click target looking for a Send button.
  let node = target;
  for (let i = 0; i < 6 && node; i++) {
    if (isSendButton(node)) return node;
    node = node.parentElement;
  }
  return null;
}

function showPreSendModal({ status, message, onProceed, onCancel, isLoading = false }) {
  // Remove any existing
  const old = document.getElementById('ww-coach-presend-modal');
  if (old) old.remove();

  const wrap = document.createElement('div');
  wrap.id = 'ww-coach-presend-modal';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(20,20,30,0.55);display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;';
  wrap.innerHTML = `
    <div style="background:#fff;border-radius:12px;max-width:520px;width:90%;padding:24px 28px;box-shadow:0 24px 64px rgba(0,0,0,0.25);border-top:4px solid ${status === 'fail' ? '#c5391d' : status === 'pass' ? '#3c8a3c' : '#a8794f'};">
      <div style="font-size:11px;font-family:ui-monospace,monospace;text-transform:uppercase;letter-spacing:0.08em;color:${status === 'fail' ? '#c5391d' : status === 'pass' ? '#3c8a3c' : '#a8794f'};margin-bottom:8px;">Winning Writing Coach · ${isLoading ? 'pre-send check' : status === 'pass' ? 'pass' : status === 'fail' ? 'fail' : 'error'}</div>
      <div id="ww-coach-presend-msg" style="font-size:14px;line-height:1.55;color:#222;margin-bottom:18px;white-space:pre-wrap;">${message}</div>
      <div style="display:flex;gap:10px;justify-content:flex-end;${isLoading ? 'display:none;' : ''}" id="ww-coach-presend-actions">
        <button id="ww-coach-presend-cancel" style="font-size:13px;padding:6px 14px;border:1px solid #ddd;border-radius:6px;background:#fff;cursor:pointer;">${status === 'fail' ? 'Fix' : 'Cancel'}</button>
        <button id="ww-coach-presend-proceed" style="font-size:13px;padding:6px 14px;border:1px solid #c5391d;border-radius:6px;background:${status === 'fail' ? '#c5391d' : '#3c8a3c'};color:#fff;cursor:pointer;">${status === 'fail' ? 'Send anyway' : 'Send'}</button>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);

  if (!isLoading) {
    wrap.querySelector('#ww-coach-presend-cancel').addEventListener('click', () => {
      wrap.remove();
      if (onCancel) onCancel();
    });
    wrap.querySelector('#ww-coach-presend-proceed').addEventListener('click', () => {
      wrap.remove();
      if (onProceed) onProceed();
    });
  }
  return wrap;
}

function updatePreSendModal({ status, message }) {
  const modal = document.getElementById('ww-coach-presend-modal');
  if (!modal) return;
  // For simplicity, just replace it
  showPreSendModal({ status, message, isLoading: false,
    onProceed: window.__wwCoachOnProceed,
    onCancel: window.__wwCoachOnCancel,
  });
}

async function runPreSendCheck(sendButton, draft) {
  intercepting = true;
  const modal = showPreSendModal({
    status: 'loading',
    message: 'Running cross-model gate against the rule library. ~5-10 seconds.',
    isLoading: true,
  });
  try {
    const resp = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'presend-check', draft }, (r) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!r) return reject(new Error('No response from extension.'));
        resolve(r);
      });
      // Safety timeout
      setTimeout(() => reject(new Error('Pre-send check timed out after 30s.')), 30000);
    });

    const verdict = resp.verdict || (resp.ok ? 'unknown' : 'error');
    const message = resp.detail || (verdict === 'pass'
      ? 'No high-severity failures detected. Click Send to proceed.'
      : verdict === 'fail'
      ? 'The gate blocked this send. See the named failures.'
      : 'Pre-send check could not produce a verdict.');

    window.__wwCoachOnProceed = () => {
      intercepting = false;
      // Programmatically click the original Send button without re-triggering our hook.
      reFireSend(sendButton);
    };
    window.__wwCoachOnCancel = () => {
      intercepting = false;
    };
    updatePreSendModal({ status: verdict === 'pass' ? 'pass' : 'fail', message });
  } catch (err) {
    intercepting = false;
    updatePreSendModal({
      status: 'error',
      message: `Pre-send check failed: ${err.message}. Click Send to bypass, or Cancel to fix.`,
    });
    window.__wwCoachOnProceed = () => reFireSend(sendButton);
    window.__wwCoachOnCancel = () => {};
  }
}

function reFireSend(sendButton) {
  if (!sendButton) return;
  // Click programmatically. Our handler runs in capture phase with a flag, so set the flag.
  sendButton.__wwCoachReFired = true;
  sendButton.click();
}

function onCaptureClick(e) {
  if (!sendInterceptionEnabled) return;
  if (intercepting) return;
  const btn = findActiveSendButton(e.target);
  if (!btn) return;
  if (btn.__wwCoachReFired) { btn.__wwCoachReFired = false; return; }
  e.preventDefault();
  e.stopPropagation();
  const draft = extractDraft();
  if (!draft.ok) {
    intercepting = false;
    return; // Let the send proceed if we can't read the body
  }
  runPreSendCheck(btn, draft.text);
}

function onCaptureKeydown(e) {
  if (!sendInterceptionEnabled) return;
  if (intercepting) return;
  const isSendKey = (e.metaKey || e.ctrlKey) && (e.key === 'Enter' || e.key === 'Return');
  if (!isSendKey) return;
  const body = findFocusedComposeBody();
  if (!body) return;
  e.preventDefault();
  e.stopPropagation();
  // Find the Send button associated with this compose
  let node = body;
  let sendBtn = null;
  for (let i = 0; i < 30 && node; i++) {
    if (node.querySelector) {
      const candidates = node.querySelectorAll('div[role="button"]');
      for (const c of candidates) {
        if (isSendButton(c)) { sendBtn = c; break; }
      }
      if (sendBtn) break;
    }
    node = node.parentElement;
  }
  const draft = extractDraft();
  if (!draft.ok) return;
  runPreSendCheck(sendBtn, draft.text);
}

function setSendInterceptionEnabled(on) {
  sendInterceptionEnabled = !!on;
  if (sendInterceptionEnabled && !window.__wwCoachInterceptInstalled) {
    document.addEventListener('click', onCaptureClick, true);
    document.addEventListener('keydown', onCaptureKeydown, true);
    window.__wwCoachInterceptInstalled = true;
  }
}

// Read initial setting on startup. After the sync migration, the flag lives
// in chrome.storage.sync; fall back to local for pre-migration installs.
if (typeof chrome !== 'undefined' && chrome.storage) {
  if (chrome.storage.sync) {
    chrome.storage.sync.get(['ww-coach.send-interception'], (r) => {
      if (typeof r['ww-coach.send-interception'] === 'boolean') {
        setSendInterceptionEnabled(r['ww-coach.send-interception'] === true);
      } else if (chrome.storage.local) {
        chrome.storage.local.get(['ww-coach.send-interception'], (r2) => {
          setSendInterceptionEnabled(r2['ww-coach.send-interception'] === true);
        });
      }
    });
  } else if (chrome.storage.local) {
    chrome.storage.local.get(['ww-coach.send-interception'], (r) => {
      setSendInterceptionEnabled(r['ww-coach.send-interception'] === true);
    });
  }
}

// Side panel orchestrator. Reuses the same critic + refinement runners that the
// Coach UI uses, plus glue for chrome.storage (key persistence) and
// chrome.runtime.sendMessage (importing the active Gmail compose).

import { runInlineCritic, runRefinementTurn } from './lib/agents.js';
import { loadRulesForIntent, clearRuleCache, setRuleSource, getRuleSourceSettings } from './lib/skill-loader.js';

const $ = (id) => document.getElementById(id);

const inExtension = typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.sendMessage === 'function';

const KEY_STORE = 'ww-coach.apikey';
const MODEL_STORE = 'ww-coach.model';

const inline = {
  originalDraft: '',
  workingDraft: '',
  annotations: [],
  summary: '',
  intent: 'cold-email',
  rulesLoaded: [],
  rulesIntent: null,
  rulesMode: 'bundled',
  rulesOrigin: {},
  chatHistory: [],
};

let stickyCardId = null;

// ----- Storage abstraction -----

function getStored(key) {
  return new Promise((resolve) => {
    if (inExtension && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([key], (r) => resolve(r[key] || ''));
    } else {
      resolve(localStorage.getItem(key) || '');
    }
  });
}

function setStored(key, value) {
  if (inExtension && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ [key]: value });
  } else {
    localStorage.setItem(key, value);
  }
}

async function loadSettings() {
  $('api-key').value = await getStored(KEY_STORE);
  const m = await getStored(MODEL_STORE);
  if (m) $('model').value = m;
  const ruleSettings = await getRuleSourceSettings();
  $('rule-source').value = ruleSettings.source;
  $('github-base').value = ruleSettings.githubBase;
  updateRuleSourceVisibility();
  updateCacheInfo();
  // Send-interception toggle
  if (inExtension && chrome.storage && chrome.storage.local) {
    await new Promise((resolve) => {
      chrome.storage.local.get(['ww-coach.send-interception'], (r) => {
        $('send-interception').checked = r['ww-coach.send-interception'] === true;
        resolve();
      });
    });
  } else {
    $('send-interception').checked = localStorage.getItem('ww-coach.send-interception') === 'true';
  }
}

function updateRuleSourceVisibility() {
  $('github-base-field').style.display = $('rule-source').value === 'github' ? '' : 'none';
}

async function updateCacheInfo() {
  const settings = await getRuleSourceSettings();
  if (settings.source !== 'github') {
    $('rules-cache-info').textContent = 'Bundled — no cache.';
    return;
  }
  let cacheSize = 0;
  let oldest = null;
  if (inExtension && chrome.storage && chrome.storage.local) {
    await new Promise((resolve) => {
      chrome.storage.local.get(['ww-coach.rule-cache'], (r) => {
        const c = r['ww-coach.rule-cache'] || {};
        cacheSize = Object.keys(c).length;
        for (const k of Object.keys(c)) {
          const t = c[k].fetchedAt;
          if (oldest === null || t < oldest) oldest = t;
        }
        resolve();
      });
    });
  } else {
    try {
      const c = JSON.parse(localStorage.getItem('ww-coach.rule-cache') || '{}');
      cacheSize = Object.keys(c).length;
      for (const k of Object.keys(c)) {
        const t = c[k].fetchedAt;
        if (oldest === null || t < oldest) oldest = t;
      }
    } catch {}
  }
  if (cacheSize === 0) {
    $('rules-cache-info').textContent = 'Cache empty — next critique fetches all files.';
  } else {
    const ageMin = oldest ? Math.round((Date.now() - oldest) / 60000) : 0;
    $('rules-cache-info').textContent = `${cacheSize} files cached · oldest ${ageMin} min ago.`;
  }
}

async function onRuleSourceChange() {
  const source = $('rule-source').value;
  const base = $('github-base').value.trim() || 'kalyvask/winning-writing/main';
  await setRuleSource(source, base);
  updateRuleSourceVisibility();
  updateCacheInfo();
  setStatus(`Rule source set to ${source === 'github' ? 'live GitHub (' + base + ')' : 'bundled snapshot'}. Cache cleared.`, 'ok');
}

async function refreshRules() {
  clearRuleCache();
  setStatus('Rule cache cleared. Next critique will fetch fresh rules.', 'ok');
  updateCacheInfo();
}

async function onSendInterceptionChange() {
  const enabled = $('send-interception').checked;
  if (inExtension && chrome.storage && chrome.storage.local) {
    await new Promise((r) => chrome.storage.local.set({ 'ww-coach.send-interception': enabled }, r));
    // Tell the background to broadcast to all Gmail tabs.
    chrome.runtime.sendMessage({ type: 'set-send-interception-broadcast', enabled }, (resp) => {
      const n = resp?.broadcastTo || 0;
      setStatus(`Pre-send gate ${enabled ? 'ON' : 'OFF'}. ${n} open Gmail tab${n === 1 ? '' : 's'} notified.`, 'ok');
    });
  } else {
    localStorage.setItem('ww-coach.send-interception', String(enabled));
    setStatus(`Pre-send gate ${enabled ? 'ON' : 'OFF'} (browser-tab mode; no real Gmail integration).`, 'ok');
  }
}

function persistKey() {
  const k = $('api-key').value.trim();
  if (k) setStored(KEY_STORE, k);
}
function persistModel() { setStored(MODEL_STORE, $('model').value); }

// ----- Helpers -----

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function setStatus(msg, kind = '') {
  const el = $('status');
  el.textContent = msg;
  el.className = `status ${kind}`;
}

function ruleSourceLink(source) {
  if (!source) return '';
  if (source === 'fallback') {
    return `<span class="ann-card-source" title="Rule library not loaded">fallback</span>`;
  }
  // We can't link to a file inside the extension package from the side panel
  // text, but we can link to the source on GitHub so the user can read the rule.
  const repoBase = 'https://github.com/kalyvask/winning-writing/blob/main';
  let suffix;
  if (source.startsWith('points/')) suffix = source;
  else if (source.startsWith('skills/')) suffix = `${source}/SKILL.md`;
  else suffix = source;
  return `<a class="ann-card-source" href="${repoBase}/${suffix}" target="_blank" rel="noreferrer" title="Open the rule on GitHub">${escapeHtml(source)}</a>`;
}

// ----- Inline coach renderers -----

function resolveAnnotationOffsets() {
  const cursors = new Map();
  for (const a of inline.annotations) {
    if (a.status !== 'open') { a.start = -1; a.end = -1; continue; }
    const from = cursors.get(a.quote) || 0;
    const idx = inline.workingDraft.indexOf(a.quote, from);
    if (idx === -1) { a.start = -1; a.end = -1; }
    else { a.start = idx; a.end = idx + a.quote.length; cursors.set(a.quote, a.end); }
  }
}

function renderAnnotatedDraft() {
  const viewer = $('inline-coach-viewer');
  if (!inline.workingDraft) {
    viewer.innerHTML = '<p class="empty">No draft yet.</p>';
    return;
  }
  resolveAnnotationOffsets();
  const sevRank = { high: 3, medium: 2, low: 1 };
  const open = inline.annotations
    .filter((a) => a.status === 'open' && a.start >= 0)
    .sort((a, b) => a.start - b.start);
  const filtered = [];
  let lastEnd = -1;
  for (const a of open) {
    if (a.start >= lastEnd) { filtered.push(a); lastEnd = a.end; }
    else {
      const prev = filtered[filtered.length - 1];
      if (sevRank[a.severity] > sevRank[prev.severity]) { filtered[filtered.length - 1] = a; lastEnd = a.end; }
    }
  }
  let html = '';
  let cursor = 0;
  for (const a of filtered) {
    html += escapeHtml(inline.workingDraft.slice(cursor, a.start));
    html += `<mark class="ann ann-${a.severity}" data-ann-id="${a.id}" tabindex="0">${escapeHtml(inline.workingDraft.slice(a.start, a.end))}</mark>`;
    cursor = a.end;
  }
  html += escapeHtml(inline.workingDraft.slice(cursor));
  viewer.innerHTML = html.replace(/\n/g, '<br>');
  viewer.querySelectorAll('.ann').forEach((el) => {
    el.addEventListener('mouseenter', onAnnHover);
    el.addEventListener('mouseleave', onAnnLeave);
    el.addEventListener('click', onAnnClick);
  });
}

function onAnnHover(e) { if (stickyCardId) return; positionAnnCard(e.currentTarget); }
function onAnnLeave() { if (stickyCardId) return; removeAnnCard(); }
function onAnnClick(e) {
  const el = e.currentTarget;
  if (stickyCardId === el.dataset.annId) { stickyCardId = null; removeAnnCard(); }
  else { stickyCardId = el.dataset.annId; positionAnnCard(el); }
}
function removeAnnCard() { const c = document.getElementById('ann-card'); if (c) c.remove(); }

function positionAnnCard(el) {
  const a = inline.annotations.find((x) => x.id === el.dataset.annId);
  if (!a) return;
  removeAnnCard();
  const card = document.createElement('div');
  card.id = 'ann-card';
  card.className = `ann-card ann-card-${a.severity}`;
  const sourceHtml = a.rule_source
    ? `<div class="ann-card-source-row"><span class="ann-card-label">Rule:</span> ${ruleSourceLink(a.rule_source)}</div>`
    : '';
  card.innerHTML = `
    <div class="ann-card-head">
      <span class="ann-card-cat">${escapeHtml(a.category)}</span>
      <span class="ann-card-sev ann-card-sev-${a.severity}">${a.severity}</span>
    </div>
    <div class="ann-card-why">${escapeHtml(a.why)}</div>
    ${a.suggested ? `<div class="ann-card-suggest"><span class="ann-card-label">Suggested:</span> ${escapeHtml(a.suggested)}</div>` : ''}
    ${sourceHtml}
    <div class="ann-card-actions">
      <button class="btn btn-small" data-act="accept">Accept</button>
      <button class="btn btn-small" data-act="reject">Reject</button>
      <button class="btn btn-small" data-act="snooze">Snooze</button>
    </div>
  `;
  document.body.appendChild(card);
  const rect = el.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  let left = rect.left + window.scrollX;
  let top = rect.bottom + window.scrollY + 6;
  if (left + cardRect.width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - cardRect.width - 8);
  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
  card.querySelectorAll('button[data-act]').forEach((b) => {
    b.addEventListener('click', (ev) => { ev.stopPropagation(); handleAnnAction(a.id, b.dataset.act); });
  });
}

function handleAnnAction(annId, act) {
  const a = inline.annotations.find((x) => x.id === annId);
  if (!a) return;
  if (act === 'accept') {
    resolveAnnotationOffsets();
    const cur = inline.annotations.find((x) => x.id === annId);
    if (cur.start >= 0 && a.suggested) {
      const isDelete = /^\(?\s*delete\b/i.test(a.suggested.trim());
      const repl = isDelete ? '' : a.suggested;
      let before = inline.workingDraft.slice(0, cur.start);
      let after = inline.workingDraft.slice(cur.end);
      if (isDelete) {
        before = before.replace(/\s+$/, '');
        after = after.replace(/^\s+/, '');
        if (before && after && !/[\s\n]$/.test(before) && !/^[\s\n]/.test(after)) before += ' ';
      }
      inline.workingDraft = before + repl + after;
    }
    a.status = 'accepted';
  } else if (act === 'reject') {
    a.status = 'rejected';
  } else if (act === 'snooze') {
    a.status = 'snoozed';
  }
  stickyCardId = null;
  removeAnnCard();
  renderInlineCoach();
}

function countAnnotations() {
  const out = { open: 0, openHigh: 0, openMed: 0, openLow: 0, accepted: 0, rejected: 0, snoozed: 0 };
  for (const a of inline.annotations) {
    if (a.status === 'open') {
      out.open++;
      if (a.severity === 'high') out.openHigh++;
      else if (a.severity === 'medium') out.openMed++;
      else out.openLow++;
    } else if (a.status === 'accepted') out.accepted++;
    else if (a.status === 'rejected') out.rejected++;
    else if (a.status === 'snoozed') out.snoozed++;
  }
  return out;
}

function renderInlineSidebar() {
  const aside = $('inline-coach-sidebar');
  const sevRank = { high: 3, medium: 2, low: 1 };
  const open = inline.annotations
    .filter((a) => a.status === 'open')
    .sort((a, b) => sevRank[b.severity] - sevRank[a.severity]);
  if (open.length === 0) {
    aside.innerHTML = `<p class="empty">${inline.annotations.length ? 'No open flags remaining.' : 'Clean draft — no flags.'}</p>`;
    return;
  }
  let html = '<h3>Open flags</h3><ul class="ann-list">';
  for (const a of open) {
    const trunc = a.quote.length > 60 ? a.quote.slice(0, 60) + '…' : a.quote;
    const suggest = a.suggested ? `<div class="ann-list-suggest">→ ${escapeHtml(a.suggested)}</div>` : '';
    const unres = a.start < 0 ? '<span class="ann-list-unresolved">unmatched</span>' : '';
    const sourceRow = a.rule_source ? `<div class="ann-list-source">${ruleSourceLink(a.rule_source)}</div>` : '';
    html += `<li class="ann-list-item ann-list-${a.severity}" data-ann-id="${a.id}">
      <div class="ann-list-head"><span class="ann-list-cat">${escapeHtml(a.category)}</span><span class="ann-list-sev ann-list-sev-${a.severity}">${a.severity}</span>${unres}</div>
      <div class="ann-list-quote">"${escapeHtml(trunc)}"</div>
      <div class="ann-list-why">${escapeHtml(a.why)}</div>
      ${suggest}
      ${sourceRow}
      <div class="ann-list-actions">
        <button class="btn btn-small" data-act="accept" data-ann-id="${a.id}">Accept</button>
        <button class="btn btn-small" data-act="reject" data-ann-id="${a.id}">Reject</button>
        <button class="btn btn-small" data-act="snooze" data-ann-id="${a.id}">Snooze</button>
      </div>
    </li>`;
  }
  html += '</ul>';
  aside.innerHTML = html;
  aside.querySelectorAll('button[data-ann-id]').forEach((b) => {
    b.addEventListener('click', () => handleAnnAction(b.dataset.annId, b.dataset.act));
  });
}

function renderChatTurns() {
  const ul = $('inline-coach-chat-turns');
  if (inline.chatHistory.length === 0) {
    ul.innerHTML = '<li class="chat-empty">No refinement turns yet.</li>';
    return;
  }
  let html = '';
  for (const t of inline.chatHistory) {
    let cls = 'chat-turn-assistant';
    if (t.role === 'user') cls = 'chat-turn-user';
    else if (t.error) cls = 'chat-turn-error';
    else if (t.isEvaluation) cls = 'chat-turn-evaluation';
    html += `<li class="chat-turn ${cls}">
      <div class="chat-turn-role">${t.role === 'user' ? 'You' : 'Coach'}</div>
      <div class="chat-turn-text">${escapeHtml(t.text).replace(/\n/g, '<br>')}</div>
    </li>`;
  }
  ul.innerHTML = html;
  ul.scrollTop = ul.scrollHeight;
}

function renderInlineCoach() {
  $('inline-coach-section').style.display = '';
  const summaryHtml = inline.summary ? `<strong>Read:</strong> ${escapeHtml(inline.summary)}` : '';
  const modeLabel = inline.rulesMode === 'github' ? '<span class="rule-mode-badge rule-mode-github">github</span>' : '<span class="rule-mode-badge rule-mode-bundled">bundled</span>';
  const originHtml = Object.keys(inline.rulesOrigin).length > 0
    ? ` <span class="rule-origin-breakdown">${Object.entries(inline.rulesOrigin).map(([k, v]) => `${k}=${v}`).join(' · ')}</span>`
    : '';
  const libHtml = inline.rulesLoaded.length
    ? `<div class="inline-coach-lib">Against <strong>${inline.rulesLoaded.length}</strong> rule sources (<code>${escapeHtml(inline.rulesIntent || 'cold-email')}</code>) ${modeLabel}${originHtml}. <details><summary>Sources</summary><ul>${inline.rulesLoaded.map((s) => `<li>${ruleSourceLink(s)}</li>`).join('')}</ul></details></div>`
    : `<div class="inline-coach-lib">Rule library unreachable — fallback taxonomy used.</div>`;
  $('inline-coach-summary').innerHTML = summaryHtml + libHtml;

  const c = countAnnotations();
  $('inline-coach-stats').innerHTML = `
    <strong>${c.open}</strong> open · <span class="stat-high">${c.openHigh} high</span> · <span class="stat-med">${c.openMed} med</span> · <span class="stat-low">${c.openLow} low</span> · ${c.accepted} accepted · ${c.rejected} rejected${c.snoozed ? ` · ${c.snoozed} snoozed` : ''}
  `;
  renderAnnotatedDraft();
  renderInlineSidebar();
  renderChatTurns();
}

// ----- Actions -----

async function runCritique() {
  persistKey(); persistModel();
  const apiKey = $('api-key').value.trim();
  if (!apiKey) { setStatus('Paste your Anthropic API key first.', 'err'); $('settings-body').style.display = ''; return; }
  const draft = $('draft-input').value.trim();
  if (!draft) { setStatus('Paste a draft or import from Gmail.', 'err'); return; }

  const btn = $('critique-btn');
  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = 'Critiquing…';
  setStatus('Loading rule library…', 'ok');
  try {
    const rules = await loadRulesForIntent('cold-email');
    inline.rulesLoaded = rules.sources;
    inline.rulesIntent = rules.intent;
    inline.rulesMode = rules.ruleSourceMode || 'bundled';
    inline.rulesOrigin = rules.originBreakdown || {};
    setStatus(`${rules.sources.length} rule sources loaded (${rules.pointCount} points + ${rules.skillCount} skills, ${inline.rulesMode}). Running critic…`, 'ok');
    updateCacheInfo();
    const result = await runInlineCritic({
      apiKey,
      model: $('model').value,
      draft,
      intent: 'cold-email',
      rules,
    });
    inline.originalDraft = draft;
    inline.workingDraft = draft;
    inline.summary = result.summary || '';
    inline.intent = result.intent || 'cold-email';
    inline.annotations = (result.annotations || []).map((a) => ({ ...a, status: 'open', start: -1, end: -1 }));
    renderInlineCoach();
    $('inline-coach-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    const n = inline.annotations.length;
    setStatus(`Critique done. ${n} flag${n === 1 ? '' : 's'} against ${rules.sources.length} rule sources.`, 'ok');
  } catch (err) {
    setStatus(`Critique failed: ${err.message}`, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

async function importFromCompose() {
  if (!inExtension) {
    setStatus('Import only works inside the Chrome extension (not in this preview tab).', 'err');
    return;
  }
  setStatus('Importing from active Gmail compose…', 'ok');
  chrome.runtime.sendMessage({ type: 'get-compose-text' }, (resp) => {
    if (!resp || !resp.ok) {
      setStatus(resp?.error || 'Import failed. Open Gmail and click Compose first.', 'err');
      return;
    }
    const combined = resp.subject ? `Subject: ${resp.subject}\n\n${resp.text}` : resp.text;
    $('draft-input').value = combined;
    setStatus(`Imported ${resp.text.length} chars${resp.subject ? ` (subject: "${resp.subject}")` : ''}. Click Critique to grade it.`, 'ok');
  });
}

function clearDraft() {
  $('draft-input').value = '';
  setStatus('Draft cleared.', 'ok');
}

function acceptAllInline() {
  resolveAnnotationOffsets();
  const opens = inline.annotations
    .filter((a) => a.status === 'open' && a.start >= 0)
    .sort((a, b) => b.start - a.start);
  for (const a of opens) handleAnnAction(a.id, 'accept');
}

function resetInline() {
  inline.workingDraft = inline.originalDraft;
  inline.annotations.forEach((a) => { a.status = 'open'; });
  renderInlineCoach();
}

function copyWorkingDraft() {
  if (!inline.workingDraft) return;
  navigator.clipboard.writeText(inline.workingDraft).then(
    () => setStatus('Copied working draft to clipboard.', 'ok'),
    () => setStatus('Clipboard copy failed.', 'err')
  );
}

async function sendRefinementTurnHandler() {
  const inputEl = $('inline-coach-chat-input');
  const instruction = inputEl.value.trim();
  if (!instruction) return;
  if (!inline.workingDraft) { setStatus('No draft to refine. Critique first.', 'err'); return; }
  persistKey();
  const apiKey = $('api-key').value.trim();
  if (!apiKey) { setStatus('Paste your Anthropic API key first.', 'err'); return; }
  const sendBtn = $('inline-coach-chat-send');
  sendBtn.disabled = true; inputEl.disabled = true;
  inline.chatHistory.push({ role: 'user', text: instruction });
  renderChatTurns();
  inputEl.value = '';
  try {
    setStatus('Refining…', 'ok');
    const rules = await loadRulesForIntent(inline.rulesIntent || 'cold-email');
    const result = await runRefinementTurn({
      apiKey,
      model: $('model').value,
      draft: inline.workingDraft,
      history: inline.chatHistory.slice(0, -1),
      instruction,
      rules,
      intent: inline.intent || 'cold-email',
    });
    if (result.isEvaluation) {
      inline.chatHistory.push({ role: 'assistant', text: result.note, isEvaluation: true });
      renderChatTurns();
      setStatus('Evaluation returned. Draft unchanged.', 'ok');
    } else {
      const wc = result.rewrittenDraft.split(/\s+/).filter(Boolean).length;
      const summary = (result.note ? `NOTE: ${result.note}\n\n` : '') + `Rewrote to ${wc} words. Old flags cleared. Re-critique to flag the new version.`;
      inline.chatHistory.push({ role: 'assistant', text: summary });
      inline.workingDraft = result.rewrittenDraft;
      inline.annotations = [];
      inline.summary = 'Draft refined in chat. Click Re-critique to flag the new version.';
      renderInlineCoach();
      setStatus('Draft refined. Click Re-critique.', 'ok');
    }
  } catch (err) {
    inline.chatHistory.push({ role: 'assistant', text: `Error: ${err.message}`, error: true });
    renderChatTurns();
    setStatus(`Refinement failed: ${err.message}`, 'err');
  } finally {
    sendBtn.disabled = false; inputEl.disabled = false; inputEl.focus();
  }
}

async function reCritique() {
  if (!inline.workingDraft) { setStatus('No working draft.', 'err'); return; }
  persistKey();
  const apiKey = $('api-key').value.trim();
  if (!apiKey) { setStatus('Paste your Anthropic API key first.', 'err'); return; }
  const btn = $('inline-coach-recritique');
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = 'Re-critiquing…';
  setStatus('Re-critiquing current working draft…', 'ok');
  try {
    const rules = await loadRulesForIntent(inline.rulesIntent || 'cold-email');
    const result = await runInlineCritic({
      apiKey,
      model: $('model').value,
      draft: inline.workingDraft,
      intent: inline.intent || 'cold-email',
      rules,
    });
    inline.summary = result.summary || '';
    inline.annotations = (result.annotations || []).map((a) => ({ ...a, status: 'open', start: -1, end: -1 }));
    renderInlineCoach();
    setStatus(`Re-critique done. ${result.annotations.length} flag${result.annotations.length === 1 ? '' : 's'}.`, 'ok');
  } catch (err) {
    setStatus(`Re-critique failed: ${err.message}`, 'err');
  } finally {
    btn.disabled = false; btn.textContent = orig;
  }
}

function resetChat() {
  inline.chatHistory = [];
  renderChatTurns();
  setStatus('Chat history cleared.', 'ok');
}

// ----- Outside-click handling for sticky card -----

document.addEventListener('click', (e) => {
  if (!stickyCardId) return;
  const card = document.getElementById('ann-card');
  if (!card) return;
  if (card.contains(e.target)) return;
  if (e.target.closest('.ann')) return;
  stickyCardId = null;
  removeAnnCard();
});

// ----- Init -----

async function init() {
  await loadSettings();
  $('api-key').addEventListener('change', persistKey);
  $('model').addEventListener('change', persistModel);
  $('rule-source').addEventListener('change', onRuleSourceChange);
  $('github-base').addEventListener('change', onRuleSourceChange);
  $('refresh-rules').addEventListener('click', refreshRules);
  $('send-interception').addEventListener('change', onSendInterceptionChange);
  $('import-compose').addEventListener('click', importFromCompose);
  $('clear-draft').addEventListener('click', clearDraft);
  $('critique-btn').addEventListener('click', runCritique);
  $('inline-coach-accept-all').addEventListener('click', acceptAllInline);
  $('inline-coach-reset').addEventListener('click', resetInline);
  $('inline-coach-copy').addEventListener('click', copyWorkingDraft);
  $('inline-coach-chat-send').addEventListener('click', sendRefinementTurnHandler);
  $('inline-coach-recritique').addEventListener('click', reCritique);
  $('inline-coach-chat-reset').addEventListener('click', resetChat);
  $('inline-coach-chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendRefinementTurnHandler(); }
  });
  document.querySelectorAll('.sp-collapse-toggle').forEach((b) => {
    b.addEventListener('click', () => {
      const t = document.getElementById(b.dataset.target);
      if (!t) return;
      t.style.display = t.style.display === 'none' ? '' : 'none';
    });
  });

  if (!inExtension) {
    $('import-compose').disabled = true;
    $('import-compose').title = 'Only works inside the Chrome extension.';
  }
}

document.addEventListener('DOMContentLoaded', init);

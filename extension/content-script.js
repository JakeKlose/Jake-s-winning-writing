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
});

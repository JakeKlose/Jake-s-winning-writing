// Gmail content script. Watches for compose surfaces to appear, attaches a
// side panel button, and bridges the compose body + recipient to the
// background service worker for critique.
//
// Gmail's compose DOM:
//   - The compose dialog has role="dialog" with an inner body div
//     [contenteditable=true][aria-label*="body" i].
//   - The To field uses chips inside .agP / .afQ; the email lives in
//     attribute "email" or "data-hovercard-id".
//   - Compose appears as a popup at the bottom right (multiple at once is
//     possible).
//
// Selectors are brittle. We use the most stable ones we can; failures fall
// back gracefully (no critique button shown).

import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { CoachPanel } from './panel';
import { parseGmailRecipient } from '../lib/recipient';

const COMPOSE_SELECTOR = 'div[role="dialog"]';
const BODY_SELECTOR = 'div[contenteditable="true"][aria-label*="body" i]';
const PANEL_ATTR = 'data-coach-attached';

// Find compose containers that don't yet have a coach panel attached.
function findFreshComposes(): HTMLElement[] {
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>(COMPOSE_SELECTOR));
  return dialogs.filter((d) => {
    if (d.hasAttribute(PANEL_ATTR)) return false;
    // Compose dialogs always have a body editor; reply/forward dialogs do too.
    return !!d.querySelector(BODY_SELECTOR);
  });
}

function attachPanel(composeRoot: HTMLElement): void {
  composeRoot.setAttribute(PANEL_ATTR, 'true');
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.right = '24px';
  host.style.bottom = '8px';
  host.style.zIndex = '2147483647';
  host.style.width = '360px';
  document.body.appendChild(host);
  const root = createRoot(host);

  // The panel reads from the compose body and recipient on demand. We pass
  // a getter so the panel re-reads on every action (the user is typing).
  const getBody = (): string => {
    const ed = composeRoot.querySelector<HTMLElement>(BODY_SELECTOR);
    return ed?.innerText ?? '';
  };
  const getRecipient = () => parseGmailRecipient(composeRoot);

  // Wire the React panel.
  root.render(
    createElement(CoachPanel, {
      surface: 'gmail',
      getBody,
      getRecipient,
      onClose: () => {
        root.unmount();
        host.remove();
        composeRoot.removeAttribute(PANEL_ATTR);
      },
    }),
  );

  // If the compose closes, tear down.
  const observer = new MutationObserver(() => {
    if (!document.body.contains(composeRoot)) {
      root.unmount();
      host.remove();
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

// Scan periodically for new composes. MutationObserver on document.body
// would also work; the polling approach is simpler and robust to Gmail's
// view transitions.
function watch() {
  const tick = () => {
    for (const compose of findFreshComposes()) {
      attachPanel(compose);
    }
  };
  tick();
  setInterval(tick, 800);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', watch);
} else {
  watch();
}

// LinkedIn content script.
//
// LinkedIn has at least four compose surfaces and they share one stable
// editor selector (.msg-form__contenteditable) plus a different surrounding
// container per flow:
//
//   1. Overlay bubble (bottom-right): wrapped in .msg-overlay-bubble
//      Opens when you click "Message" on a profile or the conversations icon.
//
//   2. Full-page messaging at /messaging/thread/<id>: wrapped in .msg-thread
//      or the parent .msg-overlay-list-bubble container. The reply box at the
//      bottom is the editor.
//
//   3. InMail compose: wrapped in an artdeco-modal AND contains a
//      .msg-form__subject input (only InMail has a subject line). Triggered
//      when messaging a non-connection on Premium.
//
//   4. New-conversation compose: wrapped in .msg-overlay-bubble or modal,
//      with recipient chips in .artdeco-pill[role="button"].
//
// Strategy: find every .msg-form__contenteditable in the DOM, walk up to the
// nearest stable compose container, classify the surface type, and attach a
// panel keyed to that container. The attachment is idempotent (PANEL_ATTR
// marker), so polling is safe.

import { createRoot, type Root } from 'react-dom/client';
import { createElement } from 'react';
import { CoachPanel } from './panel';
import { parseLinkedInRecipient } from '../lib/recipient';

const EDITOR_SELECTOR = '.msg-form__contenteditable[contenteditable="true"]';
const SUBJECT_SELECTOR = '.msg-form__subject input, input[name="subject"]';
const PANEL_ATTR = 'data-coach-attached';

// Container selectors, ordered by specificity. We walk up from the editor
// and pick the closest match.
const CONTAINER_SELECTORS = [
  '.artdeco-modal',           // InMail compose, send-as-message modal
  '.msg-overlay-bubble',      // bottom-right bubble
  '.msg-thread',              // full-page thread reply box
  '.msg-overlay-conversation-bubble', // legacy bubble class
  '.msg-overlay-list-bubble', // overlay list parent
  '[data-test-conversation]', // some recent flows expose this
];

type SurfaceKind = 'overlay' | 'thread' | 'inmail' | 'unknown';

interface AttachedPanel {
  container: HTMLElement;
  host: HTMLDivElement;
  root: Root;
}

const attached: AttachedPanel[] = [];

// Walk up from the editor and find the nearest compose container.
function findContainer(editor: HTMLElement): HTMLElement | null {
  for (const sel of CONTAINER_SELECTORS) {
    const c = editor.closest<HTMLElement>(sel);
    if (c) return c;
  }
  // Fallback: walk up looking for a containing form or section.
  let cur: HTMLElement | null = editor;
  for (let i = 0; i < 8 && cur; i++) {
    if (cur.querySelector(EDITOR_SELECTOR) && cur !== editor) return cur;
    cur = cur.parentElement;
  }
  return null;
}

function classifySurface(container: HTMLElement): SurfaceKind {
  if (container.classList.contains('artdeco-modal')) {
    // InMail-vs-regular-modal disambiguation: InMail always has a subject input.
    return container.querySelector(SUBJECT_SELECTOR) ? 'inmail' : 'unknown';
  }
  if (container.classList.contains('msg-thread')) return 'thread';
  if (
    container.classList.contains('msg-overlay-bubble') ||
    container.classList.contains('msg-overlay-conversation-bubble') ||
    container.classList.contains('msg-overlay-list-bubble')
  ) {
    return 'overlay';
  }
  return 'unknown';
}

// Find every editor in the DOM, dedupe by container, return new ones to
// attach to (skip the ones already marked).
function findFreshComposes(): HTMLElement[] {
  const editors = Array.from(document.querySelectorAll<HTMLElement>(EDITOR_SELECTOR));
  const seenContainers = new Set<HTMLElement>();
  const out: HTMLElement[] = [];
  for (const ed of editors) {
    const container = findContainer(ed);
    if (!container) continue;
    if (container.hasAttribute(PANEL_ATTR)) continue;
    if (seenContainers.has(container)) continue;
    seenContainers.add(container);
    out.push(container);
  }
  return out;
}

// Where to anchor the floating panel for this surface. The overlay bubble
// already lives at the bottom-right, so we position the panel to its left.
// The full-page thread is wider, so we use the right edge of the viewport.
// The InMail modal sits centered, so we position the panel against the
// right viewport edge below the modal's top.
function panelPositionFor(kind: SurfaceKind, container: HTMLElement): { right: string; bottom: string; top: string } {
  if (kind === 'overlay') {
    const rect = container.getBoundingClientRect();
    const offsetRight = window.innerWidth - rect.left + 8;
    return { right: `${offsetRight}px`, bottom: '12px', top: 'auto' };
  }
  if (kind === 'inmail') {
    return { right: '12px', bottom: 'auto', top: '120px' };
  }
  // thread / unknown
  return { right: '24px', bottom: '12px', top: 'auto' };
}

function attachPanel(container: HTMLElement): void {
  const kind = classifySurface(container);
  if (kind === 'unknown') {
    // Don't attach to surfaces we can't classify; risk of attaching to a
    // search dialog or other false positive.
    return;
  }
  container.setAttribute(PANEL_ATTR, 'true');

  const host = document.createElement('div');
  host.style.position = 'fixed';
  const pos = panelPositionFor(kind, container);
  host.style.right = pos.right;
  host.style.bottom = pos.bottom;
  host.style.top = pos.top;
  host.style.zIndex = '2147483647';
  host.style.width = '360px';
  document.body.appendChild(host);
  const root = createRoot(host);

  const editor = container.querySelector<HTMLElement>(EDITOR_SELECTOR);
  const getBody = (): string => {
    const ed = container.querySelector<HTMLElement>(EDITOR_SELECTOR);
    const body = ed?.innerText ?? '';
    // InMail has a subject line; prepend it so the rules can grade it.
    const subjectInput = container.querySelector<HTMLInputElement>(SUBJECT_SELECTOR);
    if (subjectInput?.value) {
      return `Subject: ${subjectInput.value}\n\n${body}`;
    }
    return body;
  };
  const getRecipient = () => parseLinkedInRecipient(container);

  root.render(
    createElement(CoachPanel, {
      surface: 'linkedin',
      getBody,
      getRecipient,
      onClose: () => detach(container),
    }),
  );

  attached.push({ container, host, root });

  // Recompute panel position if the overlay container moves (overlay bubble
  // resizes when minimized/expanded).
  if (kind === 'overlay' && editor) {
    const ro = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      host.style.right = `${window.innerWidth - rect.left + 8}px`;
    });
    ro.observe(container);
  }
}

function detach(container: HTMLElement): void {
  const idx = attached.findIndex((a) => a.container === container);
  if (idx === -1) return;
  const { host, root } = attached[idx];
  try {
    root.unmount();
  } catch {
    // already unmounted
  }
  host.remove();
  container.removeAttribute(PANEL_ATTR);
  attached.splice(idx, 1);
}

// Tear down panels whose container is no longer in the DOM. Necessary because
// LinkedIn dismounts compose surfaces aggressively (closing the bubble,
// navigating away from a thread, closing the InMail modal).
function reapStale(): void {
  for (const a of [...attached]) {
    if (!document.body.contains(a.container)) {
      detach(a.container);
    }
  }
}

function watch() {
  const tick = () => {
    reapStale();
    for (const container of findFreshComposes()) {
      attachPanel(container);
    }
  };
  tick();
  // 1.2s poll. LinkedIn navigates client-side and a brief delay before the
  // editor mounts is normal; the polling absorbs that race.
  setInterval(tick, 1200);

  // Also re-scan when the URL changes — LinkedIn pushState's between
  // /feed, /messaging, /in/<profile>; the editor may appear without DOM
  // events the poller would notice.
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      // Hop one tick to let LinkedIn's UI settle, then re-scan.
      setTimeout(tick, 500);
    }
  }, 600);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', watch);
} else {
  watch();
}

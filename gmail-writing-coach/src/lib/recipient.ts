// Parse the recipient from the compose surface. Gmail and LinkedIn each
// expose the recipient differently, so the content scripts call into these
// helpers with whatever DOM nodes they grab.

import type { RecipientHints } from './types';

const EMAIL_RX = /([a-z0-9._%+-]+)@([a-z0-9.-]+\.[a-z]{2,})/i;

// Pull from Gmail's "To" field. The Gmail compose box uses a chip-style
// element with the recipient email in a data attribute or a span title.
// We try a few selectors and fall back to scanning text.
export function parseGmailRecipient(composeRoot: HTMLElement): RecipientHints {
  const chips = composeRoot.querySelectorAll<HTMLElement>(
    'div.afX, span.peT, span[email], div[data-hovercard-id]',
  );
  let toEmail: string | null = null;
  let toName: string | null = null;
  for (const chip of chips) {
    const email = chip.getAttribute('email') || chip.getAttribute('data-hovercard-id');
    if (email && EMAIL_RX.test(email)) {
      toEmail = email.match(EMAIL_RX)![0];
      toName = chip.getAttribute('name') || chip.textContent?.replace(toEmail, '').trim() || null;
      break;
    }
  }
  if (!toEmail) {
    const inputs = composeRoot.querySelectorAll<HTMLInputElement>('input[name="to"], input[aria-label*="recipients" i]');
    for (const input of inputs) {
      const m = input.value.match(EMAIL_RX);
      if (m) {
        toEmail = m[0];
        break;
      }
    }
  }
  return {
    toEmail,
    toName,
    linkedinUrl: null,
    notes: '',
  };
}

// LinkedIn recipient parser. The compose surfaces all expose the recipient
// differently, so we try multiple selectors in priority order. Falls back to
// scanning anchor text if the structured selectors fail.
export function parseLinkedInRecipient(composeRoot: HTMLElement): RecipientHints {
  // Priority-ordered selectors for the recipient name.
  // Overlay bubble: .msg-overlay-bubble-header__title (also h2 variant)
  // Full-page thread: .msg-thread-actions__name, .msg-conversation-listitem__participant-names
  // InMail modal: .msg-form__send-as-recipient, .send-as-message-modal__recipient,
  //               or the entity-lockup title inside the modal
  // New-conversation: .msg-connections-typeahead chip text
  const nameSelectors = [
    '.msg-overlay-bubble-header__title',
    'h2.msg-overlay-conversation-bubble-header__name',
    '.msg-thread-actions__name',
    '.msg-thread__header h2',
    '.msg-conversation-listitem__participant-names',
    '.msg-entity-lockup__entity-title',
    '.send-as-message-modal__recipient',
    '.msg-form__send-as-recipient',
    '[data-test-conversation-name]',
  ];
  let toName: string | null = null;
  for (const sel of nameSelectors) {
    const el = composeRoot.querySelector<HTMLElement>(sel);
    const text = el?.textContent?.trim();
    if (text) {
      toName = text;
      break;
    }
  }

  // For new-conversation flows, recipient(s) are pills/chips.
  if (!toName) {
    const chips = composeRoot.querySelectorAll<HTMLElement>('.artdeco-pill[role="button"], .msg-connections-typeahead__chip');
    const chipText = Array.from(chips)
      .map((c) => c.textContent?.trim() ?? '')
      .filter(Boolean);
    if (chipText.length) {
      toName = chipText.length === 1 ? chipText[0] : `${chipText[0]} (+${chipText.length - 1} more)`;
    }
  }

  // LinkedIn URL: try the profile link in the header first, then any /in/ link
  // inside the compose container.
  const profileLink =
    composeRoot.querySelector<HTMLAnchorElement>('.msg-thread__header a[href*="/in/"]') ||
    composeRoot.querySelector<HTMLAnchorElement>('.msg-overlay-bubble-header a[href*="/in/"]') ||
    composeRoot.querySelector<HTMLAnchorElement>('a[href*="/in/"]');
  // Normalize relative hrefs to absolute.
  let linkedinUrl: string | null = null;
  if (profileLink?.href) {
    try {
      linkedinUrl = new URL(profileLink.href, location.origin).toString();
    } catch {
      linkedinUrl = profileLink.href;
    }
  }

  return {
    toEmail: null,
    toName,
    linkedinUrl,
    notes: '',
  };
}

// Merge user-pasted notes into recipient hints. The panel exposes a textarea
// for "anything you know about them" that should ride along to the model.
export function mergeNotes(base: RecipientHints, notes: string): RecipientHints {
  return { ...base, notes };
}

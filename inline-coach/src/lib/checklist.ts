// Pre-send checklist combining Rachel Konrad's 10 rules and the S.H.I.T.
// framework. Each item is a single boolean check the user can read at a
// glance. The deterministic checks run in the content script; the heuristic
// ones (subject-line, story, secret-about-the-future) defer to the model
// via the background worker.

import { countWords, LENGTH_LIMIT_WORDS } from './rules/cold-email';
import type { ChecklistItem } from './types';

// Returns the deterministic part of the checklist. Async/model-backed checks
// are appended by the service worker after this runs.
export function buildDeterministicChecklist(body: string): ChecklistItem[] {
  const wordCount = countWords(body);
  const hasSubject = /^Subject:/im.test(body);
  const subjectLine = body.match(/^Subject:\s*(.+)$/im)?.[1]?.trim() ?? '';
  const weakSubject = /^(Quick question|Hoping to connect|Thank you|Hello|Hi|Reaching out|Following up)$/i.test(subjectLine);
  const hasEmDash = /—|--/.test(body);
  const hasGenericOpener = /(I hope (this email finds you well|you are well)|my name is\b|I am writing to|good morning)/i.test(body);
  const hasJargon = /(leverag\w*|synergi\w*|strategiz\w*|empower\w*|impactful|at the intersection of)/i.test(body);
  const hasVagueAsk = /(whenever (works|is convenient)|happy to chat anytime|love to (connect|chat))/i.test(body);
  const hasBlandSignoff = /\n\s*(Best|Sincerely|Regards|Best regards),?\s*\n/i.test(body);
  const hasOffer = /(I (can|could) (help|share|offer|introduce)|I'?d be happy to|happy to (share|send|introduce))/i.test(body);
  const askWithDoor = /(no is .* fine|no worries (if|either way))/i.test(body);

  return [
    {
      id: 'length',
      label: `Under ${LENGTH_LIMIT_WORDS} words`,
      pass: wordCount > 0 && wordCount <= LENGTH_LIMIT_WORDS,
      detail: `${wordCount} words`,
    },
    {
      id: 'subject-present',
      label: 'Subject line present',
      pass: hasSubject,
      detail: hasSubject ? subjectLine : 'No Subject: line found',
    },
    {
      id: 'subject-strong',
      label: 'Subject line is not generic',
      pass: hasSubject && !weakSubject,
      detail: hasSubject ? (weakSubject ? `"${subjectLine}" — generic` : `"${subjectLine}"`) : '(no subject)',
    },
    {
      id: 'no-em-dash',
      label: 'No em-dashes',
      pass: !hasEmDash,
      detail: hasEmDash ? 'Found em-dash or double-hyphen' : 'Clean',
    },
    {
      id: 'no-generic-opener',
      label: 'No generic / templated opener',
      pass: !hasGenericOpener,
      detail: hasGenericOpener ? 'Found "I hope this email finds you well" / "My name is" / similar' : 'Clean',
    },
    {
      id: 'no-jargon',
      label: 'No consultant jargon',
      pass: !hasJargon,
      detail: hasJargon ? 'Found leverage / synergize / strategize / impactful / similar' : 'Clean',
    },
    {
      id: 'specific-ask',
      label: 'Ask is specific (not "whenever works")',
      pass: !hasVagueAsk,
      detail: hasVagueAsk ? 'Vague ask phrasing detected' : 'Looks specific',
    },
    {
      id: 'offer-present',
      label: 'Offer something, not just take',
      pass: hasOffer,
      detail: hasOffer ? 'Offer language present' : 'No clear offer; consider what you can give them',
    },
    {
      id: 'door-open-for-no',
      label: 'Door open for no',
      pass: askWithDoor,
      detail: askWithDoor ? '"No is a perfectly fine answer" or similar' : 'Add a line that makes no easy',
    },
    {
      id: 'signoff-personality',
      label: 'Sign-off has personality (not Best / Sincerely / Regards)',
      pass: !hasBlandSignoff,
      detail: hasBlandSignoff ? 'Bland sign-off detected' : 'Looks personal',
    },
  ];
}

// The full list of checks (deterministic + model-backed) that the pre-send
// gate reports against. The model-backed ones are added by the service
// worker; this constant exists so the panel can render placeholder rows
// while the model call is in flight.
export const MODEL_CHECKS = [
  { id: 'something-they-dont-know', label: 'Opens with something they do not know' },
  { id: 'like-you-move', label: '"Like you" is specific and genuine' },
  { id: 'story-with-scene', label: 'Story has a scene (date, place, dialogue)' },
  { id: 'picks-one-lane', label: 'Picks one lane (not a resume dump)' },
] as const;

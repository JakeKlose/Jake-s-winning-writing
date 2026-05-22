// Coach panel React component. Injected by gmail.ts and linkedin.ts as a
// fixed-position floater next to the compose surface. Reads the compose
// body via a getter (so the panel always sees the latest text), debounces
// typing, calls the service worker for critique + checklist + connection
// angles, and renders the result.
//
// Why a single component for both surfaces: the rules are the same, the
// UI is the same, only the recipient-parse and DOM-attach differ.

import { useEffect, useMemo, useRef, useState } from 'react';
import { buildDeterministicChecklist, MODEL_CHECKS } from '../lib/checklist';
import type {
  ChecklistItem,
  ChecklistResponse,
  ConnectionAngleResponse,
  CritiqueResponse,
  Flag,
  RecipientHints,
} from '../lib/types';

const TYPING_DEBOUNCE_MS = 1500;

interface PanelProps {
  surface: 'gmail' | 'linkedin';
  getBody: () => string;
  getRecipient: () => RecipientHints;
  onClose: () => void;
}

export function CoachPanel({ surface, getBody, getRecipient, onClose }: PanelProps) {
  const [body, setBody] = useState(getBody());
  const [recipient, setRecipient] = useState(getRecipient());
  const [notes, setNotes] = useState('');
  const [flags, setFlags] = useState<Flag[]>([]);
  const [takeaway, setTakeaway] = useState('');
  const [wordCount, setWordCount] = useState(0);
  const [critiquing, setCritiquing] = useState(false);
  const [critiqueError, setCritiqueError] = useState<string | null>(null);
  const [angles, setAngles] = useState<{ headline: string; detail: string }[]>([]);
  const [anglesLoading, setAnglesLoading] = useState(false);
  const [checklistResult, setChecklistResult] = useState<ChecklistItem[] | null>(null);
  const [checklistLoading, setChecklistLoading] = useState(false);

  const deterministicChecks = useMemo(() => buildDeterministicChecklist(body), [body]);

  // Re-read the body and recipient periodically so the panel reflects the
  // current compose state.
  useEffect(() => {
    const tick = setInterval(() => {
      setBody(getBody());
      setRecipient(getRecipient());
    }, 600);
    return () => clearInterval(tick);
  }, [getBody, getRecipient]);

  // Debounced critique on typing-pause.
  const lastCritiquedBody = useRef('');
  useEffect(() => {
    if (!body || body === lastCritiquedBody.current) return;
    const handle = setTimeout(() => {
      void critique();
    }, TYPING_DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, notes]);

  async function critique() {
    if (!body.trim()) return;
    setCritiquing(true);
    setCritiqueError(null);
    lastCritiquedBody.current = body;
    try {
      const response = (await chrome.runtime.sendMessage({
        type: 'critique',
        body,
        recipient: { ...recipient, notes },
        surface,
      })) as CritiqueResponse;
      if (!response.ok) {
        setCritiqueError(response.error);
        return;
      }
      setFlags(response.flags);
      setTakeaway(response.takeaway);
      setWordCount(response.wordCount);
    } catch (err) {
      setCritiqueError((err as Error).message);
    } finally {
      setCritiquing(false);
    }
  }

  async function fetchAngles() {
    if (!recipient.toName && !recipient.toEmail && !notes && !recipient.linkedinUrl) return;
    setAnglesLoading(true);
    try {
      const response = (await chrome.runtime.sendMessage({
        type: 'connectionAngle',
        recipient: { ...recipient, notes },
      })) as ConnectionAngleResponse;
      if (response.ok) setAngles(response.angles);
    } finally {
      setAnglesLoading(false);
    }
  }

  async function runPreSendChecklist() {
    setChecklistLoading(true);
    try {
      const response = (await chrome.runtime.sendMessage({
        type: 'checklist',
        body,
        recipient: { ...recipient, notes },
        surface,
      })) as ChecklistResponse;
      if (response.ok) {
        const modelItems = response.items.map((it) => {
          const def = MODEL_CHECKS.find((m) => m.id === it.id);
          return { ...it, label: def?.label ?? it.id };
        });
        setChecklistResult([...deterministicChecks, ...modelItems]);
      }
    } finally {
      setChecklistLoading(false);
    }
  }

  return (
    <div className="font-sans rounded-lg border border-gray-300 bg-white shadow-xl overflow-hidden max-h-[80vh] flex flex-col text-sm">
      <header className="flex items-center justify-between px-3 py-2 bg-gray-900 text-white">
        <div>
          <strong>Writing Coach</strong>{' '}
          <span className="text-xs opacity-70">({surface})</span>
        </div>
        <button onClick={onClose} className="text-white opacity-70 hover:opacity-100">
          close
        </button>
      </header>

      <section className="px-3 py-2 border-b border-gray-200">
        <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Recipient</div>
        <div className="text-gray-900">
          {recipient.toName || recipient.toEmail || recipient.linkedinUrl || '(parse failed)'}
        </div>
        <textarea
          className="mt-2 w-full border border-gray-200 rounded px-2 py-1 text-xs"
          rows={2}
          placeholder="LinkedIn URL or notes on what you know about them..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </section>

      <section className="px-3 py-2 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wide text-gray-500">Connection angle</div>
          <button
            onClick={fetchAngles}
            disabled={anglesLoading}
            className="text-xs text-blue-700 hover:underline disabled:opacity-50"
          >
            {anglesLoading ? '...' : 'find'}
          </button>
        </div>
        {angles.length === 0 ? (
          <p className="text-xs text-gray-500 mt-1">Click "find" once you've added recipient notes.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {angles.map((a, i) => (
              <li key={i} className="text-xs">
                <strong>{a.headline}.</strong> {a.detail}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="px-3 py-2 border-b border-gray-200 overflow-y-auto flex-1">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wide text-gray-500">
            Live flags {wordCount > 0 ? `(${wordCount} words)` : ''}
          </div>
          {critiquing && <span className="text-xs text-gray-500">critiquing...</span>}
        </div>
        {critiqueError && <div className="text-xs text-coach-critical mt-1">{critiqueError}</div>}
        {takeaway && !critiqueError && (
          <p className="mt-1 text-gray-900 italic">{takeaway}</p>
        )}
        {flags.length === 0 && !critiquing && !critiqueError && body.trim() && (
          <p className="text-xs text-coach-ok mt-1">No flags. Draft is clean.</p>
        )}
        <ul className="mt-2 space-y-2">
          {flags.map((f, i) => (
            <li key={i} className="text-xs border-l-2 pl-2" style={{ borderColor: severityColor(f.severity) }}>
              <div className="font-semibold" style={{ color: severityColor(f.severity) }}>
                {f.ruleName}
              </div>
              {f.quote && (
                <div className="text-gray-700 font-mono mt-0.5">
                  "{f.quote.length > 80 ? f.quote.slice(0, 80) + '…' : f.quote}"
                </div>
              )}
              <div className="text-gray-600 mt-0.5">{f.why}</div>
              {f.suggestion && (
                <div className="text-coach-ok mt-0.5">→ {f.suggestion}</div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="px-3 py-2 bg-gray-50 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wide text-gray-500">Pre-send checklist</div>
          <button
            onClick={runPreSendChecklist}
            disabled={checklistLoading || !body.trim()}
            className="text-xs text-blue-700 hover:underline disabled:opacity-50"
          >
            {checklistLoading ? '...' : 'run'}
          </button>
        </div>
        {checklistResult && (
          <ul className="mt-2 space-y-1">
            {checklistResult.map((it) => (
              <li key={it.id} className="text-xs flex items-start gap-2">
                <span className={it.pass ? 'text-coach-ok' : 'text-coach-critical'}>
                  {it.pass ? '✓' : '✗'}
                </span>
                <span className="flex-1">
                  <span className={it.pass ? 'text-gray-700' : 'text-gray-900 font-semibold'}>{it.label}</span>
                  <span className="text-gray-500"> — {it.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function severityColor(s: Flag['severity']): string {
  if (s === 'critical') return '#b91c1c';
  if (s === 'issue') return '#d97706';
  return '#6b7280';
}

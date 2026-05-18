// Node-side critic API call. Mirrors runInlineCritic in ui/agents.js with the
// same INLINE_CRITIC_INSTRUCTIONS prompt and the same prompt-cached system
// block shape. Keep them in sync.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

const INLINE_CRITIC_INSTRUCTIONS = `You are a writing critic. Read the user's draft below and return STRICT JSON with span-level annotations against the rule library loaded above.

The rule library above is the AUTHORITATIVE source of truth. Every annotation must trace back to a rule in one of the source files in the library. Set \`rule_source\` to the EXACT source path from the library (e.g. "points/named-failure-modes.md" or "skills/em-dash-killer") of the rule you're applying. Do not invent paths; only use paths that appear in the library.

Output schema:

{
  "summary": "1-3 sentences on overall quality and the top one or two issues",
  "intent": "<the writing intent the user gave>",
  "word_count": <integer>,
  "annotations": [
    {
      "quote": "<exact substring from the draft, character-for-character>",
      "rule_id": "<short kebab-case slug for this rule, e.g. 'vague-ask', 'em-dash', 'pick-your-brain'>",
      "rule_source": "<source path from the library, e.g. 'points/named-failure-modes.md' or 'skills/em-dash-killer'>",
      "severity": "high" | "medium" | "low",
      "category": "<human-readable label, e.g. 'Vague ask', 'Em-dash', 'Generic flattery'>",
      "suggested": "<rewrite, or \\"(delete)\\" to cut it>",
      "why": "<one sentence: what the rule says, why the quote breaks it, and the fix>"
    }
  ]
}

Quote rules:
- "quote" MUST be an exact substring of the draft, including punctuation and case. If a word appears multiple times and you want a specific instance, include 2-3 surrounding words for uniqueness.
- Cap at 12 annotations. Prioritize highest severity first; within each severity, prioritize what a reader would most miss on a re-read.
- Severity is your judgment grounded in the rule library: high = clear violation that should block sending; medium = obvious violation but not fatal; low = a nit.
- If the draft is clean, return an empty annotations array and say so in summary.
- Never invent rules that aren't in the library. Never flag minor stylistic preferences.
- Escape backslashes and double-quotes inside JSON string values.

Return ONLY the JSON object. No markdown fences. No commentary outside the JSON.`;

function parseInlineCritic(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const objMatch = candidate.match(/\{[\s\S]*\}/);
  if (!objMatch) {
    return { summary: 'Critic did not return parseable JSON.', annotations: [], intent: null, word_count: 0 };
  }
  try {
    const obj = JSON.parse(objMatch[0]);
    const annotations = Array.isArray(obj.annotations)
      ? obj.annotations
          .filter((a) => a && typeof a.quote === 'string' && typeof a.rule_id === 'string')
          .map((a, i) => ({
            id: `ann-${i}`,
            quote: a.quote,
            rule_id: a.rule_id,
            rule_source: typeof a.rule_source === 'string' ? a.rule_source : '',
            severity: ['high', 'medium', 'low'].includes(a.severity) ? a.severity : 'medium',
            category: typeof a.category === 'string' && a.category ? a.category : a.rule_id,
            suggested: typeof a.suggested === 'string' ? a.suggested : '',
            why: typeof a.why === 'string' ? a.why : '',
          }))
      : [];
    return {
      summary: typeof obj.summary === 'string' ? obj.summary : '',
      intent: obj.intent || null,
      word_count: typeof obj.word_count === 'number' ? obj.word_count : 0,
      annotations,
    };
  } catch {
    return { summary: 'Critic JSON parse failed.', annotations: [], intent: null, word_count: 0 };
  }
}

export async function critique({ apiKey, model, rules, draft, intent }) {
  const system = [
    { type: 'text', text: rules.markdown, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: INLINE_CRITIC_INSTRUCTIONS },
  ];
  const userMessage = `# Intent\n${intent}\n\n# Draft\n\n${draft}\n\n---\n\nReturn the JSON now.`;

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 3000,
      system,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${t.slice(0, 400)}`);
  }
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  const parsed = parseInlineCritic(text);
  return { ...parsed, usage: data.usage || {}, raw: text };
}

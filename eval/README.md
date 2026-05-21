# Eval harness

Regression harness for the inline critic. A golden corpus of drafts with declared expected flags, run against the live Anthropic API with the full rule library loaded. Each case asserts recall and (optionally) a clean-draft tolerance.

The point: **edit a rule in `points/` or `skills/` and know whether it broke anything.** Without this, every rule tweak is a vibes check.

## Run it

```bash
# from the repo root
export ANTHROPIC_API_KEY=sk-ant-...
node eval/run.mjs
```

Exit code is 0 if every case passes its threshold, 1 otherwise. Useful in a pre-commit hook or in CI.

### Env options

| Variable | Default | What |
|---|---|---|
| `ANTHROPIC_API_KEY` | required | Your key |
| `MODEL` | `claude-sonnet-4-6` | Critic model — match what the Coach UI is set to |
| `INTENT` | `cold-email` | Default rule bundle for cases that don't declare their own `intent` (`cold-email`, `exec-memo`, `performance-review`, `op-ed`, `pitch`, `general`) |
| `FILTER` | empty | Only run corpus files whose name contains this substring (e.g. `FILTER=02`) |
| `VERBOSE` | `0` | Dump every annotation per case, not just the summary |

The harness loads the rule library **per case-intent**, caching by intent across the run. A mixed corpus (cold-email + exec-memo + ...) works in a single invocation — each new intent is fetched once, then reused.

### Cost

With prompt caching on the rule-library block, a full 6-case run is roughly **$0.05-0.10** (Sonnet 4.6). First case at each intent pays the cache-write price; subsequent same-intent cases within ~5 minutes pay ~10% on the rule block. Cases that switch intents pay another cache-write on the new bundle.

## Corpus format

Each case in `corpus/` is a JSON file:

```json
{
  "name": "Human-readable name shown in the output",
  "intent": "cold-email | exec-memo | performance-review | op-ed | pitch | general",
  "draft": "The full text the critic will read.",

  "expected_clean": false,
  "min_total_flags": 6,
  "max_flags": 2,
  "recall_threshold": 0.7,

  "expected_flags": [
    {
      "quote_contains": "substring that should appear in the model's quote",
      "categories": ["acceptable category names — match is case-insensitive partial"],
      "min_severity": "low | medium | high",
      "rule_source_prefix": "points/ or skills/ — optional"
    }
  ]
}
```

**Assertions:**
- `expected_clean: true` plus `max_flags: N` — the critic should produce at most N annotations. Tolerates LLM variance.
- `expected_clean: false` plus `min_total_flags: N` — the critic should produce at least N annotations.
- `expected_flags[]` — for each entry, at least one annotation must match all declared constraints. Recall is hits / total expected.
- `recall_threshold: 0.7` — the case passes when recall meets or exceeds this. Default 0.7.

**Matching is forgiving on purpose.** The critic's output varies turn to turn. `quote_contains` is a case-insensitive whitespace-normalized substring match, not exact equality. `categories` is an array of acceptable labels, since the model picks its own category strings within the rule taxonomy.

## What's in the corpus today

| # | Case | Intent | Tests |
|---|---|---|---|
| 01 | Classic bad cold email | cold-email | Stacks every common failure (generic opener, jargon, AI tells, vague ask). Recall ≥ 70% across 8 expected flags. |
| 02 | Clean cold email | cold-email | Tolerates up to 2 noise flags. Catches regressions where the critic starts over-flagging clean drafts. |
| 03 | Vague ask isolated | cold-email | Strong opener and specific personalization, but the ask is vague. Tests that the critic still catches the ask. |
| 04 | Banned words stack | cold-email | Eight banned/jargon words in a short email, but otherwise structurally fine. Tests that banned-jargon.md is being applied. |
| 05 | Credentials dump | cold-email | Pick-a-lane failure: lists three companies, four interest areas, vague job ask. Tests the named-failure-modes catalog (#4, #5). |
| 06 | Exec memo with buried lede | exec-memo | Hedge-stack memo with no TL;DR, unsourced numbers, vague next steps, trailing ask. Tests that `exec-memo-rules.md` is being applied (buried lede, hedge, vague ask, trailing ask) on top of the shared jargon / banned-word checks. |

## Adding a case

1. Create `corpus/NN-short-name.json` (NN keeps the order deterministic)
2. Set `intent` to whichever bundle the case is meant to exercise (`cold-email`, `exec-memo`, `op-ed`, `pitch`, `general`). The harness loads the matching rule bundle for you and caches it across cases sharing the intent.
3. Paste the `draft` text
4. List `expected_flags` — for each known issue, what `quote_contains`, which `categories` are acceptable, what `min_severity`
5. Set `recall_threshold` (default 0.7 is reasonable for most cases; 0.5 for harder ones where the model often misses some flags)
6. Run `FILTER=NN node eval/run.mjs` to dial in the thresholds without spending on every case

## What this does NOT test

- **Refinement chat** — separate harness needed since it's multi-turn and the rewritten output is harder to assert against
- **Cross-model gate** — tested by the existing single-shot+polish pipeline, not the inline critic
- **The full agentic pipeline** — only the inline critic runs here. The pipeline is a different orchestration.
- **Gmail compose extraction** — the content-script DOM selectors live in `extension/content-script.js`; they'd need a Puppeteer-based test against a real Gmail page, which is out of scope for v1.

## Architecture

- `lib/load-rules.mjs` — loads `points/` and `skills/` from disk and assembles the same rule-library markdown the browser builds at runtime
- `lib/critic.mjs` — mirrors `runInlineCritic` from `ui/agents.js`. Two-block system prompt with cache_control on the rule library; JSON-only output contract
- `lib/score.mjs` — recall + clean-tolerance + per-source counts + cost estimate
- `run.mjs` — orchestrator, prints per-case + summary, sets exit code
- `corpus/*.json` — the cases

The prompt in `lib/critic.mjs` is duplicated from `ui/agents.js`. **Keep them in sync** when you edit either. A future cleanup unifies them behind a build step or moves the prompt to a shared `.mjs` module that both sides import.

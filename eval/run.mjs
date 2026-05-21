#!/usr/bin/env node
// Eval harness orchestrator.
//
// Usage (from repo root):
//   ANTHROPIC_API_KEY=sk-ant-... node eval/run.mjs
//
// Options via env vars:
//   MODEL=claude-sonnet-4-6        (or opus-4-7 / haiku-4-5)
//   RECALL_THRESHOLD=0.7           (per-case pass threshold; tests can override)
//   INTENT=cold-email              (which bundle to load)
//   FILTER=01                      (only run cases whose filename contains this)
//   VERBOSE=1                      (dump full annotation list per case)
//
// Exit code 0 if all cases pass, 1 otherwise.

import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRules } from './lib/load-rules.mjs';
import { critique } from './lib/critic.mjs';
import { scoreCase } from './lib/score.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const CORPUS_DIR = join(__dirname, 'corpus');

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY environment variable is not set.');
  console.error('       export ANTHROPIC_API_KEY=sk-ant-...');
  process.exit(2);
}

const model = process.env.MODEL || 'claude-sonnet-4-6';
const intent = process.env.INTENT || 'cold-email';
const filter = process.env.FILTER || '';
const verbose = process.env.VERBOSE === '1';

function fmt(n, w = 4) {
  return String(n).padStart(w);
}

(async () => {
  console.log(`> Winning Writing eval harness`);
  console.log(`> model:    ${model}`);
  console.log(`> intent:   ${intent}`);
  if (filter) console.log(`> filter:   "${filter}"`);
  console.log();

  // Load rules lazily, once per intent encountered in the corpus. The harness
  // historically loaded one bundle for the whole run; that breaks the moment
  // the corpus mixes intents (cold-email + exec-memo + ...).
  const rulesCache = new Map();
  async function rulesFor(intentKey) {
    if (rulesCache.has(intentKey)) return rulesCache.get(intentKey);
    console.log(`> Loading rule library for intent "${intentKey}"…`);
    const r = await loadRules(REPO_ROOT, intentKey);
    console.log(`  ${r.sources.length} sources (${r.pointCount} points + ${r.skillCount} skills)\n`);
    rulesCache.set(intentKey, r);
    return r;
  }
  // Warm the default-intent bundle so the first log appears before case output.
  await rulesFor(intent);

  const allCases = (await readdir(CORPUS_DIR))
    .filter((f) => f.endsWith('.json'))
    .sort();
  const cases = filter ? allCases.filter((f) => f.includes(filter)) : allCases;

  if (cases.length === 0) {
    console.error(`No corpus files matched${filter ? ` filter "${filter}"` : ''}.`);
    process.exit(2);
  }
  console.log(`> Running ${cases.length} case${cases.length === 1 ? '' : 's'}\n`);

  const results = [];
  for (const file of cases) {
    const testCase = JSON.parse(await readFile(join(CORPUS_DIR, file), 'utf-8'));
    const id = file.replace(/\.json$/, '');
    const t0 = Date.now();
    let critiqueResult;
    const caseIntent = testCase.intent || intent;
    const caseRules = await rulesFor(caseIntent);
    try {
      critiqueResult = await critique({ apiKey: API_KEY, model, rules: caseRules, draft: testCase.draft, intent: caseIntent });
    } catch (err) {
      console.log(`[${id}] ${testCase.name}`);
      console.log(`  FAIL — API error: ${err.message}\n`);
      results.push({ id, name: testCase.name, pass: false, error: err.message });
      continue;
    }
    const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);
    const scored = scoreCase(testCase, critiqueResult);

    console.log(`[${id}] ${testCase.name}`);
    console.log(`  recall:     ${scored.hits}/${scored.expectedCount} = ${(scored.recall * 100).toFixed(0)}% (threshold ${(scored.recallThreshold * 100).toFixed(0)}%)`);
    if (scored.misses.length) {
      console.log(`  misses:     ${scored.misses.slice(0, 6).map((m) => `"${m.slice(0, 40)}"`).join(', ')}${scored.misses.length > 6 ? ` (+${scored.misses.length - 6} more)` : ''}`);
    }
    console.log(`  annotations: ${scored.annotationCount} total (${scored.extras} not in expected)`);
    const topSources = Object.entries(scored.sourceCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (topSources.length) {
      console.log(`  sources:    ${topSources.map(([s, n]) => `${s}=${n}`).join(' · ')}`);
    }
    console.log(`  tokens:     ${fmt(scored.inputTokens)} in (${scored.cachedTokens} cache-read, ${scored.cacheCreateTokens} cache-write) / ${fmt(scored.outputTokens)} out`);
    console.log(`  cost:       $${scored.estCostUsd.toFixed(4)}`);
    console.log(`  time:       ${elapsedSec}s`);
    console.log(`  verdict:    ${scored.pass ? 'PASS' : 'FAIL'}${scored.cleanOk ? '' : ' (clean assertion mismatched)'}`);
    if (verbose) {
      console.log(`  annotations dump:`);
      for (const a of critiqueResult.annotations) {
        console.log(`    [${a.severity}] ${a.category} (${a.rule_source}) "${a.quote.slice(0, 60)}"`);
      }
    }
    console.log();

    results.push({ ...scored, id, elapsedSec });
  }

  const passed = results.filter((r) => r.pass).length;
  const totalCost = results.reduce((s, r) => s + (r.estCostUsd || 0), 0);
  const avgRecall = results.filter((r) => typeof r.recall === 'number').reduce((s, r) => s + r.recall, 0) / Math.max(1, results.filter((r) => typeof r.recall === 'number').length);

  console.log(`> ${passed}/${results.length} cases passed`);
  console.log(`> avg recall:  ${(avgRecall * 100).toFixed(1)}%`);
  console.log(`> total cost:  $${totalCost.toFixed(3)}`);

  process.exit(passed === results.length ? 0 : 1);
})().catch((err) => {
  console.error('Eval harness crashed:', err);
  process.exit(2);
});

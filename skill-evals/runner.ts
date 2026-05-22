#!/usr/bin/env tsx
// Skill eval runner. Loads fixtures, invokes each skill, runs deterministic
// matchers, prints a structured report, and exits 0 if all pass / 1 if any
// fail.
//
// Usage:
//   ANTHROPIC_API_KEY=sk-ant-... npm run eval
//   npm run eval -- --skill winning-writing
//   npm run eval -- --skill cold-email --verbose
//
// Env:
//   ANTHROPIC_API_KEY  required
//   MODEL              default: claude-sonnet-4-6
//   SKILLS_DIR         default: ~/.claude/skills (use a fork to test a branch)

import Anthropic from '@anthropic-ai/sdk';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { loadFixtures } from './lib/fixtures.ts';
import { invokeSkill } from './lib/invoke-skill.ts';
import { matchFixture } from './lib/matchers.ts';
import { printPerRuleBreakdown, printSkillResult, printSummary } from './lib/reporter.ts';
import type { Fixture, FixtureResult, SkillName, SkillResult } from './lib/types.ts';

const SKILLS: SkillName[] = ['winning-writing', 'cold-email', 'pm-evaluator', 'pm-prd-drafter'];

function parseArgs(argv: string[]) {
  const args = { skill: undefined as SkillName | undefined, verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--skill' || a === '-s') {
      args.skill = argv[++i] as SkillName;
    } else if (a === '--verbose' || a === '-v') {
      args.verbose = true;
    } else if (a === '--help' || a === '-h') {
      console.log(`Usage: npm run eval [-- --skill <name>] [--verbose]`);
      console.log(`Skills: ${SKILLS.join(', ')}`);
      process.exit(0);
    }
  }
  return args;
}

// Sentinel error: when every fixture would fail the same way (insufficient
// credit, invalid API key, model not available), we throw this to abort
// the run early instead of repeating the same error 105 times.
class FatalApiError extends Error {
  constructor(public summary: string, public detail: string) {
    super(summary);
  }
}

function classifyFatalApiError(message: string): { summary: string; detail: string } | null {
  if (/credit balance is too low/i.test(message)) {
    return {
      summary: 'Insufficient credit balance on the Anthropic API key.',
      detail: 'Top up at https://console.anthropic.com/settings/plans, then re-run.',
    };
  }
  if (/invalid x-api-key|authentication_error/i.test(message)) {
    return {
      summary: 'Anthropic API key is invalid or expired.',
      detail: 'Check ANTHROPIC_API_KEY. Generate a new one at https://console.anthropic.com/settings/keys.',
    };
  }
  if (/model.*not.*found|invalid.*model/i.test(message)) {
    return {
      summary: 'The configured model is not available on this API key.',
      detail: 'Override with MODEL=claude-haiku-4-5-20251001 (or another model your account has access to).',
    };
  }
  if (/rate.?limit/i.test(message)) {
    return {
      summary: 'Anthropic rate limit hit.',
      detail: 'Re-run after the limit window resets, or use a different key.',
    };
  }
  return null;
}

async function runOne(client: Anthropic, model: string, skillsDir: string, fixture: Fixture): Promise<FixtureResult> {
  const t0 = Date.now();
  try {
    const { text } = await invokeSkill({
      client,
      model,
      skillsDir,
      skillName: fixture.skill,
      mode: fixture.mode,
      input: fixture.input,
    });
    const match = matchFixture(fixture, text);
    return { fixture, pass: match.pass, reason: match.reason, output: text, durationMs: Date.now() - t0 };
  } catch (err) {
    const message = (err as Error).message;
    const fatal = classifyFatalApiError(message);
    if (fatal) {
      throw new FatalApiError(fatal.summary, fatal.detail);
    }
    return {
      fixture,
      pass: false,
      reason: `Error: ${message}`,
      output: '',
      durationMs: Date.now() - t0,
    };
  }
}

async function runSkill(client: Anthropic, model: string, skillsDir: string, fixturesDir: string, skill: SkillName): Promise<SkillResult> {
  const fixtures = await loadFixtures(fixturesDir, skill);
  if (fixtures.length === 0) {
    return { skill, results: [], passed: 0, failed: 0, total: 0 };
  }
  console.log(`\nRunning ${fixtures.length} fixture${fixtures.length === 1 ? '' : 's'} for ${skill}...`);
  const results: FixtureResult[] = [];
  for (const f of fixtures) {
    results.push(await runOne(client, model, skillsDir, f));
  }
  return {
    skill,
    results,
    passed: results.filter((r) => r.pass).length,
    failed: results.filter((r) => !r.pass).length,
    total: results.length,
  };
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ERROR: ANTHROPIC_API_KEY is not set.');
    process.exit(2);
  }

  const model = process.env.MODEL ?? 'claude-sonnet-4-6';
  const skillsDir = process.env.SKILLS_DIR ?? join(homedir(), '.claude', 'skills');
  const fixturesDir = join(import.meta.dirname ?? __dirname, 'fixtures');

  const args = parseArgs(process.argv.slice(2));
  const skillsToRun = args.skill ? [args.skill] : SKILLS;

  console.log(`Skill eval suite`);
  console.log(`  model:       ${model}`);
  console.log(`  skills dir:  ${skillsDir}`);
  console.log(`  fixtures:    ${fixturesDir}`);
  console.log(`  skills:      ${skillsToRun.join(', ')}`);

  const client = new Anthropic({ apiKey });
  const allResults: SkillResult[] = [];

  try {
    for (const skill of skillsToRun) {
      const result = await runSkill(client, model, skillsDir, fixturesDir, skill);
      if (result.total > 0) {
        printSkillResult(result, args.verbose);
      }
      allResults.push(result);
    }
  } catch (err) {
    if (err instanceof FatalApiError) {
      console.error('');
      console.error(`Aborting: ${err.summary}`);
      console.error(`         ${(err as FatalApiError).detail}`);
      console.error('');
      console.error('Not a code bug. No fixture re-runs needed once this is resolved.');
      process.exit(2);
    }
    throw err;
  }

  const totals = printSummary(allResults);
  if (args.skill === 'winning-writing') {
    // Per-rule precision is most useful for the rule-rich skill.
    const all = allResults.flatMap((r) => r.results);
    printPerRuleBreakdown(all);
  }

  process.exit(totals.passed === totals.total ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});

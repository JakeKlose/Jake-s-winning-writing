// Pretty-printing for the eval results. One block per skill with pass count,
// pass-rate percentage, and per-fixture status. Verbose mode dumps the full
// model output for every failed case so the user can diff vs. expected.

import type { FixtureResult, SkillResult } from './types.ts';

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  gray: '\x1b[90m',
};

function color(label: 'pass' | 'fail' | 'header' | 'detail', text: string): string {
  if (label === 'pass') return `${ANSI.green}${text}${ANSI.reset}`;
  if (label === 'fail') return `${ANSI.red}${text}${ANSI.reset}`;
  if (label === 'header') return `${ANSI.bold}${text}${ANSI.reset}`;
  return `${ANSI.gray}${text}${ANSI.reset}`;
}

function pad(num: number, width: number): string {
  return String(num).padStart(width);
}

function formatPercent(passed: number, total: number): string {
  if (total === 0) return '0.0%';
  return ((passed / total) * 100).toFixed(1) + '%';
}

export function printSkillResult(result: SkillResult, verbose: boolean): void {
  const summary = `${result.skill}: ${result.passed}/${result.total} (${formatPercent(result.passed, result.total)})`;
  console.log(color('header', summary));

  for (const r of result.results) {
    const statusLabel = r.pass ? color('pass', '  PASS') : color('fail', '  FAIL');
    const id = r.fixture.id.padEnd(40);
    const detail = r.pass ? color('detail', r.reason) : color('fail', r.reason);
    console.log(`${statusLabel}  ${id}  ${detail}`);

    if (verbose && !r.pass) {
      const indent = '         ';
      const lines = r.output.split('\n').slice(0, 20);
      console.log(color('detail', `${indent}--- output (first 20 lines) ---`));
      for (const line of lines) {
        console.log(color('detail', `${indent}${line}`));
      }
      if (r.output.split('\n').length > 20) {
        console.log(color('detail', `${indent}... (${r.output.split('\n').length - 20} more lines)`));
      }
    }
  }
}

export function printSummary(allResults: SkillResult[]): { passed: number; total: number } {
  const totals = allResults.reduce(
    (acc, r) => ({ passed: acc.passed + r.passed, total: acc.total + r.total }),
    { passed: 0, total: 0 },
  );

  console.log();
  console.log(color('header', '── Summary ──'));
  for (const r of allResults) {
    console.log(`  ${r.skill.padEnd(20)} ${pad(r.passed, 3)}/${pad(r.total, 3)}  ${formatPercent(r.passed, r.total)}`);
  }
  console.log();
  const overall = `Overall: ${totals.passed}/${totals.total} (${formatPercent(totals.passed, totals.total)})`;
  if (totals.passed === totals.total) {
    console.log(color('pass', overall));
  } else {
    console.log(color('fail', overall));
  }

  return totals;
}

export function printPerRuleBreakdown(results: FixtureResult[]): void {
  const byRule = new Map<string, { pass: number; fail: number }>();
  for (const r of results) {
    const ruleId =
      'must_flag_rule' in r.fixture.expect && r.fixture.expect.must_flag_rule
        ? r.fixture.expect.must_flag_rule
        : 'must_NOT_flag_rule' in r.fixture.expect && r.fixture.expect.must_NOT_flag_rule
        ? r.fixture.expect.must_NOT_flag_rule
        : null;
    if (!ruleId) continue;
    const slot = byRule.get(ruleId) ?? { pass: 0, fail: 0 };
    if (r.pass) slot.pass++;
    else slot.fail++;
    byRule.set(ruleId, slot);
  }
  if (byRule.size === 0) return;
  console.log();
  console.log(color('header', '── Per-rule precision ──'));
  const sorted = [...byRule.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [ruleId, counts] of sorted) {
    const total = counts.pass + counts.fail;
    console.log(`  ${ruleId.padEnd(35)} ${counts.pass}/${total}  ${formatPercent(counts.pass, total)}`);
  }
}

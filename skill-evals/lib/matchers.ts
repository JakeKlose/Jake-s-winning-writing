// Deterministic matchers for fixture expectations. No LLM-as-judge here —
// every assertion is a substring or regex match against the model's text
// output. Why deterministic: an LLM judge that's wrong 10% of the time
// makes regression signal unreadable. We pay the cost of writing tighter
// fixtures to get cleaner pass/fail.

import type { Fixture, NegativeFixture, PositiveFixture } from './types.ts';

function normalize(text: string): string {
  return text.toLowerCase().replace(/[\s ]+/g, ' ').trim();
}

function containsPhrase(text: string, phrase: string): boolean {
  return normalize(text).includes(normalize(phrase));
}

// "Rule fired" is detected by either the explicit `rule_id:` mention or by the
// rule id appearing in a critique header line. Skills format their output
// differently; both styles count.
function ruleFired(text: string, ruleId: string): boolean {
  const norm = normalize(text);
  const id = normalize(ruleId);
  if (norm.includes(id)) return true;
  // Try kebab-case → spaced match too (some skills convert rule ids to
  // human-readable labels in their output).
  const spaced = id.replace(/-/g, ' ');
  return norm.includes(spaced);
}

function isPositive(fixture: Fixture): fixture is PositiveFixture {
  return 'must_flag_rule' in fixture.expect || 'phrase_in_output' in fixture.expect ||
         'phrases_in_output' in fixture.expect || 'section_present' in fixture.expect;
}

function isNegative(fixture: Fixture): fixture is NegativeFixture {
  return 'must_NOT_flag_rule' in fixture.expect || 'phrase_NOT_in_output' in fixture.expect;
}

export interface MatchResult {
  pass: boolean;
  reason: string;
}

export function matchFixture(fixture: Fixture, output: string): MatchResult {
  if (isPositive(fixture)) {
    return matchPositive(fixture, output);
  }
  if (isNegative(fixture)) {
    return matchNegative(fixture, output);
  }
  return { pass: false, reason: 'Fixture has no expectations declared.' };
}

function matchPositive(fixture: PositiveFixture, output: string): MatchResult {
  const checks: string[] = [];

  if (fixture.expect.must_flag_rule) {
    if (!ruleFired(output, fixture.expect.must_flag_rule)) {
      return {
        pass: false,
        reason: `Expected rule "${fixture.expect.must_flag_rule}" to fire; not found in output.`,
      };
    }
    checks.push(`rule ${fixture.expect.must_flag_rule} fired`);
  }

  if (fixture.expect.phrase_in_output) {
    if (!containsPhrase(output, fixture.expect.phrase_in_output)) {
      return {
        pass: false,
        reason: `Expected phrase "${fixture.expect.phrase_in_output}" in output; not found.`,
      };
    }
    checks.push(`phrase "${fixture.expect.phrase_in_output}" present`);
  }

  if (fixture.expect.phrases_in_output) {
    for (const phrase of fixture.expect.phrases_in_output) {
      if (!containsPhrase(output, phrase)) {
        return {
          pass: false,
          reason: `Expected phrase "${phrase}" in output; not found.`,
        };
      }
    }
    checks.push(`${fixture.expect.phrases_in_output.length} phrases present`);
  }

  if (fixture.expect.section_present) {
    if (!containsPhrase(output, fixture.expect.section_present)) {
      return {
        pass: false,
        reason: `Expected section "${fixture.expect.section_present}" in output; not found.`,
      };
    }
    checks.push(`section "${fixture.expect.section_present}" present`);
  }

  return { pass: true, reason: checks.join('; ') };
}

function matchNegative(fixture: NegativeFixture, output: string): MatchResult {
  const checks: string[] = [];

  if (fixture.expect.must_NOT_flag_rule) {
    if (ruleFired(output, fixture.expect.must_NOT_flag_rule)) {
      return {
        pass: false,
        reason: `Expected rule "${fixture.expect.must_NOT_flag_rule}" NOT to fire; it did.`,
      };
    }
    checks.push(`rule ${fixture.expect.must_NOT_flag_rule} did not fire`);
  }

  if (fixture.expect.phrase_NOT_in_output) {
    if (containsPhrase(output, fixture.expect.phrase_NOT_in_output)) {
      return {
        pass: false,
        reason: `Expected phrase "${fixture.expect.phrase_NOT_in_output}" NOT in output; it was present.`,
      };
    }
    checks.push(`phrase "${fixture.expect.phrase_NOT_in_output}" absent`);
  }

  return { pass: true, reason: checks.join('; ') };
}

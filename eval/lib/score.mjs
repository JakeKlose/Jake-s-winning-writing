// Scoring an eval case against the critic's output.
//
// For each expected_flag the test case declares:
//   { quote_contains, categories?, min_severity?, rule_source_prefix? }
// we look for at least one annotation in the model output that satisfies all
// declared constraints. The test passes when recall ≥ recall_threshold AND
// the expected_clean assertion matches.

const SEVERITY_RANK = { low: 1, medium: 2, high: 3 };

function normalize(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function quoteMatches(annotationQuote, expectedSubstring) {
  return normalize(annotationQuote).includes(normalize(expectedSubstring));
}

function categoryMatches(annotation, categories) {
  if (!categories || categories.length === 0) return true;
  const annCat = normalize(annotation.category);
  const annRuleId = normalize(annotation.rule_id);
  return categories.some((c) => {
    const n = normalize(c);
    return annCat.includes(n) || annRuleId.includes(n) || n.includes(annCat) || n.includes(annRuleId);
  });
}

function severityOk(annotation, minSeverity) {
  if (!minSeverity) return true;
  const rankAnn = SEVERITY_RANK[annotation.severity] || 0;
  const rankMin = SEVERITY_RANK[minSeverity] || 0;
  return rankAnn >= rankMin;
}

function sourceMatches(annotation, sourcePrefix) {
  if (!sourcePrefix) return true;
  return (annotation.rule_source || '').startsWith(sourcePrefix);
}

function matchAnnotation(annotation, expected) {
  return (
    quoteMatches(annotation.quote, expected.quote_contains) &&
    categoryMatches(annotation, expected.categories) &&
    severityOk(annotation, expected.min_severity) &&
    sourceMatches(annotation, expected.rule_source_prefix)
  );
}

export function scoreCase(testCase, critiqueResult) {
  const expected = Array.isArray(testCase.expected_flags) ? testCase.expected_flags : [];
  const annotations = Array.isArray(critiqueResult.annotations) ? critiqueResult.annotations : [];

  const hits = [];
  const misses = [];
  const matchedByExpected = new Map();

  for (const exp of expected) {
    const match = annotations.find((a) => matchAnnotation(a, exp));
    if (match) {
      hits.push({ expected: exp.quote_contains, matched: match.quote });
      matchedByExpected.set(exp, match);
    } else {
      misses.push(exp.quote_contains);
    }
  }

  const sourceCounts = {};
  for (const a of annotations) {
    if (a.rule_source) sourceCounts[a.rule_source] = (sourceCounts[a.rule_source] || 0) + 1;
  }

  const recall = expected.length ? hits.length / expected.length : 1;
  const extras = annotations.length - hits.length;

  // Cost estimate from usage (Sonnet 4.6 indicative rates; adjust if model changes).
  const usage = critiqueResult.usage || {};
  const inputTokens = usage.input_tokens || 0;
  const cachedTokens = usage.cache_read_input_tokens || 0;
  const cacheCreateTokens = usage.cache_creation_input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  // Sonnet 4.6: $3/M in, $15/M out, cache write = 1.25x, cache read = 0.1x of input price.
  const PRICE_IN = 3 / 1_000_000;
  const PRICE_OUT = 15 / 1_000_000;
  const estCostUsd =
    inputTokens * PRICE_IN +
    cacheCreateTokens * PRICE_IN * 1.25 +
    cachedTokens * PRICE_IN * 0.1 +
    outputTokens * PRICE_OUT;

  // Pass/fail conditions
  const recallThreshold = typeof testCase.recall_threshold === 'number' ? testCase.recall_threshold : 0.7;
  const recallOk = recall >= recallThreshold;
  let cleanOk = true;
  if (testCase.expected_clean === true) {
    // Allow up to max_flags noise (default 0) so model variance doesn't
    // false-fail an otherwise clean draft.
    const maxAllowed = typeof testCase.max_flags === 'number' ? testCase.max_flags : 0;
    cleanOk = annotations.length <= maxAllowed;
  } else if (testCase.expected_clean === false && typeof testCase.min_total_flags === 'number') {
    cleanOk = annotations.length >= testCase.min_total_flags;
  }

  const pass = recallOk && cleanOk;

  return {
    name: testCase.name,
    expectedCount: expected.length,
    hits: hits.length,
    misses,
    extras,
    recall,
    annotationCount: annotations.length,
    sourceCounts,
    estCostUsd,
    inputTokens,
    cachedTokens,
    cacheCreateTokens,
    outputTokens,
    pass,
    recallThreshold,
    cleanOk,
  };
}

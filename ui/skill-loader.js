// Skill / point loader.
//
// Fetches the actual rule documents (points/*.md) and skill prompts (skills/*/SKILL.md)
// from disk at runtime and bundles them into a single markdown blob for the inline
// critic. The rule library becomes the model's source of truth — edit a file in
// points/ or skills/, refresh the page, and the critic immediately reflects the new
// rule. No code changes required.
//
// Intent composition (which points/skills each intent loads) comes from the
// canonical bundles.json at the repo root — shared with eval/lib/load-rules.mjs
// and side-panel-coach/lib/skill-loader.js.
//
// Files are cached in module state after the first fetch.

let bundlesPromise = null;

function getBundles() {
  if (!bundlesPromise) {
    bundlesPromise = fetch('../bundles.json').then((r) => {
      if (!r.ok) throw new Error(`Failed to load bundles.json (HTTP ${r.status}) — serve from the repo root.`);
      return r.json();
    });
  }
  return bundlesPromise;
}

const cache = new Map();

async function fetchOrSkip(path) {
  try {
    const r = await fetch(path);
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

// Strip frontmatter from a SKILL.md so we only feed the rule body to the model.
// The YAML frontmatter (name, description, allowed-tools, etc.) is metadata for the
// Claude Code harness, not rule content the critic needs.
function stripFrontmatter(text) {
  if (!text) return '';
  const m = text.match(/^---\n[\s\S]*?\n---\n+/);
  return m ? text.slice(m[0].length) : text;
}

export async function loadRulesForIntent(intent = 'cold-email') {
  const bundles = await getBundles();
  const key = bundles[intent] ? intent : 'general';
  if (cache.has(key)) return cache.get(key);

  const bundle = bundles[key];

  const pointResults = await Promise.all(
    bundle.points.map(async (file) => {
      const text = await fetchOrSkip(`../points/${file}`);
      return text ? { source: `points/${file}`, kind: 'point', body: text } : null;
    })
  );
  const skillResults = await Promise.all(
    bundle.skills.map(async (slug) => {
      const text = await fetchOrSkip(`../skills/${slug}/SKILL.md`);
      return text ? { source: `skills/${slug}`, kind: 'skill', body: stripFrontmatter(text) } : null;
    })
  );

  const sources = [...pointResults, ...skillResults].filter(Boolean);

  let markdown = `# Winning Writing rule library — intent: ${key}\n\nYou are critiquing against the rules below. They are the AUTHORITATIVE source of truth: flag what they say to flag, don't invent rules they don't state. Each rule has a source file path. When you flag an issue, you must set \`rule_source\` to the path of the file that the rule comes from.\n\n## Files in this bundle\n\n`;
  for (const s of sources) markdown += `- \`${s.source}\` (${s.kind})\n`;
  for (const s of sources) {
    markdown += `\n\n---\n\n## Source: \`${s.source}\`\n\n${s.body.trim()}\n`;
  }

  const result = {
    markdown,
    sources: sources.map((s) => s.source),
    pointCount: pointResults.filter(Boolean).length,
    skillCount: skillResults.filter(Boolean).length,
    intent: key,
  };
  cache.set(key, result);
  return result;
}

export function clearRuleCache() {
  cache.clear();
}

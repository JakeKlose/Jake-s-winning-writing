// Loads rule docs (points/*.md) and skill prompts (skills/*/SKILL.md) from the
// filesystem and assembles them into the same markdown blob the browser
// skill-loader.js builds at runtime. Intent composition comes from the canonical
// bundles.json at the repo root — shared with ui/skill-loader.js and
// side-panel-coach/lib/skill-loader.js.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

async function getBundles(repoRoot) {
  return JSON.parse(await readFile(join(repoRoot, 'bundles.json'), 'utf-8'));
}

function stripFrontmatter(text) {
  if (!text) return '';
  const m = text.match(/^---\n[\s\S]*?\n---\n+/);
  return m ? text.slice(m[0].length) : text;
}

async function readOrSkip(path) {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return null;
  }
}

export async function loadRules(repoRoot, intent = 'cold-email') {
  const bundles = await getBundles(repoRoot);
  const key = bundles[intent] ? intent : 'general';
  const bundle = bundles[key];

  const pointResults = await Promise.all(
    bundle.points.map(async (file) => {
      const text = await readOrSkip(join(repoRoot, 'points', file));
      return text ? { source: `points/${file}`, kind: 'point', body: text } : null;
    })
  );
  const skillResults = await Promise.all(
    bundle.skills.map(async (slug) => {
      const text = await readOrSkip(join(repoRoot, 'skills', slug, 'SKILL.md'));
      return text ? { source: `skills/${slug}`, kind: 'skill', body: stripFrontmatter(text) } : null;
    })
  );

  const sources = [...pointResults, ...skillResults].filter(Boolean);

  let markdown = `# Winning Writing rule library — intent: ${key}\n\nYou are critiquing against the rules below. They are the AUTHORITATIVE source of truth: flag what they say to flag, don't invent rules they don't state. Each rule has a source file path. When you flag an issue, you must set \`rule_source\` to the path of the file that the rule comes from.\n\n## Files in this bundle\n\n`;
  for (const s of sources) markdown += `- \`${s.source}\` (${s.kind})\n`;
  for (const s of sources) {
    markdown += `\n\n---\n\n## Source: \`${s.source}\`\n\n${s.body.trim()}\n`;
  }

  return {
    markdown,
    sources: sources.map((s) => s.source),
    pointCount: pointResults.filter(Boolean).length,
    skillCount: skillResults.filter(Boolean).length,
    intent: key,
  };
}

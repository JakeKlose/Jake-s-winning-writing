// Extension build of the rule loader.
//
// In a Chrome extension context we fetch from chrome.runtime.getURL so that
// every rule file is loaded from the extension's bundled rules/ folder. In a
// plain browser tab (used for previewing the side panel as a standalone page
// without installing the extension) we fall back to a relative path under the
// host that's serving the page.
//
// Source of truth lives at ../../ui/skill-loader.js — keep them in sync.

const INTENT_BUNDLES = {
  'cold-email': {
    points: [
      'named-failure-modes.md',
      'banned-jargon.md',
      'cold-email-rules.md',
      'ai-writing-rules.md',
      'core-rules.md',
    ],
    skills: [
      'em-dash-killer',
      'jargon-killer',
      'adverb-killer',
      'be-specific',
      'show-dont-tell',
      'tell-them-something-new',
      'warmth-and-competence',
      'headline-as-claim',
      'kill-redundancy',
      'fun-angle',
      'pick-a-lane',
      'irrelevant-detail-killer',
    ],
  },
  'op-ed': {
    points: ['core-rules.md', 'banned-jargon.md', 'ai-writing-rules.md', 'frameworks.md'],
    skills: [
      'em-dash-killer',
      'jargon-killer',
      'adverb-killer',
      'be-specific',
      'show-dont-tell',
      'headline-as-claim',
      'kill-redundancy',
      'irrelevant-detail-killer',
    ],
  },
  'pitch': {
    points: ['core-rules.md', 'banned-jargon.md', 'ai-writing-rules.md', 'frameworks.md'],
    skills: [
      'em-dash-killer',
      'jargon-killer',
      'adverb-killer',
      'be-specific',
      'headline-as-claim',
      'pick-a-lane',
      'kill-redundancy',
    ],
  },
  'general': {
    points: ['core-rules.md', 'banned-jargon.md', 'ai-writing-rules.md'],
    skills: ['em-dash-killer', 'jargon-killer', 'adverb-killer', 'be-specific', 'show-dont-tell', 'kill-redundancy'],
  },
};

const cache = new Map();
const inExtension = typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function';

function ruleUrl(path) {
  if (inExtension) return chrome.runtime.getURL(`rules/${path}`);
  // Browser-tab fallback: same-origin relative path.
  return `rules/${path}`;
}

async function fetchOrSkip(path) {
  try {
    const r = await fetch(ruleUrl(path));
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

function stripFrontmatter(text) {
  if (!text) return '';
  const m = text.match(/^---\n[\s\S]*?\n---\n+/);
  return m ? text.slice(m[0].length) : text;
}

export async function loadRulesForIntent(intent = 'cold-email') {
  const key = INTENT_BUNDLES[intent] ? intent : 'general';
  if (cache.has(key)) return cache.get(key);

  const bundle = INTENT_BUNDLES[key];

  const pointResults = await Promise.all(
    bundle.points.map(async (file) => {
      const text = await fetchOrSkip(`points/${file}`);
      return text ? { source: `points/${file}`, kind: 'point', body: text } : null;
    })
  );
  const skillResults = await Promise.all(
    bundle.skills.map(async (slug) => {
      const text = await fetchOrSkip(`skills/${slug}/SKILL.md`);
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
    context: inExtension ? 'extension' : 'browser-tab',
  };
  cache.set(key, result);
  return result;
}

export function clearRuleCache() {
  cache.clear();
}

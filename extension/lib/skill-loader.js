// Rule loader for the extension side panel.
//
// Three sources, in priority order based on the user's setting:
//   - 'github'    fetches from raw.githubusercontent.com with cached ETag / TTL
//   - 'bundled'   fetches from chrome.runtime.getURL('rules/...') (the snapshot)
//   - falls back to bundled if github fetch fails for any reason
//
// In a browser tab (preview testing, no chrome.*), uses relative paths to the
// bundled snapshot.
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
    skills: ['em-dash-killer', 'jargon-killer', 'adverb-killer', 'be-specific', 'show-dont-tell', 'headline-as-claim', 'kill-redundancy', 'irrelevant-detail-killer'],
  },
  'pitch': {
    points: ['core-rules.md', 'banned-jargon.md', 'ai-writing-rules.md', 'frameworks.md'],
    skills: ['em-dash-killer', 'jargon-killer', 'adverb-killer', 'be-specific', 'headline-as-claim', 'pick-a-lane', 'kill-redundancy'],
  },
  'general': {
    points: ['core-rules.md', 'banned-jargon.md', 'ai-writing-rules.md'],
    skills: ['em-dash-killer', 'jargon-killer', 'adverb-killer', 'be-specific', 'show-dont-tell', 'kill-redundancy'],
  },
};

const cache = new Map();
const inExtension = typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function';

const DEFAULT_GITHUB_BASE = 'kalyvask/winning-writing/main';
const TTL_MS = 60 * 60 * 1000; // 1 hour; manual Refresh clears the cache

// ----- Settings -----

async function getSettings() {
  if (inExtension && chrome.storage && chrome.storage.local) {
    return new Promise((resolve) => {
      chrome.storage.local.get(['ww-coach.rule-source', 'ww-coach.github-base'], (r) => {
        resolve({
          source: r['ww-coach.rule-source'] || 'bundled',
          githubBase: r['ww-coach.github-base'] || DEFAULT_GITHUB_BASE,
        });
      });
    });
  }
  return {
    source: localStorage.getItem('ww-coach.rule-source') || 'bundled',
    githubBase: localStorage.getItem('ww-coach.github-base') || DEFAULT_GITHUB_BASE,
  };
}

async function getStoredCache() {
  if (inExtension && chrome.storage && chrome.storage.local) {
    return new Promise((resolve) => {
      chrome.storage.local.get(['ww-coach.rule-cache'], (r) => {
        resolve(r['ww-coach.rule-cache'] || {});
      });
    });
  }
  try {
    return JSON.parse(localStorage.getItem('ww-coach.rule-cache') || '{}');
  } catch {
    return {};
  }
}

async function saveStoredCache(c) {
  if (inExtension && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ 'ww-coach.rule-cache': c });
  } else {
    try { localStorage.setItem('ww-coach.rule-cache', JSON.stringify(c)); } catch {}
  }
}

// ----- Fetchers -----

function bundledUrl(path) {
  if (inExtension) return chrome.runtime.getURL(`rules/${path}`);
  return `rules/${path}`;
}

function githubUrl(base, path) {
  // base is like "owner/repo/branch". The points/ and skills/ live at the repo root.
  return `https://raw.githubusercontent.com/${base}/${path}`;
}

async function fetchOrSkip(url, etag) {
  try {
    const headers = etag ? { 'If-None-Match': etag } : {};
    const r = await fetch(url, { headers });
    if (r.status === 304) return { notModified: true };
    if (!r.ok) return null;
    return {
      body: await r.text(),
      etag: r.headers.get('etag') || null,
    };
  } catch {
    return null;
  }
}

// ----- Source-aware load -----

async function loadFromBundled(path) {
  try {
    const r = await fetch(bundledUrl(path));
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

// Returns { body, source: 'github' | 'bundled' | null } for one file.
async function loadOneFile(path, settings, storedCache, freshFetches) {
  if (settings.source === 'github') {
    const cached = storedCache[path];
    const now = Date.now();
    const isFresh = cached && cached.fetchedAt && now - cached.fetchedAt < TTL_MS;
    if (isFresh) return { body: cached.body, source: 'github-cache' };

    const url = githubUrl(settings.githubBase, path);
    const result = await fetchOrSkip(url, cached?.etag);
    if (result?.notModified && cached) {
      freshFetches[path] = { ...cached, fetchedAt: now };
      return { body: cached.body, source: 'github-cache' };
    }
    if (result?.body) {
      freshFetches[path] = { etag: result.etag, body: result.body, fetchedAt: now };
      return { body: result.body, source: 'github' };
    }
    // GitHub failed; fall back to bundled with stale cache as last resort.
    const fallback = await loadFromBundled(path);
    if (fallback) return { body: fallback, source: 'bundled-fallback' };
    if (cached?.body) return { body: cached.body, source: 'github-stale' };
    return { body: null, source: null };
  }
  // 'bundled' (default)
  const body = await loadFromBundled(path);
  return body ? { body, source: 'bundled' } : { body: null, source: null };
}

function stripFrontmatter(text) {
  if (!text) return '';
  const m = text.match(/^---\n[\s\S]*?\n---\n+/);
  return m ? text.slice(m[0].length) : text;
}

export async function loadRulesForIntent(intent = 'cold-email', opts = {}) {
  const key = INTENT_BUNDLES[intent] ? intent : 'general';
  const settings = await getSettings();
  const cacheKey = `${key}::${settings.source}::${settings.githubBase || ''}`;
  if (cache.has(cacheKey) && !opts.forceRefresh) return cache.get(cacheKey);

  const bundle = INTENT_BUNDLES[key];
  const storedCache = settings.source === 'github' ? await getStoredCache() : {};
  const freshFetches = {};

  const allPaths = [
    ...bundle.points.map((f) => ({ path: `points/${f}`, kind: 'point', slug: f })),
    ...bundle.skills.map((s) => ({ path: `skills/${s}/SKILL.md`, kind: 'skill', slug: s })),
  ];

  const results = await Promise.all(
    allPaths.map(async (entry) => {
      const r = await loadOneFile(entry.path, settings, storedCache, freshFetches);
      if (!r.body) return null;
      const body = entry.kind === 'skill' ? stripFrontmatter(r.body) : r.body;
      const sourceLabel = entry.kind === 'skill' ? `skills/${entry.slug.replace(/\/SKILL\.md$/, '')}` : `points/${entry.slug}`;
      return { source: sourceLabel, kind: entry.kind, body, originSource: r.source };
    })
  );
  const sources = results.filter(Boolean);

  // Persist updated cache for github fetches
  if (settings.source === 'github' && Object.keys(freshFetches).length > 0) {
    const merged = { ...storedCache, ...freshFetches };
    await saveStoredCache(merged);
  }

  let markdown = `# Winning Writing rule library — intent: ${key}\n\nYou are critiquing against the rules below. They are the AUTHORITATIVE source of truth: flag what they say to flag, don't invent rules they don't state. Each rule has a source file path. When you flag an issue, you must set \`rule_source\` to the path of the file that the rule comes from.\n\n## Files in this bundle\n\n`;
  for (const s of sources) markdown += `- \`${s.source}\` (${s.kind})\n`;
  for (const s of sources) {
    markdown += `\n\n---\n\n## Source: \`${s.source}\`\n\n${s.body.trim()}\n`;
  }

  const result = {
    markdown,
    sources: sources.map((s) => s.source),
    pointCount: sources.filter((s) => s.kind === 'point').length,
    skillCount: sources.filter((s) => s.kind === 'skill').length,
    intent: key,
    context: inExtension ? 'extension' : 'browser-tab',
    ruleSourceMode: settings.source,
    githubBase: settings.githubBase,
    originBreakdown: sources.reduce((acc, s) => {
      acc[s.originSource] = (acc[s.originSource] || 0) + 1;
      return acc;
    }, {}),
  };
  cache.set(cacheKey, result);
  return result;
}

export function clearRuleCache() {
  cache.clear();
  if (inExtension && chrome.storage && chrome.storage.local) {
    chrome.storage.local.remove('ww-coach.rule-cache');
  } else {
    try { localStorage.removeItem('ww-coach.rule-cache'); } catch {}
  }
}

export async function setRuleSource(source, githubBase) {
  if (inExtension && chrome.storage && chrome.storage.local) {
    const update = { 'ww-coach.rule-source': source };
    if (typeof githubBase === 'string') update['ww-coach.github-base'] = githubBase;
    await new Promise((r) => chrome.storage.local.set(update, r));
  } else {
    localStorage.setItem('ww-coach.rule-source', source);
    if (typeof githubBase === 'string') localStorage.setItem('ww-coach.github-base', githubBase);
  }
  clearRuleCache();
}

export async function getRuleSourceSettings() {
  return getSettings();
}

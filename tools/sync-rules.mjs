#!/usr/bin/env node
// Regenerates the side-panel-coach bundled rule snapshot from the canonical
// sources: bundles.json (intent composition) plus points/*.md and
// skills/*/SKILL.md (rule content).
//
// Usage (from repo root):
//   node tools/sync-rules.mjs           # rewrite the snapshot in place
//   node tools/sync-rules.mjs --check   # verify only; exit 1 on any drift (CI)
//
// The snapshot contains exactly the union of files referenced by bundles.json,
// plus a copy of bundles.json itself. Anything else in the snapshot is removed
// (or reported, in --check mode). Missing canonical files are always an error:
// the extension loader silently drops files it cannot fetch, so a missing
// snapshot file means an intent quietly loses rules.

import { readFile, writeFile, mkdir, rm, readdir, stat } from 'node:fs/promises';
import { join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const snapshotRoot = join(repoRoot, 'side-panel-coach', 'rules');
const checkMode = process.argv.includes('--check');

const problems = [];
const actions = [];

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

async function listFilesRecursive(dir) {
  const out = [];
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listFilesRecursive(full)));
    else out.push(full);
  }
  return out;
}

// ---- Load and validate bundles.json ----

const bundlesRaw = await readFile(join(repoRoot, 'bundles.json'), 'utf-8');
const bundles = JSON.parse(bundlesRaw);

const pointFiles = new Set();
const skillSlugs = new Set();
for (const [intent, bundle] of Object.entries(bundles)) {
  if (intent.startsWith('_')) continue;
  for (const f of bundle.points) pointFiles.add(f);
  for (const s of bundle.skills) skillSlugs.add(s);
}

for (const f of pointFiles) {
  if (!(await exists(join(repoRoot, 'points', f)))) {
    problems.push(`bundles.json references points/${f} which does not exist`);
  }
}
for (const s of skillSlugs) {
  if (!(await exists(join(repoRoot, 'skills', s, 'SKILL.md')))) {
    problems.push(`bundles.json references skills/${s}/SKILL.md which does not exist`);
  }
}
if (problems.length) {
  for (const p of problems) console.error(`ERROR: ${p}`);
  process.exit(1);
}

// ---- Build the expected snapshot file map (relative path -> content) ----

const expected = new Map();
expected.set('bundles.json', bundlesRaw);
for (const f of pointFiles) {
  expected.set(join('points', f), await readFile(join(repoRoot, 'points', f), 'utf-8'));
}
for (const s of skillSlugs) {
  expected.set(join('skills', s, 'SKILL.md'), await readFile(join(repoRoot, 'skills', s, 'SKILL.md'), 'utf-8'));
}

// ---- Compare against what is on disk ----

const actualPaths = (await listFilesRecursive(snapshotRoot)).map((p) =>
  p.slice(snapshotRoot.length + 1)
);

for (const [rel, content] of expected) {
  const full = join(snapshotRoot, rel);
  if (!(await exists(full))) {
    actions.push({ type: 'add', rel, content });
  } else if ((await readFile(full, 'utf-8')) !== content) {
    actions.push({ type: 'update', rel, content });
  }
}
for (const rel of actualPaths) {
  if (!expected.has(rel)) actions.push({ type: 'remove', rel });
}

// ---- Report / apply ----

if (actions.length === 0) {
  console.log(`Snapshot in sync: ${expected.size} files (${pointFiles.size} points, ${skillSlugs.size} skills, bundles.json).`);
  process.exit(0);
}

for (const a of actions) {
  console.log(`${a.type.toUpperCase().padEnd(7)} ${a.rel.split(sep).join('/')}`);
}

if (checkMode) {
  console.error(`\nSnapshot drift: ${actions.length} file(s) out of sync. Run \`node tools/sync-rules.mjs\` and commit the result.`);
  process.exit(1);
}

for (const a of actions) {
  const full = join(snapshotRoot, a.rel);
  if (a.type === 'remove') {
    await rm(full);
    // Clean up the parent dir if the removal emptied it (skill folders).
    // Best-effort: git ignores empty dirs, and OneDrive/AV can briefly lock them.
    const parent = dirname(full);
    if (parent !== snapshotRoot && (await listFilesRecursive(parent)).length === 0) {
      try {
        await rm(parent, { recursive: true, maxRetries: 5, retryDelay: 200 });
      } catch {
        console.warn(`WARN: could not remove empty dir ${parent} (locked?); harmless, git does not track it.`);
      }
    }
  } else {
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, a.content);
  }
}
console.log(`\nApplied ${actions.length} change(s).`);

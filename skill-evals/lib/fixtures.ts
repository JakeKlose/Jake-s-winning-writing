// Load all fixture files for a given skill. Fixture format: JSON array.
// Each skill has positives.json and negatives.json (winning-writing) or
// task-specific files (cold-email/full-emails.json, etc).

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Fixture, SkillName } from './types.ts';

export async function loadFixtures(fixturesDir: string, skill: SkillName): Promise<Fixture[]> {
  const dir = join(fixturesDir, skill);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }

  const fixtures: Fixture[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const body = await readFile(join(dir, entry), 'utf8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch (err) {
      throw new Error(`Failed to parse ${dir}/${entry}: ${(err as Error).message}`);
    }
    if (!Array.isArray(parsed)) {
      throw new Error(`${dir}/${entry} is not a JSON array.`);
    }
    for (const f of parsed) {
      fixtures.push(f as Fixture);
    }
  }

  return fixtures;
}

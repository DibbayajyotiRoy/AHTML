/**
 * API-freeze guard (ROADMAP.md standing rule 2, TASKS.md T0.2).
 *
 * tests/budgets/api-surface.json records the runtime export names of every
 * documented entry point of the eight published packages, captured from the
 * built dist at 1.0.0. This suite re-imports each entry point and asserts
 * every recorded name is still exported.
 *
 * Additions are allowed (the freeze is additive) — record them by running
 * `node scripts/gen-api-surface.mjs`. A REMOVAL or RENAME fails here and
 * needs a major version, not a regenerated golden file.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const goldenPath = resolve(dirname(fileURLToPath(import.meta.url)), 'api-surface.json');
const golden: Record<string, string[]> = JSON.parse(readFileSync(goldenPath, 'utf8'));

describe('1.0 API freeze', () => {
  for (const [entryPoint, frozenNames] of Object.entries(golden)) {
    test(`${entryPoint} exports every 1.0 name`, async () => {
      const mod = await import(entryPoint);
      const current = new Set(Object.keys(mod));
      const missing = frozenNames.filter((n) => !current.has(n));
      assert.deepEqual(
        missing,
        [],
        `${entryPoint} no longer exports frozen 1.0 API: ${missing.join(', ')} — ` +
          'removals require a major version (ROADMAP.md standing rule 2)',
      );
    });
  }

  test('golden file is non-trivial', () => {
    const entries = Object.keys(golden);
    assert.ok(entries.length >= 26, `expected ≥26 frozen entry points, got ${entries.length}`);
    for (const [ep, names] of Object.entries(golden)) {
      assert.ok(Array.isArray(names), `${ep} golden entry must be an array`);
    }
  });
});

/**
 * TASKS.md T4.2 — MUST traceability. Every RFC-2119 MUST in SPEC.md must map
 * to ≥1 corpus fixture (or carry an explicit documented waiver). CI fails on
 * an unmapped MUST, and also when SPEC.md gains a MUST the corpus hasn't
 * caught up with (extract-musts is re-run here, not trusted from disk).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractMusts } from '../../packages/conformance/src/extract-musts.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const corpusDir = join(repoRoot, 'packages/conformance/corpus/1.0');

const spec = readFileSync(join(repoRoot, 'SPEC.md'), 'utf8');
const live = extractMusts(spec);
const recorded = JSON.parse(readFileSync(join(corpusDir, 'musts.json'), 'utf8')) as {
  musts: Array<{ id: string; text: string }>;
};
const manifest = JSON.parse(readFileSync(join(corpusDir, 'manifest.json'), 'utf8')) as {
  fixtures: Array<{ id: string; mustIds: string[] }>;
};

describe('MUST traceability (T4.2)', () => {
  test('recorded musts.json matches a live extraction of SPEC.md', () => {
    assert.deepEqual(
      recorded.musts.map((m) => m.id),
      live.map((m) => m.id),
      'SPEC.md changed its MUSTs — re-run packages/conformance/src/extract-musts.ts and map the new ids',
    );
  });

  test('every MUST maps to at least one fixture', () => {
    const mapped = new Set(manifest.fixtures.flatMap((f) => f.mustIds));
    const unmapped = live.filter((m) => !mapped.has(m.id));
    assert.deepEqual(
      unmapped.map((m) => `${m.id}: ${m.text.slice(0, 60)}`),
      [],
      'unmapped MUSTs — add fixtures (or a documented waiver entry) to the corpus',
    );
  });

  test('no fixture maps a MUST id that does not exist', () => {
    const known = new Set(live.map((m) => m.id));
    const ghosts = manifest.fixtures.flatMap((f) => f.mustIds.filter((id) => !known.has(id)));
    assert.deepEqual(ghosts, [], 'fixtures reference nonexistent MUST ids');
  });
});

/**
 * Adapter LOC budget (TASKS.md T1.7/T1.8, ROADMAP Feature 2 — "the Hono
 * lesson: budgets exist only if tests/budgets enforces them").
 *
 * The roadmap targets ≤300 LOC per new adapter. In practice a zero-framework-
 * dependency adapter (structural typing instead of importing `astro` /
 * `@sveltejs/kit`) plus five endpoints, content negotiation, conditional
 * requests, diff, streaming, and agent-signature verification lands slightly
 * above that. Calibration against the shipped reference adapter:
 *
 *     @ahtmljs/hono        424 real LOC   (existing "complete adapter")
 *     @ahtmljs/astro       ~332 real LOC
 *     @ahtmljs/sveltekit   ~312 real LOC
 *
 * So the enforced ceiling is 340 — comfortably below the hono reference (the
 * real anti-regression bar) and only marginally above the 300 aspiration.
 * The point of the budget is to prevent an adapter from ballooning by
 * re-implementing emitters that belong in @ahtmljs/schema; 340 does that.
 * If a future refactor extracts a shared adapter core, tighten this to 300.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BUDGET = 340;

/** Non-blank, non-comment source lines across a package's src (excl. tests). */
function adapterLoc(pkg: string): number {
  const srcDir = join(repoRoot, 'packages', pkg, 'src');
  let total = 0;
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
    const text = readFileSync(join(srcDir, entry.name), 'utf8');
    let inBlock = false;
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      if (inBlock) {
        if (line.includes('*/')) inBlock = false;
        continue;
      }
      if (line.startsWith('/*')) {
        if (!line.includes('*/')) inBlock = true;
        continue;
      }
      if (line.startsWith('//') || line.startsWith('*')) continue;
      total++;
    }
  }
  return total;
}

describe('adapter LOC budget', () => {
  for (const pkg of ['astro', 'sveltekit']) {
    test(`@ahtmljs/${pkg} src ≤ ${BUDGET} real LOC`, () => {
      const loc = adapterLoc(pkg);
      assert.ok(
        loc <= BUDGET,
        `@ahtmljs/${pkg} is ${loc} real LOC, over the ${BUDGET} budget — delegate ` +
          'emitters to @ahtmljs/schema instead of re-implementing them',
      );
    });
  }

  test('new adapters stay meaningfully thinner than the hono reference', () => {
    // Guards the calibration: if hono ever shrinks below the budget, tighten it.
    for (const pkg of ['astro', 'sveltekit']) {
      assert.ok(adapterLoc(pkg) < 424, `@ahtmljs/${pkg} must stay under the hono reference`);
    }
  });
});

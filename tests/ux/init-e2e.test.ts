/**
 * TASKS.md T3.1–T3.3 — `ahtml init` end to end.
 *
 * Fixture apps are created in a temp dir per test (no vendored node_modules;
 * detection reads package.json + config files only). The e2e asserts the
 * roadmap criteria that are provable offline:
 *   - detection matrix over all five frameworks + unsupported
 *   - happy path: files written, dep added, starter snapshot validateStrict-
 *     clean, wall-clock far under the 10-minute budget
 *   - idempotence: second run → zero changes, exit 0
 *   - unsupported: non-zero exit, names supported frameworks + manual doc,
 *     leaves the tree untouched
 *
 * The real create-next-app + `next dev` + doctor run needs npm-install and a
 * dev server — that lives in CI as a separate networked workflow (see
 * tests/ux/fixtures/init/README.md), not in the offline suite.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validate } from '@ahtmljs/schema';
import {
  detectFramework,
  planInit,
  applyPlan,
  runInit,
  UnsupportedFramework,
} from '../../packages/cli/src/commands/init.js';

function app(deps: Record<string, string>, configFile?: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'ahtml-init-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture', dependencies: deps }, null, 2));
  if (configFile) writeFileSync(join(dir, configFile), 'export default {}\n');
  return dir;
}

/** Recursive path->content map for before/after tree comparison. */
function tree(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (e.isFile()) {
      const full = join(e.parentPath ?? (e as unknown as { path: string }).path, e.name);
      out[full.slice(dir.length + 1)] = readFileSync(full, 'utf8');
    }
  }
  return out;
}

const HOMEPAGE = `<html><head><script type="application/ld+json">
{"@type":"Product","name":"Starter Widget","offers":{"price":9,"priceCurrency":"USD"}}
</script></head><body><h1>Shop</h1></body></html>`;

describe('ahtml init (T3.1 detection)', () => {
  const matrix: Array<[Record<string, string>, string | undefined, string | null]> = [
    [{ next: '^15' }, undefined, 'next'],
    [{ vite: '^6' }, 'vite.config.ts', 'vite'],
    [{ hono: '^4' }, undefined, 'hono'],
    [{ astro: '^5' }, 'astro.config.mjs', 'astro'],
    [{ '@sveltejs/kit': '^2', vite: '^6' }, 'svelte.config.js', 'sveltekit'],
    [{ express: '^4' }, undefined, null],
  ];
  for (const [deps, config, expected] of matrix) {
    test(`detects ${expected ?? 'nothing'} from ${Object.keys(deps).join('+')}`, () => {
      const dir = app(deps, config);
      try {
        assert.equal(detectFramework(dir), expected);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }

  test('sveltekit wins over its vite substrate', () => {
    const dir = app({ '@sveltejs/kit': '^2', vite: '^6' }, 'vite.config.ts');
    try {
      assert.equal(detectFramework(dir), 'sveltekit');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('ahtml init (T3.2 happy path)', () => {
  test('next app: wired files + dep + validateStrict-clean starter, well under budget', async () => {
    const dir = app({ next: '^15' });
    const t0 = performance.now();
    try {
      const plan = planInit(dir, { homepageHtml: HOMEPAGE, siteUrl: 'https://shop.example.com/' });
      applyPlan(dir, plan);
      const elapsed = performance.now() - t0;

      for (const p of [
        'lib/ahtml.ts',
        'app/ahtml/[[...path]]/route.ts',
        'app/.well-known/ahtml.json/route.ts',
        'app/llms.txt/route.ts',
        'app/ahtml/mcp.json/route.ts',
        'lib/ahtml-starter.json',
      ]) {
        assert.ok(existsSync(join(dir, p)), `init must write ${p}`);
      }
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
      assert.ok(pkg.dependencies['@ahtmljs/next'], 'adapter dependency must be added');

      const starter = JSON.parse(readFileSync(join(dir, 'lib/ahtml-starter.json'), 'utf8'));
      const errors = validate(starter).filter((i) => i.severity === 'error');
      assert.deepEqual(errors, [], `starter snapshot must validate: ${JSON.stringify(errors)}`);
      assert.ok(
        starter.entities.some((e: { name?: string }) => e.name === 'Starter Widget'),
        'universal extractor must have extracted the homepage product',
      );
      assert.ok(elapsed < 600_000, `wall-clock ${elapsed}ms must be under the 10-minute budget`);
      assert.ok(elapsed < 5_000, `offline init should be near-instant, took ${elapsed}ms`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('ahtml init (T3.3 idempotence + failure modes)', () => {
  test('second run is a no-op: zero changes, exit 0, identical tree', async () => {
    const dir = app({ next: '^15' });
    try {
      const first = planInit(dir, { homepageHtml: HOMEPAGE });
      applyPlan(dir, first);
      const before = tree(dir);

      const second = planInit(dir, { homepageHtml: HOMEPAGE });
      assert.deepEqual(second.changes, [], 'second plan must contain zero changes');
      assert.equal(second.dependencyAlreadyDeclared, true);
      applyPlan(dir, second);
      assert.deepEqual(tree(dir), before, 'second apply must not alter the tree');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('unsupported framework: throws with supported list + manual doc, writes nothing', () => {
    const dir = app({ express: '^4' });
    try {
      const before = tree(dir);
      assert.throws(
        () => planInit(dir),
        (e: Error) =>
          e instanceof UnsupportedFramework &&
          e.message.includes('next, vite, hono, astro, sveltekit') &&
          e.message.includes('Manual setup:'),
      );
      assert.deepEqual(tree(dir), before, 'failed init must leave the tree exactly as found');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('runInit CLI wrapper returns 1 for unsupported, 0 for supported + no-op rerun', async () => {
    const bad = app({ express: '^4' });
    const good = app({ next: '^15' });
    try {
      assert.equal(await runInit(bad), 1);
      assert.equal(await runInit(good), 0);
      assert.equal(await runInit(good), 0, 'rerun must exit 0 (idempotent)');
    } finally {
      rmSync(bad, { recursive: true, force: true });
      rmSync(good, { recursive: true, force: true });
    }
  });
});

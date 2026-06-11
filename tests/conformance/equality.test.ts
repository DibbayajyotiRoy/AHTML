/**
 * Cross-adapter BYTE-EQUALITY of emitter-derived bodies.
 *
 * All three adapters are configured with the identical fixture (same site,
 * policy, routes, snapshot builder — see harness.ts), so for the same
 * request the emitted bytes must be identical:
 *
 *   - /.well-known/ahtml.json
 *   - /ahtml/mcp.json
 *   - /ahtml/openapi.json
 *   - /llms.txt
 *
 * plus the snapshot endpoint bodies themselves (compact + JSON), which are
 * deterministic here because the fixture pins fetched_at.
 *
 * Normalization: only `generated_at` (an ISO timestamp the well-known
 * emitter mints per request) is replaced with a fixed token before
 * comparison. Base URLs need no normalization — every adapter is configured
 * with the same site and receives requests on the same origin.
 *
 * EXPECTED STATE AT SUITE INTRODUCTION (v0.9.1): @ahtmljs/next and
 * @ahtmljs/hono already share the @ahtmljs/schema emitters and must be
 * byte-equal. @ahtmljs/vite still carries bespoke emitters; its assertions
 * fail until the in-flight emitter consolidation lands and the package is
 * rebuilt — those failures are the proof the consolidation needs.
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeNextAdapter,
  makeViteAdapter,
  makeHonoAdapter,
  warm,
  type AdapterUnderTest,
} from './harness.ts';

const next = makeNextAdapter();
const vite = makeViteAdapter();
const hono = makeHonoAdapter();

/** Replace per-request timestamps that are legitimately variable. */
function normalize(body: string): string {
  return body.replace(/"generated_at":\s*"[^"]*"/g, '"generated_at": "<normalized>"');
}

async function bodyOf(
  adapter: AdapterUnderTest,
  path: string,
  headers?: Record<string, string>,
): Promise<string> {
  const res = await adapter.fetchish(path, headers ? { headers } : undefined);
  assert.equal(res.status, 200, `${adapter.name} ${path} must answer 200 before comparing bodies`);
  return normalize(res.text);
}

const EMITTER_ENDPOINTS = [
  { name: 'well-known manifest', path: '/.well-known/ahtml.json' },
  { name: 'mcp.json', path: '/ahtml/mcp.json' },
  { name: 'openapi.json', path: '/ahtml/openapi.json' },
  { name: 'llms.txt', path: '/llms.txt' },
];

describe('cross-adapter byte-equality', () => {
  before(async () => {
    // The vite adapter emits MCP/OpenAPI lazily from its snapshot cache;
    // warm every adapter identically so the catalogs are comparable.
    await warm(next);
    await warm(vite);
    await warm(hono);
  });

  for (const ep of EMITTER_ENDPOINTS) {
    test(`${ep.name}: next ↔ hono byte-equal`, async () => {
      const a = await bodyOf(next, ep.path);
      const b = await bodyOf(hono, ep.path);
      assert.equal(
        b,
        a,
        `@ahtmljs/hono ${ep.path} drifted from @ahtmljs/next — both must emit via @ahtmljs/schema`,
      );
    });

    test(`${ep.name}: vite ↔ next byte-equal`, async () => {
      const a = await bodyOf(next, ep.path);
      const b = await bodyOf(vite, ep.path);
      assert.equal(
        b,
        a,
        `@ahtmljs/vite ${ep.path} drifted from @ahtmljs/next. ` +
          `Expected once the vite emitter consolidation onto @ahtmljs/schema lands ` +
          `(and @ahtmljs/vite is rebuilt) this byte-equality holds; until then this ` +
          `failure documents the pre-consolidation drift.`,
      );
    });
  }

  // Snapshot endpoint bodies — deterministic because the fixture pins
  // fetched_at, and all adapters serialize via @ahtmljs/schema already.
  test('snapshot compact body: identical across all three adapters', async () => {
    const a = await bodyOf(next, '/ahtml/p/demo');
    const b = await bodyOf(hono, '/ahtml/p/demo');
    const c = await bodyOf(vite, '/ahtml/p/demo');
    assert.equal(b, a, 'hono compact snapshot drifted from next');
    assert.equal(c, a, 'vite compact snapshot drifted from next');
  });

  test('snapshot JSON body: identical across all three adapters', async () => {
    const accept = { accept: 'application/ahtml+json' };
    const a = await bodyOf(next, '/ahtml/p/demo', accept);
    const b = await bodyOf(hono, '/ahtml/p/demo', accept);
    const c = await bodyOf(vite, '/ahtml/p/demo', accept);
    assert.equal(b, a, 'hono JSON snapshot drifted from next');
    assert.equal(c, a, 'vite JSON snapshot drifted from next');
  });

  test('snapshot ETag: identical across all three adapters (content-addressed)', async () => {
    const a = await next.fetchish('/ahtml/p/demo');
    const b = await hono.fetchish('/ahtml/p/demo');
    const c = await vite.fetchish('/ahtml/p/demo');
    assert.ok(a.headers['etag']);
    assert.equal(b.headers['etag'], a.headers['etag']);
    assert.equal(c.headers['etag'], a.headers['etag']);
  });
});

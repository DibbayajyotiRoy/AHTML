/**
 * Unit tests for {@link doctor} — every branch of the discovery chain
 * is exercised against a hand-rolled mock `fetch`. No network, no
 * filesystem, no `node:*` imports beyond the test runner.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot, toJson } from '@ahtmljs/schema';
import { doctor } from '../doctor.js';

const ORIGIN = 'https://shop.example.com';

/** Build a known-good snapshot so the validate/lint paths have something to grade. */
function makeValidSnapshot(): string {
  const s = snapshot(`${ORIGIN}/`, 'home')
    .add({
      type: 'product',
      id: 'product:p1',
      name: 'Test Widget',
      price: { amount: 19.99, currency: 'USD' },
      stock: { status: 'in_stock', quantity: 10 },
    })
    .build();
  return toJson(s);
}

/** Build a snapshot that won't validate — missing `ahtml` field. */
function makeInvalidSnapshotJson(): string {
  return JSON.stringify({
    url: `${ORIGIN}/`,
    fetched_at: new Date().toISOString(),
    page_type: 'home',
    entities: [],
    actions: [],
  });
}

/** Build the well-known manifest body. */
function makeManifest(opts: { mcp?: boolean; openapi?: boolean } = {}): string {
  const endpoints: Record<string, string> = {
    snapshot: `${ORIGIN}/ahtml/{path}`,
    diff_param: 'since',
  };
  if (opts.mcp !== false) endpoints.mcp = `${ORIGIN}/ahtml/mcp.json`;
  if (opts.openapi !== false) endpoints.openapi = `${ORIGIN}/ahtml/openapi.json`;
  return JSON.stringify({
    ahtml: '0.1',
    site: ORIGIN,
    policy: { agents_welcome: true },
    snapshot_url_template: `${ORIGIN}/ahtml/{path}`,
    routes: [],
    endpoints,
    formats: [],
    generated_at: new Date().toISOString(),
  });
}

const MCP_OK = JSON.stringify({
  schema_version: '0.1',
  server: { name: 'shop', url: ORIGIN },
  tools: [],
});

const OPENAPI_OK = JSON.stringify({
  openapi: '3.1.0',
  info: { title: 'shop', version: '0.1.0' },
  paths: {},
});

const LLMS_OK = '# Shop\n\nWelcome to the shop.\n';

/** Build a mock fetch from a routing table keyed by URL. */
function mockFetch(routes: Record<string, { status: number; body: string; ct: string }>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const route = routes[url];
    if (!route) {
      return new Response('not found', { status: 404, statusText: 'Not Found' });
    }
    return new Response(route.body, {
      status: route.status,
      statusText: route.status === 200 ? 'OK' : 'Error',
      headers: { 'content-type': route.ct },
    });
  }) as typeof fetch;
}

describe('doctor()', () => {
  test('all endpoints valid -> every required check is PASS, no FAILs', async () => {
    const fetcher = mockFetch({
      [`${ORIGIN}/.well-known/ahtml.json`]: { status: 200, body: makeManifest(), ct: 'application/json' },
      [`${ORIGIN}/ahtml`]: { status: 200, body: makeValidSnapshot(), ct: 'application/ahtml+json' },
      [`${ORIGIN}/ahtml/mcp.json`]: { status: 200, body: MCP_OK, ct: 'application/json' },
      [`${ORIGIN}/ahtml/openapi.json`]: { status: 200, body: OPENAPI_OK, ct: 'application/json' },
      [`${ORIGIN}/llms.txt`]: { status: 200, body: LLMS_OK, ct: 'text/plain' },
    });
    const report = await doctor(ORIGIN, { fetch: fetcher });
    assert.equal(report.totals.fail, 0, JSON.stringify(report.checks, null, 2));
    // Every primary endpoint should have at least one PASS line.
    const names = report.checks.filter((c) => c.status === 'pass').map((c) => c.name);
    assert.ok(names.some((n) => n.includes('well-known')), 'well-known PASS missing');
    assert.ok(names.some((n) => n.includes('validate')), 'validate PASS missing');
    assert.ok(names.some((n) => n.includes('mcp.json')), 'mcp PASS missing');
    assert.ok(names.some((n) => n.includes('openapi.json')), 'openapi PASS missing');
    assert.ok(names.some((n) => n.includes('llms.txt')), 'llms.txt PASS missing');
  });

  test('missing /.well-known -> FAIL and downstream checks are skipped', async () => {
    const fetcher = mockFetch({
      // No well-known route -> the default 404 fires.
      [`${ORIGIN}/ahtml`]: { status: 200, body: makeValidSnapshot(), ct: 'application/ahtml+json' },
    });
    const report = await doctor(ORIGIN, { fetch: fetcher });
    const wk = report.checks.find((c) => c.name.includes('well-known'));
    assert.ok(wk, 'well-known check missing from report');
    assert.equal(wk.status, 'fail');
    assert.equal(report.totals.fail, 1, 'only the well-known check should FAIL');
    // The remaining checks should be downgraded to warn (skipped), not run.
    assert.ok(
      report.checks.slice(1).every((c) => c.status === 'warn'),
      'downstream checks should be skipped as warnings',
    );
  });

  test('invalid snapshot -> validate check FAILs', async () => {
    const fetcher = mockFetch({
      [`${ORIGIN}/.well-known/ahtml.json`]: { status: 200, body: makeManifest(), ct: 'application/json' },
      [`${ORIGIN}/ahtml`]: { status: 200, body: makeInvalidSnapshotJson(), ct: 'application/ahtml+json' },
      [`${ORIGIN}/ahtml/mcp.json`]: { status: 200, body: MCP_OK, ct: 'application/json' },
      [`${ORIGIN}/ahtml/openapi.json`]: { status: 200, body: OPENAPI_OK, ct: 'application/json' },
      [`${ORIGIN}/llms.txt`]: { status: 200, body: LLMS_OK, ct: 'text/plain' },
    });
    const report = await doctor(ORIGIN, { fetch: fetcher });
    // Either the client itself throws CACHE_POISONED (snapshot fetch FAILs)
    // or our explicit validate step FAILs. Either way, totals.fail > 0.
    assert.ok(report.totals.fail >= 1, JSON.stringify(report.checks, null, 2));
  });

  test('missing /llms.txt -> WARN (not FAIL)', async () => {
    const fetcher = mockFetch({
      [`${ORIGIN}/.well-known/ahtml.json`]: { status: 200, body: makeManifest(), ct: 'application/json' },
      [`${ORIGIN}/ahtml`]: { status: 200, body: makeValidSnapshot(), ct: 'application/ahtml+json' },
      [`${ORIGIN}/ahtml/mcp.json`]: { status: 200, body: MCP_OK, ct: 'application/json' },
      [`${ORIGIN}/ahtml/openapi.json`]: { status: 200, body: OPENAPI_OK, ct: 'application/json' },
      // /llms.txt intentionally omitted -> 404
    });
    const report = await doctor(ORIGIN, { fetch: fetcher });
    const llms = report.checks.find((c) => c.name.includes('llms.txt'));
    assert.ok(llms, 'llms.txt check missing');
    assert.equal(llms.status, 'warn', 'llms.txt must downgrade to warn when missing');
    assert.equal(report.totals.fail, 0, 'no FAILs when only llms.txt is absent');
  });
});

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { snapshot } from '@ahtmljs/schema';
import { mountAHTML, type AHTMLHonoConfig } from '../index.js';

/**
 * Regression tests on the REAL Hono router. The mock in hono.test.ts
 * dispatches exact-path-first, which masked a registration-order bug:
 * real Hono runs matching handlers in registration order and stops at the
 * first returned Response, so a /ahtml/* wildcard registered before
 * /ahtml/mcp.json and /ahtml/openapi.json swallows both catalog routes.
 */

const buildConfig = (): AHTMLHonoConfig => ({
  site: 'https://shop.example.com',
  policy: { agents_welcome: true, rate_limit: '1000/min' },
  default_ttl: 60,
  routes: [
    { path: '/', page_type: 'home' },
    { path: '/p/demo', page_type: 'product_detail' },
  ],
  async snapshotBuilder(segments, req) {
    if (segments[0] === 'unknown') return null;
    if (segments[0] === 'p') {
      return snapshot(req.url, 'product_detail')
        .add({
          id: 'product:demo',
          type: 'product',
          name: 'Demo',
          price: { amount: 1, currency: 'USD' },
        })
        .build();
    }
    return snapshot(req.url, 'home').build();
  },
});

describe('mountAHTML on the real Hono router', () => {
  test('/ahtml/mcp.json is NOT shadowed by the /ahtml/* wildcard', async () => {
    const app = new Hono();
    mountAHTML(app, buildConfig());

    const res = await app.request('https://shop.example.com/ahtml/mcp.json');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.server?.name, 'ahtml', 'should be the MCP catalog, not a snapshot 404');
    assert.ok(Array.isArray(body.tools));
  });

  test('/ahtml/openapi.json is NOT shadowed by the /ahtml/* wildcard', async () => {
    const app = new Hono();
    mountAHTML(app, buildConfig());

    const res = await app.request('https://shop.example.com/ahtml/openapi.json');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.openapi?.startsWith('3.1'), 'should be the OpenAPI doc, not a snapshot 404');
  });

  test('the wildcard still serves page snapshots', async () => {
    const app = new Hono();
    mountAHTML(app, buildConfig());

    const res = await app.request('https://shop.example.com/ahtml/p/demo');
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('etag'));
    const text = await res.text();
    assert.ok(text.includes('product:demo'));
  });

  test('well-known and llms.txt resolve', async () => {
    const app = new Hono();
    mountAHTML(app, buildConfig());

    const wk = await app.request('https://shop.example.com/.well-known/ahtml.json');
    assert.equal(wk.status, 200);
    const llms = await app.request('https://shop.example.com/llms.txt');
    assert.equal(llms.status, 200);
  });
});

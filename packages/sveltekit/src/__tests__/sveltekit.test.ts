/**
 * @ahtmljs/sveltekit unit tests (TASKS.md T1.8). Adapter-specific behavior
 * (hook pass-through, emitter toggles); the end-to-end flow is covered by
 * tests/ux/adapter-matrix-sveltekit.test.ts.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot } from '@ahtmljs/schema';
import {
  ahtmlHandle,
  createAHTMLRoutes,
  extractSnapshot,
  type AHTMLSvelteKitConfig,
} from '@ahtmljs/sveltekit';

const SITE = 'https://svelte.example.com';
const config: AHTMLSvelteKitConfig = {
  site: SITE,
  policy: { agents_welcome: true, license: 'MIT' },
  default_ttl: 60,
  routes: [
    { path: '/', page_type: 'home' },
    { path: '/p/demo', page_type: 'product_detail' },
  ],
  snapshotBuilder: (segments) =>
    segments.join('/') === 'p/demo'
      ? snapshot(`${SITE}/p/demo`, 'product_detail')
          .fetchedAt('2026-01-01T00:00:00.000Z')
          .add({ id: 'product:demo', type: 'product', name: 'Demo' })
          .build()
      : snapshot(`${SITE}/`, 'home').fetchedAt('2026-01-01T00:00:00.000Z').build(),
};

const SENTINEL = new Response('__passthrough__', { status: 418 });
function drive(path: string, init?: { method?: string; headers?: Record<string, string> }) {
  const request = new Request(new URL(path, SITE).toString(), init);
  return ahtmlHandle(config)({ event: { request }, resolve: async () => SENTINEL });
}

describe('@ahtmljs/sveltekit', () => {
  test('hook passes non-AHTML paths through to resolve()', async () => {
    const res = await drive('/about');
    assert.equal(res.status, 418);
    assert.equal(await res.text(), '__passthrough__');
  });

  test('hook passes non-GET/HEAD methods through', async () => {
    const res = await drive('/ahtml/p/demo', { method: 'POST' });
    assert.equal(res.status, 418);
  });

  test('createAHTMLRoutes exposes all five fetch handlers', () => {
    const routes = createAHTMLRoutes(config);
    for (const key of ['snapshot', 'wellKnown', 'mcp', 'openapi', 'llmsTxt'] as const) {
      assert.equal(typeof routes[key], 'function', key);
    }
  });

  test('snapshot route defaults to compact with ETag + Vary: Accept', async () => {
    const res = await drive('/ahtml/p/demo');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /application\/ahtml\+text/);
    assert.ok(res.headers.get('etag'));
    assert.match(res.headers.get('vary') ?? '', /accept/i);
  });

  test('JSON negotiation + If-None-Match → 304', async () => {
    const first = await drive('/ahtml/p/demo', { headers: { accept: 'application/ahtml+json' } });
    assert.match(first.headers.get('content-type') ?? '', /application\/ahtml\+json/);
    const etag = first.headers.get('etag')!;
    const second = await drive('/ahtml/p/demo', {
      headers: { accept: 'application/ahtml+json', 'if-none-match': etag },
    });
    assert.equal(second.status, 304);
  });

  test('HEAD mirrors GET status with empty body', async () => {
    const res = await drive('/ahtml/p/demo', { method: 'HEAD' });
    assert.equal(res.status, 200);
    assert.equal(await res.text(), '');
  });

  test('emit_mcp:false stops serving /ahtml/mcp.json as an MCP document', async () => {
    const request = new Request(new URL('/ahtml/mcp.json', SITE).toString());
    const res = await ahtmlHandle({ ...config, emit_mcp: false })({
      event: { request },
      resolve: async () => SENTINEL,
    });
    // The path falls through to the snapshot handler (same as @ahtmljs/hono's
    // /ahtml/* wildcard), so it is no longer the MCP tool catalog. With the
    // emitter on it would be application/json; off, the snapshot handler owns it.
    assert.notEqual(res.status, 418, 'must not pass through — /ahtml/* is owned');
    assert.doesNotMatch(res.headers.get('content-type') ?? '', /application\/json/);
  });

  test('well-known manifest reflects the policy', async () => {
    const res = await drive('/.well-known/ahtml.json');
    const manifest = JSON.parse(await res.text());
    assert.equal(manifest.policy?.agents_welcome ?? manifest.agents_welcome, true);
  });

  test('extractSnapshot runs the universal extractor', () => {
    const html = `<script type="application/ld+json">{"@type":"Product","name":"Bottle","sku":"B1"}</script>`;
    const snap = extractSnapshot(`${SITE}/p/bottle`, html, 'product_detail');
    assert.equal(snap.page_type, 'product_detail');
    assert.ok(snap.entities.some((e) => e.type === 'product'));
  });
});

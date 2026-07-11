/**
 * @ahtmljs/astro unit tests (TASKS.md T1.7). Adapter-specific behavior;
 * the end-to-end extract→sign→serve→consume flow is covered by the shared
 * matrix in tests/ux/adapter-matrix-astro.test.ts.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot } from '@ahtmljs/schema';
import {
  ahtml,
  createAHTMLRoutes,
  handleAHTMLRequest,
  snapshotFromHtml,
  type AHTMLAstroConfig,
} from '@ahtmljs/astro';

const SITE = 'https://astro.example.com';
const config: AHTMLAstroConfig = {
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

function req(path: string, headers?: Record<string, string>): Request {
  return new Request(new URL(path, SITE).toString(), { headers });
}

describe('@ahtmljs/astro', () => {
  test('ahtml() returns an Astro integration with a hook', () => {
    const integration = ahtml({ ...config });
    assert.equal(integration.name, '@ahtmljs/astro');
    assert.ok(integration.hooks, 'integration exposes hooks');
  });

  test('createAHTMLRoutes exposes all five endpoint pairs with GET + HEAD', () => {
    const routes = createAHTMLRoutes(config);
    for (const key of ['wellKnown', 'snapshot', 'mcp', 'openapi', 'llmsTxt'] as const) {
      assert.equal(typeof routes[key].GET, 'function', `${key}.GET`);
      assert.equal(typeof routes[key].HEAD, 'function', `${key}.HEAD`);
    }
  });

  test('handleAHTMLRequest returns null for non-AHTML paths', async () => {
    assert.equal(await handleAHTMLRequest(req('/about'), config), null);
  });

  test('snapshot route defaults to compact with ETag and Vary: Accept', async () => {
    const res = await handleAHTMLRequest(req('/ahtml/p/demo'), config);
    assert.ok(res);
    assert.equal(res!.status, 200);
    assert.match(res!.headers.get('content-type') ?? '', /application\/ahtml\+text/);
    assert.ok(res!.headers.get('etag'));
    assert.match(res!.headers.get('vary') ?? '', /accept/i);
  });

  test('If-None-Match yields 304', async () => {
    const first = await handleAHTMLRequest(req('/ahtml/p/demo', { accept: 'application/ahtml+json' }), config);
    const etag = first!.headers.get('etag')!;
    const second = await handleAHTMLRequest(
      req('/ahtml/p/demo', { accept: 'application/ahtml+json', 'if-none-match': etag }),
      config,
    );
    assert.equal(second!.status, 304);
  });

  test('HEAD mirrors GET headers with an empty body', async () => {
    const head = await handleAHTMLRequest(
      new Request(new URL('/ahtml/p/demo', SITE).toString(), { method: 'HEAD' }),
      config,
    );
    assert.equal(head!.status, 200);
    assert.equal(await head!.text(), '');
  });

  test('well-known manifest reflects the policy', async () => {
    const res = await handleAHTMLRequest(req('/.well-known/ahtml.json'), config);
    const manifest = JSON.parse(await res!.text());
    assert.equal(manifest.policy?.agents_welcome ?? manifest.agents_welcome, true);
  });

  test('snapshotFromHtml runs the universal extractor', () => {
    const html = `<script type="application/ld+json">{"@type":"Product","name":"Bottle","sku":"B1"}</script>`;
    const snap = snapshotFromHtml(`${SITE}/p/bottle`, html, 'product_detail');
    assert.equal(snap.page_type, 'product_detail');
    assert.ok(snap.entities.some((e) => e.type === 'product'));
  });
});

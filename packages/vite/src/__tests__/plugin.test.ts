import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot } from '@ahtmljs/schema';
import { ahtml } from '../index.js';

/** Minimal mock of the Node `req`/`res` Vite middleware passes. */
function makeReqRes(url: string, opts: { headers?: Record<string, string>; method?: string } = {}) {
  const sentHeaders: Record<string, string> = {};
  const state = { body: '', ended: false };
  const req = { url, method: opts.method ?? 'GET', headers: { ...(opts.headers ?? {}) } };
  const res = {
    statusCode: 200,
    setHeader(k: string, v: string) { sentHeaders[k.toLowerCase()] = v; },
    end(b?: string | null) { state.body = b ?? ''; state.ended = true; },
  };
  return {
    req,
    res,
    get body() { return state.body; },
    get headers() { return sentHeaders; },
    get ended() { return state.ended; },
  };
}

type Handler = (req: object, res: object, next: () => void) => void | Promise<void>;

const builder = async (segments: string[], req: { url: string }) => {
  if (segments[0] === 'p') {
    return snapshot(req.url, 'product_detail')
      .ttl(60)
      .add({ id: 'product:demo', type: 'product', name: 'Demo', price: { amount: 1, currency: 'USD' } })
      .build();
  }
  if (segments[0] === 'unknown') return null;
  return snapshot(req.url, 'home').build();
};

function registerPlugin(pluginConfig: Parameters<typeof ahtml>[0]): Handler {
  const p = ahtml(pluginConfig);
  let captured: Handler | undefined;
  p.configureServer!({ middlewares: { use: (h) => { captured = h as Handler; } } });
  if (!captured) throw new Error('plugin did not register handler');
  return captured;
}

describe('@ahtmljs/vite plugin', () => {
  test('plugin has name and configureServer', () => {
    const p = ahtml({ site: 'https://x.com', buildSnapshot: builder });
    assert.equal(p.name, '@ahtmljs/vite');
    assert.equal(typeof p.configureServer, 'function');
  });

  test('registered handler responds 200 + compact body to /ahtml/p', async () => {
    const handler = registerPlugin({ site: 'https://x.com', buildSnapshot: builder });
    const r = makeReqRes('/ahtml/p');
    let nextCalled = false;
    await handler(r.req, r.res, () => { nextCalled = true; });
    assert.equal(nextCalled, false, 'should NOT fall through to next() — plugin handled it');
    assert.equal(r.res.statusCode, 200);
    assert.match(r.body, /^@ahtml 0\.1/m);
    assert.match(r.body, /^\[product:demo\]/m);
    assert.match(r.headers['content-type'] ?? '', /application\/ahtml\+text/);
  });

  test('Accept: application/ahtml+json returns JSON', async () => {
    const handler = registerPlugin({ site: 'https://x.com', buildSnapshot: builder });
    const r = makeReqRes('/ahtml/p', { headers: { accept: 'application/ahtml+json' } });
    await handler(r.req, r.res, () => {});
    const parsed = JSON.parse(r.body);
    assert.equal(parsed.entities[0].id, 'product:demo');
  });

  test('/.well-known/ahtml.json returns site manifest', async () => {
    const handler = registerPlugin({
      site: 'https://x.com',
      policy: { agents_welcome: true, license: 'MIT' },
      routes: [{ path: '/p', page_type: 'product_detail' }],
      buildSnapshot: builder,
    });
    const r = makeReqRes('/.well-known/ahtml.json');
    await handler(r.req, r.res, () => {});
    const manifest = JSON.parse(r.body);
    assert.equal(manifest.ahtml, '0.1');
    assert.equal(manifest.site, 'https://x.com');
    assert.ok(manifest.routes?.length === 1);
    assert.equal(manifest.routes[0].snapshot_url, 'https://x.com/ahtml/p');
  });

  test('/llms.txt emits Jeremy-Howard convention markdown', async () => {
    const handler = registerPlugin({
      site: 'https://x.com',
      policy: { agents_welcome: true, contact: 'agents@x.com' },
      routes: [{ path: '/p', page_type: 'product_detail' }],
      buildSnapshot: builder,
    });
    const r = makeReqRes('/llms.txt');
    await handler(r.req, r.res, () => {});
    assert.match(r.headers['content-type'] ?? '', /text\/markdown/);
    assert.match(r.body, /^# x\.com$/m);
    assert.match(r.body, /agents@x\.com/);
    assert.match(r.body, /## Pages/);
  });

  test('returns 404 when builder returns null', async () => {
    const handler = registerPlugin({ site: 'https://x.com', buildSnapshot: builder });
    const r = makeReqRes('/ahtml/unknown');
    await handler(r.req, r.res, () => {});
    assert.equal(r.res.statusCode, 404);
  });

  test('returns 403 when policy.agents_welcome is false', async () => {
    const handler = registerPlugin({ site: 'https://x.com', policy: { agents_welcome: false }, buildSnapshot: builder });
    const r = makeReqRes('/ahtml/p');
    await handler(r.req, r.res, () => {});
    assert.equal(r.res.statusCode, 403);
    assert.equal(JSON.parse(r.body).error, 'agents_not_welcome');
  });

  test('If-None-Match matching the etag returns 304', async () => {
    const handler = registerPlugin({ site: 'https://x.com', buildSnapshot: builder });
    const r1 = makeReqRes('/ahtml/p');
    await handler(r1.req, r1.res, () => {});
    const etag = r1.headers['etag'];
    assert.ok(etag);
    const r2 = makeReqRes('/ahtml/p', { headers: { 'if-none-match': etag! } });
    await handler(r2.req, r2.res, () => {});
    assert.equal(r2.res.statusCode, 304);
    assert.equal(r2.body, '');
  });

  test('non-ahtml routes call next() — plugin does not hijack the request', async () => {
    const handler = registerPlugin({ site: 'https://x.com', buildSnapshot: builder });
    let nextCalled = false;
    const r = makeReqRes('/some/regular/page');
    await handler(r.req, r.res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  });

  test('/ahtml/openapi.json emits an OpenAPI 3.1 document (regression: v0.4.0)', async () => {
    const handler = registerPlugin({ site: 'https://x.com', buildSnapshot: builder });
    // Warm the cache so the OpenAPI emitter has something to describe.
    await handler(makeReqRes('/ahtml/p').req, makeReqRes('/ahtml/p').res, () => {});
    const warm = makeReqRes('/ahtml/p');
    await handler(warm.req, warm.res, () => {});
    const r = makeReqRes('/ahtml/openapi.json');
    await handler(r.req, r.res, () => {});
    assert.equal(r.res.statusCode, 200);
    assert.match(r.headers['content-type'] ?? '', /application\/json/);
    const doc = JSON.parse(r.body) as { openapi: string; info: { version: string } };
    assert.equal(doc.openapi, '3.1.0');
    assert.equal(doc.info.version, '1.0.0');
  });

  test('honors Accept q-values (regression: v0.4.0)', async () => {
    const handler = registerPlugin({ site: 'https://x.com', buildSnapshot: builder });
    const r = makeReqRes('/ahtml/p', {
      headers: { accept: 'application/ahtml+text;q=0.1, application/ahtml+json;q=0.9' },
    });
    await handler(r.req, r.res, () => {});
    assert.match(r.headers['content-type'] ?? '', /application\/ahtml\+json/);
  });
});

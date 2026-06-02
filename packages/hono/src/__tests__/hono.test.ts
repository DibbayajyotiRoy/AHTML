import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot } from '@ahtmljs/schema';
import {
  mountAHTML,
  type HonoAppLike,
  type HonoHandler,
  type AHTMLHonoConfig,
} from '../index.js';

/**
 * A mock Hono-like app. Records every `(method, path) → handler`
 * registration so we can invoke handlers directly with mock Requests.
 *
 * We do NOT depend on the `hono` package: this verifies the structural
 * contract that lets `@ahtmljs/hono` run on any Hono-shaped router
 * (and on the real Hono in production).
 */
class MockHono implements HonoAppLike {
  routes: Map<string, { method: string; handler: HonoHandler }[]> = new Map();

  get(path: string, handler: HonoHandler): this {
    this.register('GET', path, handler);
    return this;
  }
  all(path: string, handler: HonoHandler): this {
    this.register('ALL', path, handler);
    return this;
  }

  private register(method: string, path: string, handler: HonoHandler) {
    const list = this.routes.get(path) ?? [];
    list.push({ method, handler });
    this.routes.set(path, list);
  }

  /**
   * Find the first handler registered for `(method, path)`. The `ALL`
   * handler matches every method, so we also fall back to it.
   */
  pick(method: string, path: string): HonoHandler {
    const list = this.routes.get(path);
    if (!list) throw new Error(`no route for ${method} ${path}`);
    const exact = list.find((r) => r.method === method);
    if (exact) return exact.handler;
    const wildcard = list.find((r) => r.method === 'ALL');
    if (wildcard) return wildcard.handler;
    throw new Error(`no handler for ${method} ${path}`);
  }

  async invoke(method: string, path: string, url: string, init?: RequestInit): Promise<Response> {
    const handler = this.pick(method, path);
    const req = new Request(url, { method, ...init });
    return await handler({ req: { raw: req } });
  }
}

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

describe('mountAHTML route registration', () => {
  test('registers all expected GET routes on the Hono app', () => {
    const app = new MockHono();
    mountAHTML(app, buildConfig());

    assert.ok(app.routes.has('/ahtml/*'), '/ahtml/* should be mounted');
    assert.ok(
      app.routes.has('/.well-known/ahtml.json'),
      '/.well-known/ahtml.json should be mounted',
    );
    assert.ok(app.routes.has('/ahtml/mcp.json'), '/ahtml/mcp.json should be mounted');
    assert.ok(
      app.routes.has('/ahtml/openapi.json'),
      '/ahtml/openapi.json should be mounted',
    );
    assert.ok(app.routes.has('/llms.txt'), '/llms.txt should be mounted');
  });

  test('omits MCP and OpenAPI routes when disabled', () => {
    const app = new MockHono();
    mountAHTML(app, { ...buildConfig(), emit_mcp: false, emit_openapi: false });
    assert.equal(app.routes.has('/ahtml/mcp.json'), false);
    assert.equal(app.routes.has('/ahtml/openapi.json'), false);
    // The snapshot + well-known + llms.txt routes stay.
    assert.ok(app.routes.has('/ahtml/*'));
    assert.ok(app.routes.has('/.well-known/ahtml.json'));
    assert.ok(app.routes.has('/llms.txt'));
  });

  test('returns the same app instance for chaining', () => {
    const app = new MockHono();
    const ret = mountAHTML(app, buildConfig());
    assert.equal(ret, app);
  });
});

describe('snapshot endpoint behavior', () => {
  test('GET /ahtml/p — 200 with compact text by default', async () => {
    const app = new MockHono();
    mountAHTML(app, buildConfig());
    const res = await app.invoke('GET', '/ahtml/*', 'https://shop.example.com/ahtml/p');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /application\/ahtml\+text/);
    const body = await res.text();
    assert.match(body, /^@ahtml 0\.1/m);
    assert.match(body, /\[product:demo\]/);
  });

  test('GET /ahtml/p — JSON when Accept: application/ahtml+json', async () => {
    const app = new MockHono();
    mountAHTML(app, buildConfig());
    const res = await app.invoke(
      'GET',
      '/ahtml/*',
      'https://shop.example.com/ahtml/p',
      { headers: { accept: 'application/ahtml+json' } },
    );
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /application\/ahtml\+json/);
    const parsed = JSON.parse(await res.text());
    assert.equal(parsed.ahtml, '0.1');
    assert.equal(parsed.entities[0].id, 'product:demo');
  });

  test('GET /ahtml/unknown — 404 when the builder returns null', async () => {
    const app = new MockHono();
    mountAHTML(app, buildConfig());
    const res = await app.invoke(
      'GET',
      '/ahtml/*',
      'https://shop.example.com/ahtml/unknown',
    );
    assert.equal(res.status, 404);
  });

  test('Conditional GET: If-None-Match returns 304', async () => {
    const app = new MockHono();
    mountAHTML(app, buildConfig());
    const first = await app.invoke(
      'GET',
      '/ahtml/*',
      'https://shop.example.com/ahtml/p',
    );
    const etag = first.headers.get('etag')!;
    const second = await app.invoke(
      'GET',
      '/ahtml/*',
      'https://shop.example.com/ahtml/p',
      { headers: { 'if-none-match': etag } },
    );
    assert.equal(second.status, 304);
    assert.equal(second.headers.get('etag'), etag);
    assert.equal((await second.text()).length, 0);
  });

  test('emits ETag + Cache-Control + Last-Modified + Vary + x-ahtml-version', async () => {
    const app = new MockHono();
    mountAHTML(app, buildConfig());
    const res = await app.invoke('GET', '/ahtml/*', 'https://shop.example.com/ahtml/p');
    assert.match(res.headers.get('etag') ?? '', /^W\/"/);
    assert.match(res.headers.get('cache-control') ?? '', /max-age=\d+/);
    assert.ok(res.headers.get('last-modified'));
    assert.equal(res.headers.get('x-ahtml-version'), '0.1');
    assert.match(res.headers.get('vary') ?? '', /Accept/);
  });

  test('HEAD /ahtml/* mirrors GET headers with an empty body', async () => {
    const app = new MockHono();
    mountAHTML(app, buildConfig());
    const get = await app.invoke('GET', '/ahtml/*', 'https://shop.example.com/ahtml/p');
    const head = await app.invoke('HEAD', '/ahtml/*', 'https://shop.example.com/ahtml/p');
    assert.equal(head.status, get.status);
    assert.equal(head.headers.get('etag'), get.headers.get('etag'));
    assert.equal((await head.text()).length, 0);
  });
});

describe('emitter endpoints', () => {
  test('/.well-known/ahtml.json returns the manifest', async () => {
    const app = new MockHono();
    mountAHTML(app, buildConfig());
    const res = await app.invoke(
      'GET',
      '/.well-known/ahtml.json',
      'https://shop.example.com/.well-known/ahtml.json',
    );
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /application\/json/);
    const manifest = JSON.parse(await res.text());
    assert.equal(manifest.site, 'https://shop.example.com');
    assert.ok(Array.isArray(manifest.routes));
    assert.ok(manifest.policy);
  });

  test('/ahtml/mcp.json returns an MCP catalog', async () => {
    const app = new MockHono();
    mountAHTML(app, buildConfig());
    const res = await app.invoke(
      'GET',
      '/ahtml/mcp.json',
      'https://shop.example.com/ahtml/mcp.json',
    );
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /application\/json/);
    const m = JSON.parse(await res.text());
    assert.ok(m.server);
    assert.equal(m.server.name, 'ahtml');
    assert.ok(Array.isArray(m.tools));
  });

  test('/ahtml/openapi.json returns an OpenAPI document', async () => {
    const app = new MockHono();
    mountAHTML(app, buildConfig());
    const res = await app.invoke(
      'GET',
      '/ahtml/openapi.json',
      'https://shop.example.com/ahtml/openapi.json',
    );
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /application\/json/);
    const doc = JSON.parse(await res.text());
    assert.equal(typeof doc.openapi, 'string');
  });

  test('/llms.txt returns markdown', async () => {
    const app = new MockHono();
    mountAHTML(app, buildConfig());
    const res = await app.invoke('GET', '/llms.txt', 'https://shop.example.com/llms.txt');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/markdown/);
    const body = await res.text();
    assert.ok(body.length > 0);
  });
});

describe('policy enforcement', () => {
  test('returns 403 when agents_welcome is false', async () => {
    const app = new MockHono();
    mountAHTML(app, {
      site: 'x',
      policy: { agents_welcome: false },
      snapshotBuilder: (_segs, req) => snapshot(req.url, 'home').build(),
    });
    const res = await app.invoke('GET', '/ahtml/*', 'https://shop.example.com/ahtml/');
    assert.equal(res.status, 403);
    const body = JSON.parse(await res.text());
    assert.equal(body.error, 'agents_not_welcome');
  });
});

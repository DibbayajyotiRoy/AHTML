/**
 * Shared conformance harness for the three AHTML framework adapters.
 *
 * Every adapter is stood up with the SAME fixture (same site, same policy,
 * same routes, same snapshot builder) and wrapped behind one tiny interface:
 *
 *   adapter.fetchish(path, { headers }) → { status, headers, body, text }
 *
 * so the conformance + equality suites can assert wire behavior without
 * knowing which framework is underneath.
 *
 * Adapters are imported from their BUILT dist via package names
 * (@ahtmljs/next, @ahtmljs/vite, @ahtmljs/hono) — the suite tests what ships,
 * not the working tree.
 */

import {
  snapshot,
  type Snapshot,
  type Policy,
} from '@ahtmljs/schema';

import { createAHTMLRoute } from '@ahtmljs/next/handler';
import { createWellKnownRoute } from '@ahtmljs/next/well-known';
import { createMcpRoute } from '@ahtmljs/next/mcp';
import { createOpenApiRoute } from '@ahtmljs/next/openapi';
import { createLlmsTxtRoute } from '@ahtmljs/next/llms-txt';

import { ahtml as ahtmlVitePlugin } from '@ahtmljs/vite';

import {
  mountAHTML,
  type HonoAppLike,
  type HonoHandler,
} from '@ahtmljs/hono';

// ---------------------------------------------------------------------------
// Shared fixture
// ---------------------------------------------------------------------------

export const SITE = 'https://conformance.example.com';

export const POLICY: Policy = {
  agents_welcome: true,
  rate_limit: '1000/min',
  license: 'MIT',
  contact: 'agents@conformance.example.com',
};

export const ROUTES = [
  { path: '/', page_type: 'home' },
  { path: '/p/demo', page_type: 'product_detail' },
  { path: '/docs/guide', page_type: 'document' },
];

export const DEFAULT_TTL = 60;

/** Pinned so Last-Modified (and snapshot bodies) are deterministic. */
export const FETCHED_AT = '2026-01-01T00:00:00.000Z';

/**
 * Pure snapshot builder for the static fixture paths. Ignores the request
 * on purpose: snapshot URLs are canonical (site + page path), so the same
 * bytes come out of every adapter and every transport.
 */
export function buildFixtureSnapshot(segments: string[]): Snapshot | null {
  const key = segments.join('/');

  if (key === '') {
    return snapshot(`${SITE}/`, 'home').fetchedAt(FETCHED_AT).build();
  }

  if (key === 'p/demo') {
    return snapshot(`${SITE}/p/demo`, 'product_detail')
      .fetchedAt(FETCHED_AT)
      .add({
        id: 'product:demo',
        type: 'product',
        name: 'Demo',
        price: { amount: 1999, currency: 'USD' },
      })
      .action({
        id: 'purchase',
        target: 'product:demo',
        category: 'transact',
        method: 'POST',
        execute_url: '/api/checkout',
        auth: 'required',
        cost: { amount: 1999, currency: 'USD', category: 'purchase' },
        reversible: { reversible: true, window: 'P30D', policy: 'full_refund' },
        side_effects: ['charge_card', 'email_buyer'],
        confirmation: 'required',
        input: { type: 'object', properties: { sku: { type: 'string' } } },
      })
      .build();
  }

  if (key === 'docs/guide') {
    return snapshot(`${SITE}/docs/guide`, 'document')
      .fetchedAt(FETCHED_AT)
      .add({
        id: 'document:guide',
        type: 'document',
        name: 'Integration Guide',
        title: 'Integration Guide',
        summary: 'How to integrate the demo product.',
        word_count: 1200,
        tags: ['guide'],
      })
      .build();
  }

  return null;
}

/**
 * Stateful fixture: `/ahtml/counter` changes content on every build, which
 * is what lets the `?since=<etag>` diff path return a non-empty change list
 * deterministically. Each adapter instance gets its own counter.
 */
export interface Fixture {
  buildSnapshot(segments: string[]): Snapshot | null;
}

export function makeFixture(): Fixture {
  let counter = 0;
  return {
    buildSnapshot(segments: string[]): Snapshot | null {
      if (segments.join('/') === 'counter') {
        counter += 1;
        return snapshot(`${SITE}/counter`, 'product_detail')
          .fetchedAt(FETCHED_AT)
          .add({ id: 'product:counter', type: 'product', name: `Rev ${counter}` })
          .build();
      }
      return buildFixtureSnapshot(segments);
    },
  };
}

/**
 * Snapshot catalog used by the MCP/OpenAPI emitters. Matches what
 * @ahtmljs/hono synthesizes internally by replaying the builder over the
 * declared routes — same snapshots, same order.
 */
export function catalogSnapshots(): Snapshot[] {
  return ROUTES.map((r) => {
    const segments = r.path.replace(/^\/+/, '').split('/').filter(Boolean);
    const s = buildFixtureSnapshot(segments);
    if (!s) throw new Error(`fixture route ${r.path} did not build`);
    return s;
  });
}

// ---------------------------------------------------------------------------
// Common adapter interface
// ---------------------------------------------------------------------------

/** Wire features an adapter may legitimately lack (see README.md). */
export type WireFeature = 'stream' | 'content-encoding';

export interface ConformanceResponse {
  status: number;
  /** Response headers with lowercase names. */
  headers: Record<string, string>;
  /** Raw body bytes (compressed bodies stay compressed). */
  body: Uint8Array;
  /** Body decoded as UTF-8 (garbage for compressed bodies — use `body`). */
  text: string;
}

export interface AdapterUnderTest {
  name: 'next' | 'vite' | 'hono';
  /**
   * Features this adapter has never supported. Only populated when the
   * adapter's own test suite + source prove the feature never existed;
   * each entry is documented in tests/conformance/README.md.
   */
  unsupported: ReadonlySet<WireFeature>;
  fetchish(
    path: string,
    init?: { headers?: Record<string, string> },
  ): Promise<ConformanceResponse>;
}

export interface AdapterOptions {
  /** Override the fixture policy (e.g. `{ agents_welcome: false }`). */
  policy?: Policy;
}

/** Warm an adapter's snapshot cache over every declared route. The Vite
 *  adapter emits MCP/OpenAPI lazily from its snapshot cache, so the catalog
 *  endpoints are only comparable after a warm-up pass. Harmless elsewhere. */
export async function warm(adapter: AdapterUnderTest): Promise<void> {
  for (const r of ROUTES) {
    const suffix = r.path === '/' ? '/' : r.path;
    await adapter.fetchish(`/ahtml${suffix}`);
  }
}

async function fromFetchResponse(res: Response): Promise<ConformanceResponse> {
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v;
  });
  const body = new Uint8Array(await res.arrayBuffer());
  return {
    status: res.status,
    headers,
    body,
    text: new TextDecoder().decode(body),
  };
}

// ---------------------------------------------------------------------------
// Next.js adapter
// ---------------------------------------------------------------------------

export function makeNextAdapter(opts: AdapterOptions = {}): AdapterUnderTest {
  const config = {
    site: SITE,
    policy: opts.policy ?? POLICY,
    default_ttl: DEFAULT_TTL,
    routes: ROUTES,
  };
  const fixture = makeFixture();

  const snapshotRoute = createAHTMLRoute(
    (segments: string[]) => fixture.buildSnapshot(segments),
    config,
  );
  const wellKnownRoute = createWellKnownRoute(config);
  const mcpRoute = createMcpRoute(() => catalogSnapshots());
  const openApiRoute = createOpenApiRoute(() => catalogSnapshots());
  const llmsTxtRoute = createLlmsTxtRoute(undefined, config);

  return {
    name: 'next',
    unsupported: new Set<WireFeature>(),
    async fetchish(path, init) {
      const url = new URL(path, SITE);
      const req = new Request(url.toString(), { headers: init?.headers });

      let res: Response;
      if (url.pathname === '/.well-known/ahtml.json') {
        res = await wellKnownRoute.GET(req);
      } else if (url.pathname === '/llms.txt') {
        res = await llmsTxtRoute.GET(req);
      } else if (url.pathname === '/ahtml/mcp.json') {
        // In a real app this is its own route file (app/ahtml/mcp.json/route.ts),
        // which Next matches before the [...path] catch-all.
        res = await mcpRoute.GET(req);
      } else if (url.pathname === '/ahtml/openapi.json') {
        res = await openApiRoute.GET(req);
      } else if (url.pathname === '/ahtml' || url.pathname.startsWith('/ahtml/')) {
        const segments = url.pathname
          .replace(/^\/ahtml\/?/, '')
          .split('/')
          .filter(Boolean);
        res = await snapshotRoute.GET(req, {
          params: Promise.resolve({ path: segments.length ? segments : undefined }),
        });
      } else {
        throw new Error(`next harness: no route for ${url.pathname}`);
      }
      return fromFetchResponse(res);
    },
  };
}

// ---------------------------------------------------------------------------
// Vite adapter
// ---------------------------------------------------------------------------

type ViteMiddleware = (
  req: object,
  res: object,
  next: () => void,
) => void | Promise<void>;

export function makeViteAdapter(opts: AdapterOptions = {}): AdapterUnderTest {
  const fixture = makeFixture();
  const plugin = ahtmlVitePlugin({
    site: SITE,
    policy: opts.policy ?? POLICY,
    default_ttl: DEFAULT_TTL,
    routes: ROUTES,
    buildSnapshot: (segments: string[]) => fixture.buildSnapshot(segments),
  });

  let middleware: ViteMiddleware | undefined;
  plugin.configureServer!({
    middlewares: {
      use: (h: ViteMiddleware) => {
        middleware = h;
      },
    },
  });
  if (!middleware) throw new Error('vite harness: plugin did not register middleware');

  return {
    name: 'vite',
    // Proven never-supported by packages/vite/src/__tests__/plugin.test.ts +
    // the plugin source (no NDJSON streaming, no Accept-Encoding compression).
    // Documented in tests/conformance/README.md.
    unsupported: new Set<WireFeature>(['stream', 'content-encoding']),
    async fetchish(path, init) {
      const sentHeaders: Record<string, string> = {};
      let bodyText = '';
      let nextCalled = false;

      const req = {
        url: path,
        method: 'GET',
        headers: { ...(init?.headers ?? {}) },
      };
      const res = {
        statusCode: 200,
        setHeader(k: string, v: string) {
          sentHeaders[k.toLowerCase()] = v;
        },
        end(b?: string | null) {
          bodyText = b ?? '';
        },
      };

      await middleware!(req, res, () => {
        nextCalled = true;
      });
      if (nextCalled) {
        // The plugin deliberately passes non-AHTML paths to the next
        // middleware; surface that as a distinct status so tests fail loudly
        // if a conformance path was not handled.
        return { status: 599, headers: {}, body: new Uint8Array(), text: '' };
      }
      const body = new TextEncoder().encode(bodyText);
      return { status: res.statusCode, headers: sentHeaders, body, text: bodyText };
    },
  };
}

// ---------------------------------------------------------------------------
// Hono adapter
// ---------------------------------------------------------------------------

/**
 * Minimal Hono-shaped router, dispatching the same way the package's own
 * tests do (packages/hono/src/__tests__/hono.test.ts): exact path first,
 * then the `/ahtml/*` wildcard. The real `hono` package is not a dependency
 * of this repo, so we cannot run `app.request()` here.
 *
 * NOTE for integrators: real Hono composes matching routes in registration
 * order, and `mountAHTML` registers `/ahtml/*` BEFORE `/ahtml/mcp.json` —
 * see README.md ("Hono route-shadowing caveat").
 */
class HonoShim implements HonoAppLike {
  private gets = new Map<string, HonoHandler>();
  private alls = new Map<string, HonoHandler>();

  get(path: string, handler: HonoHandler): this {
    if (!this.gets.has(path)) this.gets.set(path, handler);
    return this;
  }
  all(path: string, handler: HonoHandler): this {
    if (!this.alls.has(path)) this.alls.set(path, handler);
    return this;
  }

  pick(method: string, pathname: string): HonoHandler {
    const table = method === 'GET' ? this.gets : this.alls;
    const exact = table.get(pathname);
    if (exact) return exact;
    if (pathname === '/ahtml' || pathname.startsWith('/ahtml/')) {
      const wildcard = table.get('/ahtml/*');
      if (wildcard) return wildcard;
    }
    throw new Error(`hono harness: no route for ${method} ${pathname}`);
  }
}

export function makeHonoAdapter(opts: AdapterOptions = {}): AdapterUnderTest {
  const fixture = makeFixture();
  const app = new HonoShim();
  mountAHTML(app, {
    site: SITE,
    policy: opts.policy ?? POLICY,
    default_ttl: DEFAULT_TTL,
    routes: ROUTES,
    snapshotBuilder: (segments: string[]) => fixture.buildSnapshot(segments),
  });

  return {
    name: 'hono',
    unsupported: new Set<WireFeature>(),
    async fetchish(path, init) {
      const url = new URL(path, SITE);
      const handler = app.pick('GET', url.pathname);
      const req = new Request(url.toString(), { headers: init?.headers });
      const res = await handler({ req: { raw: req } });
      return fromFetchResponse(res);
    },
  };
}

// ---------------------------------------------------------------------------
// All three, same fixture
// ---------------------------------------------------------------------------

export function allAdapters(opts: AdapterOptions = {}): AdapterUnderTest[] {
  return [makeNextAdapter(opts), makeViteAdapter(opts), makeHonoAdapter(opts)];
}

/** True when this runtime's CompressionStream can produce brotli. Node ≤22
 *  cannot; the br conformance test is skipped there (see README.md). */
export function runtimeSupportsBrotli(): boolean {
  try {
    new (CompressionStream as unknown as new (f: string) => unknown)('br');
    return true;
  } catch {
    return false;
  }
}

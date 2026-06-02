/**
 * @ahtmljs/hono — Hono adapter for AHTML.
 *
 * Mounts the full AHTML surface on any Hono app: snapshot endpoint with
 * content negotiation + conditional GET + diff replies + streaming, the
 * well-known manifest, MCP and OpenAPI emitters, and llms.txt.
 *
 * Edge-first: this module never imports from `node:*` and never imports
 * `hono` itself. Hono is an *optional* peer dependency and is supplied by
 * the caller; we only need a tiny structural slice of its surface
 * (`get(path, handler)` and `all(path, handler)`). That keeps the package
 * runnable on Cloudflare Workers, Deno, Bun, AWS Lambda, and Node ≥20.
 *
 * Quickstart (Cloudflare Workers):
 *
 *   import { Hono } from 'hono';
 *   import { mountAHTML } from '@ahtmljs/hono';
 *   import { snapshot } from '@ahtmljs/schema';
 *
 *   const app = new Hono();
 *
 *   mountAHTML(app, {
 *     site: 'https://shop.example.com',
 *     policy: { agents_welcome: true, rate_limit: '100/min' },
 *     routes: [{ path: '/', page_type: 'home' }],
 *     async snapshotBuilder(segments, req) {
 *       if (segments[0] === 'p') {
 *         return snapshot(req.url, 'product_detail')
 *           .add({ id: 'product:demo', type: 'product', name: 'Demo' })
 *           .build();
 *       }
 *       return snapshot(req.url, 'home').build();
 *     },
 *   });
 *
 *   export default app;
 */

import {
  toJson,
  toCompact,
  computeEtag,
  diff,
  toStreamResponse,
  chooseEncoding,
  compressStream,
  compressBuffer,
  STREAM_CONTENT_TYPE,
  buildWellKnown,
  snapshotsToMcp,
  snapshotsToOpenApi,
  buildLlmsTxt,
  chooseFormat,
  type Snapshot,
  type Policy,
  type Encoding,
} from '@ahtmljs/schema';

/**
 * A structural subset of the Hono `Hono` app surface. We only need to
 * register GET handlers (and `.all` for HEAD); everything else flows
 * through the standard `Request` / `Response` pair. Defining the type
 * structurally lets `mountAHTML` work against any Hono major version (and
 * any Hono-shaped router) without taking on a runtime dependency.
 */
export interface HonoAppLike {
  get(path: string, handler: HonoHandler): unknown;
  all?(path: string, handler: HonoHandler): unknown;
}

/**
 * Minimal context Hono passes to handlers. We accept either the real
 * Hono `Context` (which exposes `.req.raw: Request`) or a plain object
 * carrying a `Request`. Both shapes are handled in {@link toRequest}.
 */
export interface HonoContextLike {
  req?: { raw?: Request; url?: string };
}

/**
 * Handler signature compatible with Hono. Returning a `Response` is
 * always valid in Hono v3+.
 */
export type HonoHandler = (
  c: HonoContextLike,
  next?: () => Promise<void>,
) => Response | Promise<Response>;

/**
 * Builds the `Snapshot` for a given path. The first arg is the
 * path-segments array taken from the request URL beneath `/ahtml/`. Return
 * `null` to produce a 404. Synchronous and async are both accepted.
 */
export type HonoSnapshotBuilder = (
  pathSegments: string[],
  req: Request,
) => Promise<Snapshot | null> | Snapshot | null;

/**
 * Per-mount configuration. Mirrors `AHTMLConfig` from `@ahtmljs/next` so
 * users moving between frameworks keep the same mental model.
 */
export interface AHTMLHonoConfig {
  /** Canonical site URL — used in the well-known manifest and MCP server id. */
  site: string;
  /** Default policy applied to snapshots that don't set their own. */
  policy?: Policy;
  /** Default TTL in seconds applied to snapshots that don't set their own. */
  default_ttl?: number;
  /** Routes published in `/.well-known/ahtml.json`. */
  routes?: Array<{ path: string; page_type: string }>;
  /** Emit `/ahtml/mcp.json`. Defaults to true. */
  emit_mcp?: boolean;
  /** Emit `/ahtml/openapi.json`. Defaults to true. */
  emit_openapi?: boolean;
  /** Build the snapshot for the requested path. Required. */
  snapshotBuilder: HonoSnapshotBuilder;
  /**
   * Optional source of every snapshot used by the MCP and OpenAPI
   * emitters. If omitted, the adapter falls back to invoking
   * `snapshotBuilder` once per declared route in `config.routes` to
   * synthesize the catalog at request time.
   */
  getAllSnapshots?: () => Snapshot[] | Promise<Snapshot[]>;
  /**
   * Force the snapshot endpoint to emit NDJSON streams. Same semantics
   * as the Next.js adapter: `true` always streams, a number is the
   * "entities+actions ≥ N" threshold, `false` (default) never streams.
   * Clients can also opt-in via `Accept: application/ahtml+json-seq`.
   */
  stream?: boolean | number;
}

/**
 * Mount AHTML routes on an existing Hono app.
 *
 * Routes registered:
 *
 *   GET  /ahtml/*              snapshot for `/ahtml/<segments>`
 *   HEAD /ahtml/*              mirrors GET headers (empty body)
 *   GET  /.well-known/ahtml.json   well-known manifest
 *   GET  /ahtml/mcp.json       MCP tool catalog (when `emit_mcp !== false`)
 *   GET  /ahtml/openapi.json   OpenAPI document (when `emit_openapi !== false`)
 *   GET  /llms.txt             plaintext routes catalog
 *
 * The same `app` instance is returned for chaining.
 */
export function mountAHTML(app: HonoAppLike, config: AHTMLHonoConfig): HonoAppLike {
  const snapshotHandler = makeSnapshotHandler(config);

  app.get('/ahtml/*', snapshotHandler);
  // HEAD: Hono routes by method; `.all` covers HEAD when present. If the
  // host app doesn't expose `.all`, callers can register HEAD themselves
  // using `app.on('HEAD', ...)`; we fall back to a no-op there.
  if (typeof app.all === 'function') {
    app.all('/ahtml/*', async (c, next) => {
      const req = toRequest(c);
      if (req.method !== 'HEAD') {
        if (next) await next();
        // If no next available, fall through with a 404 — Hono will
        // continue to the next matching route otherwise.
        return new Response(null, { status: 404 });
      }
      const res = await snapshotHandler(c);
      return new Response(null, { status: res.status, headers: res.headers });
    });
  }

  app.get('/.well-known/ahtml.json', (c) => {
    const _req = toRequest(c);
    void _req;
    const manifest = buildWellKnown({
      site: config.site,
      policy: config.policy,
      routes: config.routes,
      emit_mcp: config.emit_mcp,
      emit_openapi: config.emit_openapi,
    });
    return jsonResponse(manifest, {
      'cache-control': 'public, max-age=300, must-revalidate',
      'x-ahtml-version': '0.1',
    });
  });

  if (config.emit_mcp !== false) {
    app.get('/ahtml/mcp.json', async (c) => {
      const req = toRequest(c);
      const url = new URL(req.url);
      const snaps = await collectSnapshots(config, req);
      const m = snapshotsToMcp(
        { name: 'ahtml', url: `${url.protocol}//${url.host}` },
        snaps,
      );
      return jsonResponse(m, {
        'cache-control': 'public, max-age=300, must-revalidate',
        'x-ahtml-version': '0.1',
      });
    });
  }

  if (config.emit_openapi !== false) {
    app.get('/ahtml/openapi.json', async (c) => {
      const req = toRequest(c);
      const url = new URL(req.url);
      const snaps = await collectSnapshots(config, req);
      const doc = snapshotsToOpenApi(
        { title: 'AHTML', baseUrl: `${url.protocol}//${url.host}` },
        snaps,
      );
      return jsonResponse(doc, {
        'cache-control': 'public, max-age=300, must-revalidate',
        'x-ahtml-version': '0.1',
      });
    });
  }

  app.get('/llms.txt', (c) => {
    const _req = toRequest(c);
    void _req;
    const body = buildLlmsTxt({
      site: config.site,
      description: config.policy?.contact
        ? `Agents welcome — contact: ${config.policy.contact}`
        : undefined,
      routes: config.routes ?? [],
    });
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        'cache-control': 'public, max-age=300',
      },
    });
  });

  return app;
}

// ---------------------------------------------------------------------------
// Snapshot endpoint
// ---------------------------------------------------------------------------

/** Per-instance snapshot cache used to answer `?since=<etag>` diffs. */
const _cache = new Map<string, Snapshot>();

function makeSnapshotHandler(config: AHTMLHonoConfig): HonoHandler {
  return async (c: HonoContextLike): Promise<Response> => {
    const req = toRequest(c);

    const policyDecision = enforcePolicy(req, config);
    if (policyDecision.deny) return policyDecision.response;

    const url = new URL(req.url);
    const segments = pathSegmentsUnderAhtml(url.pathname);

    let snap: Snapshot | null;
    try {
      snap = await config.snapshotBuilder(segments, req);
    } catch (err) {
      return errorResponse(500, 'snapshot_build_failed', err);
    }
    if (!snap) {
      return errorResponse(404, 'no_snapshot', `no snapshot for /${segments.join('/')}`);
    }

    snap = ensureDefaults(snap, config);

    const etag = snap.etag ?? computeEtag(snap);
    snap.etag = etag;

    const cacheKey = snap.url;
    const encoding = chooseEncoding(req.headers.get('accept-encoding'));

    // Diff endpoint: GET /ahtml/...?since=W/"abc"
    const sinceEtag = url.searchParams.get('since');
    if (sinceEtag) {
      const prev = _cache.get(cacheKey);
      if (prev && (prev.etag === sinceEtag || computeEtag(prev) === sinceEtag)) {
        const d = diff(prev, snap);
        _cache.set(cacheKey, snap);
        if (d.changes.length === 0) {
          return new Response(null, {
            status: 304,
            headers: { etag, 'cache-control': cacheControl(snap, config) },
          });
        }
        return await encodedResponse(
          JSON.stringify(d),
          {
            'content-type': 'application/ahtml-diff+json',
            etag,
            'cache-control': cacheControl(snap, config),
            'x-ahtml-version': '0.1',
          },
          encoding,
        );
      }
      // Fall through to full snapshot if we don't have the prior.
    }

    // Conditional GET
    const ifNoneMatch = req.headers.get('if-none-match');
    if (ifNoneMatch && ifNoneMatch === etag) {
      return new Response(null, {
        status: 304,
        headers: { etag, 'cache-control': cacheControl(snap, config) },
      });
    }

    _cache.set(cacheKey, snap);

    // Streaming path — emit NDJSON record-by-record.
    if (shouldStream(req, snap, config)) {
      let stream = toStreamResponse(snap);
      stream = compressStream(stream, encoding);
      return new Response(stream, {
        status: 200,
        headers: streamHeaders(snap, config, etag, encoding),
      });
    }

    const fmt = chooseFormat(req.headers.get('accept') ?? '');
    const body = fmt === 'json' ? toJson(snap) : toCompact(snap);
    return await encodedResponse(
      body,
      {
        'content-type':
          fmt === 'json'
            ? 'application/ahtml+json'
            : 'application/ahtml+text; charset=utf-8',
        etag,
        'cache-control': cacheControl(snap, config),
        'last-modified': new Date(snap.fetched_at).toUTCString(),
        'x-ahtml-version': '0.1',
        vary: 'Accept, Accept-Encoding',
      },
      encoding,
    );
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract a `Request` from a Hono `Context`-shaped object. */
function toRequest(c: HonoContextLike): Request {
  const raw = c.req?.raw;
  if (raw instanceof Request) return raw;
  // Some test doubles pass a Request directly under `req`.
  const direct = c.req as unknown;
  if (direct instanceof Request) return direct;
  throw new Error('mountAHTML: handler context did not expose a Request');
}

/** Split `/ahtml/foo/bar` into `['foo','bar']`. */
function pathSegmentsUnderAhtml(pathname: string): string[] {
  const trimmed = pathname.replace(/^\/+/, '').replace(/\/+$/, '');
  const parts = trimmed.split('/').filter(Boolean);
  if (parts[0] === 'ahtml') return parts.slice(1);
  return parts;
}

function shouldStream(req: Request, snap: Snapshot, config: AHTMLHonoConfig): boolean {
  const accept = req.headers.get('accept') ?? '';
  if (accept.includes(STREAM_CONTENT_TYPE)) return true;
  const s = config.stream;
  if (s === true) return true;
  if (typeof s === 'number') {
    return snap.entities.length + snap.actions.length >= s;
  }
  return false;
}

function streamHeaders(
  snap: Snapshot,
  config: AHTMLHonoConfig,
  etag: string,
  encoding: Encoding,
): Record<string, string> {
  const h: Record<string, string> = {
    'content-type': `${STREAM_CONTENT_TYPE}; charset=utf-8`,
    etag,
    'cache-control': cacheControl(snap, config),
    'last-modified': new Date(snap.fetched_at).toUTCString(),
    'x-ahtml-version': '0.1',
    'transfer-encoding': 'chunked',
    vary: 'Accept, Accept-Encoding',
  };
  if (encoding !== 'identity') h['content-encoding'] = encoding;
  return h;
}

async function encodedResponse(
  body: string,
  headers: Record<string, string>,
  encoding: Encoding,
): Promise<Response> {
  const h: Record<string, string> = {
    ...headers,
    vary: headers.vary ?? 'Accept-Encoding',
  };
  if (encoding === 'identity') {
    return new Response(body, { status: 200, headers: h });
  }
  const bytes = await compressBuffer(body, encoding);
  h['content-encoding'] = encoding;
  return new Response(bytes as unknown as BodyInit, { status: 200, headers: h });
}

function ensureDefaults(snap: Snapshot, config: AHTMLHonoConfig): Snapshot {
  if (config.policy && !snap.policy) snap.policy = config.policy;
  if (config.default_ttl && snap.ttl == null) snap.ttl = config.default_ttl;
  return snap;
}

function cacheControl(snap: Snapshot, config: AHTMLHonoConfig): string {
  const ttl = snap.ttl ?? config.default_ttl ?? 60;
  return `public, max-age=${ttl}, must-revalidate`;
}

function jsonResponse(payload: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      ...extra,
    },
  });
}

function errorResponse(status: number, code: string, detail: unknown): Response {
  return new Response(
    JSON.stringify({
      error: code,
      detail: detail instanceof Error ? detail.message : String(detail),
    }),
    { status, headers: { 'content-type': 'application/json' } },
  );
}

/**
 * Synthesize a catalog of snapshots for MCP/OpenAPI emission. Uses
 * `config.getAllSnapshots` when supplied; otherwise replays
 * `config.snapshotBuilder` over each declared route. Failures and nulls
 * are skipped — a partial catalog is preferable to a 500.
 */
async function collectSnapshots(
  config: AHTMLHonoConfig,
  req: Request,
): Promise<Snapshot[]> {
  if (config.getAllSnapshots) return await config.getAllSnapshots();
  const routes = config.routes ?? [];
  const out: Snapshot[] = [];
  for (const r of routes) {
    const segments = r.path.replace(/^\/+/, '').split('/').filter(Boolean);
    try {
      const s = await config.snapshotBuilder(segments, req);
      if (s) out.push(s);
    } catch {
      // Swallow: emitters must remain available even if one builder throws.
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Policy enforcement (inlined to avoid the @ahtmljs/next dep — same semantics)
// ---------------------------------------------------------------------------

interface PolicyDecision {
  deny: boolean;
  response: Response;
}
interface Bucket {
  tokens: number;
  last: number;
}
const _buckets = new Map<string, Bucket>();
const _ALLOW: PolicyDecision = { deny: false, response: new Response(null) };

function enforcePolicy(req: Request, config: AHTMLHonoConfig): PolicyDecision {
  if (config.policy?.agents_welcome === false) {
    return policyDeny(
      403,
      'agents_not_welcome',
      'this site has not opted into agent traffic',
    );
  }
  const limit = parseRateLimit(config.policy?.rate_limit);
  if (limit) {
    const key = clientKey(req);
    const ok = consume(key, limit);
    if (!ok) {
      return policyDeny(
        429,
        'rate_limited',
        `rate limit ${config.policy?.rate_limit} exceeded`,
      );
    }
  }
  return _ALLOW;
}

function policyDeny(status: number, code: string, message: string): PolicyDecision {
  return {
    deny: true,
    response: new Response(JSON.stringify({ error: code, message }), {
      status,
      headers: { 'content-type': 'application/json', 'x-ahtml-policy': code },
    }),
  };
}

function clientKey(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  const real = req.headers.get('x-real-ip');
  return (fwd?.split(',')[0]?.trim() || real || 'anon').toLowerCase();
}

function consume(key: string, limit: { tokens: number; windowMs: number }): boolean {
  const now = Date.now();
  let b = _buckets.get(key);
  if (!b) {
    b = { tokens: limit.tokens, last: now };
    _buckets.set(key, b);
  }
  const elapsed = Math.max(0, now - b.last);
  const refill = (elapsed / limit.windowMs) * limit.tokens;
  b.tokens = Math.min(limit.tokens, b.tokens + refill);
  b.last = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

function parseRateLimit(s: string | undefined): { tokens: number; windowMs: number } | null {
  if (!s) return null;
  const m = s.match(/^(\d+)\/(s|sec|min|hr|hour)$/i);
  if (!m) return null;
  const tokens = parseInt(m[1]!, 10);
  const unit = m[2]!.toLowerCase();
  const windowMs = unit.startsWith('s') ? 1_000 : unit.startsWith('m') ? 60_000 : 3_600_000;
  return { tokens, windowMs };
}

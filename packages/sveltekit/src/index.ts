/**
 * @ahtmljs/sveltekit — SvelteKit adapter for AHTML (TASKS.md T1.8).
 *
 * Mounts the full AHTML surface on any SvelteKit app via a single server
 * hook: snapshot endpoint with content negotiation + conditional GET + diff
 * replies + streaming, the well-known manifest, MCP and OpenAPI emitters,
 * and llms.txt.
 *
 * Edge-first: this module never imports from `node:*` and never imports
 * `@sveltejs/kit` itself. SvelteKit's `Handle` / `RequestEvent` are consumed
 * as a tiny structural slice (`event.request: Request`, `resolve(event)`),
 * so the package runs on Cloudflare Workers, Vercel Edge, Deno, Bun, and
 * Node ≥18 — and never breaks against a SvelteKit major bump.
 *
 * Quickstart (src/hooks.server.ts):
 *
 *   import { ahtmlHandle } from '@ahtmljs/sveltekit';
 *   import { snapshot } from '@ahtmljs/schema';
 *
 *   export const handle = ahtmlHandle({
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
 * Prefer endpoint files over the hook? `createAHTMLRoutes(config)` returns
 * plain `(request: Request) => Promise<Response>` handlers you can re-export
 * from `+server.ts` files (see README.md).
 *
 * NOTE on formatting: this file is intentionally dense — the adapter LOC
 * budget (ROADMAP Feature 2 / TASKS.md T1.8) caps it at 300 non-blank,
 * non-comment lines while keeping full wire parity with @ahtmljs/hono.
 */

// prettier-ignore
import {
  toJson, toCompact, toMarkdown, computeEtag, diff, toStreamResponse,
  chooseEncoding, compressStream, compressBuffer, STREAM_CONTENT_TYPE,
  snapshot, trace, verifyHttpSignature,
  buildWellKnown, snapshotsToMcp, snapshotsToOpenApi, buildLlmsTxt,
  chooseFormat, isNotModified, notModifiedResponse,
  type Snapshot, type Policy, type Encoding, type VerifyKey, type PageType,
} from '@ahtmljs/schema';
import { createExtractor, pageFromHtml } from '@ahtmljs/extract';

/**
 * Structural subset of SvelteKit's `RequestEvent`. Only `request` is
 * required; the real event (which carries `url`, `params`, `locals`, …)
 * is a superset, so `ahtmlHandle`'s return value is assignable to the real
 * `Handle` type without importing `@sveltejs/kit`.
 */
export interface RequestEventLike {
  request: Request;
}

/**
 * Structural equivalent of SvelteKit's `Handle`. Generic over the event so
 * the hook forwards the *same* event object it received to `resolve` —
 * which is what SvelteKit's contravariant `resolve(event)` parameter needs
 * for assignability under `strictFunctionTypes`.
 */
export type AHTMLHandle = <E extends RequestEventLike>(input: {
  event: E;
  resolve: (event: E) => Response | Promise<Response>;
}) => Promise<Response>;

/**
 * Builds the `Snapshot` for a given path. First arg is the path-segments
 * array beneath `/ahtml/`. Return `null` to produce a 404.
 */
export type SvelteKitSnapshotBuilder = (
  pathSegments: string[],
  req: Request,
) => Promise<Snapshot | null> | Snapshot | null;

/**
 * Adapter configuration. Mirrors `AHTMLHonoConfig` from `@ahtmljs/hono` so
 * users moving between frameworks keep the same mental model:
 *
 * - `site` — canonical site URL for the well-known manifest / MCP server id.
 * - `policy` / `default_ttl` — defaults applied to snapshots lacking their own.
 * - `routes` — published in `/.well-known/ahtml.json` and llms.txt, and used
 *   to synthesize the MCP/OpenAPI catalog when `getAllSnapshots` is absent.
 * - `emit_mcp` / `emit_openapi` — default true.
 * - `snapshotBuilder` — required; builds the snapshot for a path.
 * - `stream` — `true` always streams NDJSON, a number is the
 *   "entities+actions ≥ N" threshold, `false` (default) never; clients can
 *   also opt in via `Accept: application/ahtml+json-seq`.
 * - `verifyAgents` / `agentKeys` — HTTP Message Signature verification with
 *   policy downgrade for unverified agents (same as hono/next v0.9.5).
 */
export interface AHTMLSvelteKitConfig {
  site: string;
  policy?: Policy;
  default_ttl?: number;
  routes?: Array<{ path: string; page_type: string }>;
  emit_mcp?: boolean;
  emit_openapi?: boolean;
  snapshotBuilder: SvelteKitSnapshotBuilder;
  getAllSnapshots?: () => Snapshot[] | Promise<Snapshot[]>;
  stream?: boolean | number;
  verifyAgents?: boolean;
  agentKeys?: VerifyKey[];
}

/** Plain fetch-shaped handlers, one per AHTML endpoint. */
export interface AHTMLRoutes {
  /** GET /ahtml and /ahtml/* — the snapshot endpoint. */
  snapshot: (request: Request) => Promise<Response>;
  /** GET /.well-known/ahtml.json */
  wellKnown: (request: Request) => Promise<Response>;
  /** GET /ahtml/mcp.json */
  mcp: (request: Request) => Promise<Response>;
  /** GET /ahtml/openapi.json */
  openapi: (request: Request) => Promise<Response>;
  /** GET /llms.txt */
  llmsTxt: (request: Request) => Promise<Response>;
}

/**
 * SvelteKit server hook. Intercepts the AHTML paths and passes every other
 * request to `resolve(event)` untouched. HEAD requests mirror GET headers
 * with an empty body. Non-GET/HEAD methods always pass through.
 */
export function ahtmlHandle(config: AHTMLSvelteKitConfig): AHTMLHandle {
  const routes = createAHTMLRoutes(config);
  return async ({ event, resolve }) => {
    const req = event.request;
    if (req.method !== 'GET' && req.method !== 'HEAD') return await resolve(event);
    const handler = pickHandler(new URL(req.url).pathname, routes, config);
    if (!handler) return await resolve(event);
    const res = await handler(req);
    if (req.method !== 'HEAD') return res;
    return new Response(null, { status: res.status, headers: res.headers });
  };
}

/** Route table shared by the hook and by users mounting `+server.ts` files. */
function pickHandler(
  pathname: string,
  routes: AHTMLRoutes,
  config: AHTMLSvelteKitConfig,
): ((request: Request) => Promise<Response>) | null {
  if (pathname === '/.well-known/ahtml.json') return routes.wellKnown;
  if (pathname === '/llms.txt') return routes.llmsTxt;
  // When an emitter is disabled its path falls through to the snapshot
  // handler — same wire result as @ahtmljs/hono, where the /ahtml/* wildcard
  // catches the path and the builder 404s it.
  if (pathname === '/ahtml/mcp.json' && config.emit_mcp !== false) return routes.mcp;
  if (pathname === '/ahtml/openapi.json' && config.emit_openapi !== false) return routes.openapi;
  if (pathname === '/ahtml' || pathname.startsWith('/ahtml/')) return routes.snapshot;
  return null;
}

const EMITTER_HEADERS = {
  'cache-control': 'public, max-age=300, must-revalidate',
  'x-ahtml-version': '0.1',
};

/**
 * Factory for users who prefer explicit endpoint files over the hook, and
 * the seam the conformance/matrix suites drive. Each handler is a plain
 * `(request: Request) => Promise<Response>`, so in SvelteKit it drops
 * straight into a `+server.ts` `GET` export.
 */
export function createAHTMLRoutes(config: AHTMLSvelteKitConfig): AHTMLRoutes {
  // Per-instance snapshot cache used to answer `?since=<etag>` diffs.
  const cache = new Map<string, Snapshot>();
  return {
    snapshot: (request) => serveSnapshot(request, config, cache),
    wellKnown: async (_request) => {
      const manifest = buildWellKnown({
        site: config.site,
        policy: config.policy,
        routes: config.routes,
        emit_mcp: config.emit_mcp,
        emit_openapi: config.emit_openapi,
      });
      return jsonResponse(manifest, EMITTER_HEADERS);
    },
    mcp: async (request) => {
      const url = new URL(request.url);
      const snaps = await collectSnapshots(config, request);
      const m = snapshotsToMcp({ name: 'ahtml', url: `${url.protocol}//${url.host}` }, snaps);
      return jsonResponse(m, EMITTER_HEADERS);
    },
    openapi: async (request) => {
      const url = new URL(request.url);
      const snaps = await collectSnapshots(config, request);
      const doc = snapshotsToOpenApi({ title: 'AHTML', baseUrl: `${url.protocol}//${url.host}` }, snaps);
      return jsonResponse(doc, EMITTER_HEADERS);
    },
    llmsTxt: async (_request) => {
      const body = buildLlmsTxt({
        site: config.site,
        description: config.policy?.contact ? `Agents welcome — contact: ${config.policy.contact}` : undefined,
        routes: config.routes ?? [],
      });
      return new Response(body, {
        status: 200,
        headers: { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'public, max-age=300' },
      });
    },
  };
}

/**
 * Zero-config bridge from a rendered SvelteKit page to a snapshot: run the
 * `@ahtmljs/extract` universal pipeline (JSON-LD, microdata, OpenGraph,
 * data-ahtml-* attributes) over the HTML and build a snapshot from what it
 * finds. Handy inside `snapshotBuilder` when pages already carry schema.org
 * markup and no hand-written builder exists yet.
 */
export function extractSnapshot(url: string, html: string, pageType?: PageType): Snapshot {
  const extraction = createExtractor().extract(pageFromHtml(url, html));
  const b = snapshot(url, pageType ?? ((extraction.page_type as PageType) || 'other'));
  if (extraction.entities.length) b.add(...extraction.entities);
  if (extraction.actions.length) b.action(...extraction.actions);
  return b.build();
}

// ---------------------------------------------------------------------------
// Snapshot endpoint — same wire behavior (headers, status codes, span names)
// as @ahtmljs/hono's makeSnapshotHandler.
// ---------------------------------------------------------------------------

async function serveSnapshot(
  req: Request,
  config: AHTMLSvelteKitConfig,
  cache: Map<string, Snapshot>,
): Promise<Response> {
  const url = new URL(req.url);
  return trace('ahtml.serve_snapshot', async () => {
    const decision = await trace('ahtml.enforce_policy', () => enforcePolicy(req, config), {
      'ahtml.url': url.pathname,
    });
    if (decision.deny) return decision.response;

    const segments = pathSegmentsUnderAhtml(url.pathname);
    let snap: Snapshot | null;
    try {
      snap = await trace('ahtml.build_snapshot', () => Promise.resolve(config.snapshotBuilder(segments, req)), {
        'ahtml.url': url.pathname,
      });
    } catch (err) {
      return errorResponse(500, 'snapshot_build_failed', err);
    }
    if (!snap) return errorResponse(404, 'no_snapshot', `no snapshot for /${segments.join('/')}`);

    snap = ensureDefaults(snap, config);
    const etag = snap.etag ?? computeEtag(snap);
    snap.etag = etag;
    const cacheKey = snap.url;
    const encoding = chooseEncoding(req.headers.get('accept-encoding'));

    // Diff endpoint: GET /ahtml/...?since=W/"abc". Falls through to the full
    // snapshot when we don't hold the prior revision.
    const sinceEtag = url.searchParams.get('since');
    if (sinceEtag) {
      const prev = cache.get(cacheKey);
      if (prev && (prev.etag === sinceEtag || computeEtag(prev) === sinceEtag)) {
        const current = snap;
        return await trace('ahtml.serve_diff', async () => {
          const d = diff(prev, current);
          cache.set(cacheKey, current);
          if (d.changes.length === 0) return notModifiedResponse(etag, cacheControl(current, config));
          return await encodedResponse(JSON.stringify(d), {
            'content-type': 'application/ahtml-diff+json',
            etag,
            'cache-control': cacheControl(current, config),
            'x-ahtml-version': '0.1',
          }, encoding);
        }, { 'ahtml.url': url.pathname, 'ahtml.since': sinceEtag });
      }
    }

    // Conditional GET (RFC 7232 weak comparison via @ahtmljs/schema/http/conditional).
    if (isNotModified(req, etag)) return notModifiedResponse(etag, cacheControl(snap, config));
    cache.set(cacheKey, snap);

    // Agent signature verification. Zero overhead when disabled.
    const agentHeaders: Record<string, string> = {};
    if (config.verifyAgents && config.agentKeys?.length) {
      const result = await verifyHttpSignature(req, config.agentKeys);
      if (!result.ok && snap.policy?.verified_agents_only) {
        snap = { ...snap, actions: [], policy: { ...snap.policy, agents_welcome: false } };
      }
      agentHeaders['x-ahtml-agent-verified'] = result.ok ? 'true' : 'false';
      if (result.ok && result.agent?.id) agentHeaders['x-ahtml-agent-id'] = result.agent.id;
    }

    // Streaming path — emit NDJSON record-by-record.
    if (shouldStream(req, snap, config)) {
      const stream = compressStream(toStreamResponse(snap), encoding);
      return new Response(stream, {
        status: 200,
        headers: { ...streamHeaders(snap, config, etag, encoding), ...agentHeaders },
      });
    }

    const fmt = chooseFormat(req.headers.get('accept') ?? '');
    const [body, ct] =
      fmt === 'markdown'
        ? [toMarkdown(snap), 'text/markdown; charset=utf-8']
        : fmt === 'json'
          ? [toJson(snap), 'application/ahtml+json']
          : [toCompact(snap), 'application/ahtml+text; charset=utf-8'];
    return await encodedResponse(body, {
      'content-type': ct,
      etag,
      'cache-control': cacheControl(snap, config),
      'last-modified': new Date(snap.fetched_at).toUTCString(),
      'x-ahtml-version': '0.1',
      'x-ahtml-tokens': String(Math.ceil(body.length / 4)),
      vary: 'Accept, Accept-Encoding',
      ...agentHeaders,
    }, encoding);
  }, { 'ahtml.url': url.pathname });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Split `/ahtml/foo/bar` into `['foo','bar']`. */
function pathSegmentsUnderAhtml(pathname: string): string[] {
  const parts = pathname.replace(/^\/+/, '').replace(/\/+$/, '').split('/').filter(Boolean);
  return parts[0] === 'ahtml' ? parts.slice(1) : parts;
}

function shouldStream(req: Request, snap: Snapshot, config: AHTMLSvelteKitConfig): boolean {
  if ((req.headers.get('accept') ?? '').includes(STREAM_CONTENT_TYPE)) return true;
  if (config.stream === true) return true;
  if (typeof config.stream === 'number') return snap.entities.length + snap.actions.length >= config.stream;
  return false;
}

function streamHeaders(
  snap: Snapshot,
  config: AHTMLSvelteKitConfig,
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
  const h: Record<string, string> = { ...headers, vary: headers.vary ?? 'Accept-Encoding' };
  if (encoding === 'identity') return new Response(body, { status: 200, headers: h });
  const bytes = await compressBuffer(body, encoding);
  h['content-encoding'] = encoding;
  return new Response(bytes as unknown as BodyInit, { status: 200, headers: h });
}

function ensureDefaults(snap: Snapshot, config: AHTMLSvelteKitConfig): Snapshot {
  if (config.policy && !snap.policy) snap.policy = config.policy;
  if (config.default_ttl && snap.ttl == null) snap.ttl = config.default_ttl;
  return snap;
}

function cacheControl(snap: Snapshot, config: AHTMLSvelteKitConfig): string {
  return `public, max-age=${snap.ttl ?? config.default_ttl ?? 60}, must-revalidate`;
}

function jsonResponse(payload: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: { 'content-type': 'application/json', ...extra },
  });
}

function errorResponse(status: number, code: string, detail: unknown): Response {
  const body = { error: code, detail: detail instanceof Error ? detail.message : String(detail) };
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/**
 * Synthesize the MCP/OpenAPI snapshot catalog. Uses `config.getAllSnapshots`
 * when supplied; otherwise replays `snapshotBuilder` over each declared
 * route. Failures and nulls are skipped — a partial catalog beats a 500.
 */
async function collectSnapshots(config: AHTMLSvelteKitConfig, req: Request): Promise<Snapshot[]> {
  if (config.getAllSnapshots) return await config.getAllSnapshots();
  const out: Snapshot[] = [];
  for (const r of config.routes ?? []) {
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
// Policy enforcement — same semantics as @ahtmljs/hono / @ahtmljs/next:
// 403 when agents_welcome is false, 429 over a token-bucket keyed by
// x-forwarded-for / x-real-ip when policy.rate_limit is set.
// ---------------------------------------------------------------------------

interface PolicyDecision { deny: boolean; response: Response }
interface Bucket { tokens: number; last: number }
interface RateLimit { tokens: number; windowMs: number }
const _buckets = new Map<string, Bucket>();
const _ALLOW: PolicyDecision = { deny: false, response: new Response(null) };

function enforcePolicy(req: Request, config: AHTMLSvelteKitConfig): PolicyDecision {
  if (config.policy?.agents_welcome === false) {
    return policyDeny(403, 'agents_not_welcome', 'this site has not opted into agent traffic');
  }
  const limit = parseRateLimit(config.policy?.rate_limit);
  if (limit && !consume(clientKey(req), limit)) {
    return policyDeny(429, 'rate_limited', `rate limit ${config.policy?.rate_limit} exceeded`);
  }
  return _ALLOW;
}

function policyDeny(status: number, code: string, message: string): PolicyDecision {
  const response = new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { 'content-type': 'application/json', 'x-ahtml-policy': code },
  });
  return { deny: true, response };
}

function clientKey(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'anon').toLowerCase();
}

function consume(key: string, limit: RateLimit): boolean {
  const now = Date.now();
  let b = _buckets.get(key);
  if (!b) {
    b = { tokens: limit.tokens, last: now };
    _buckets.set(key, b);
  }
  const elapsed = Math.max(0, now - b.last);
  b.tokens = Math.min(limit.tokens, b.tokens + (elapsed / limit.windowMs) * limit.tokens);
  b.last = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

function parseRateLimit(s: string | undefined): RateLimit | null {
  const m = s?.match(/^(\d+)\/(s|sec|min|hr|hour)$/i);
  if (!m) return null;
  const unit = m[2]!.toLowerCase();
  const windowMs = unit.startsWith('s') ? 1_000 : unit.startsWith('m') ? 60_000 : 3_600_000;
  return { tokens: parseInt(m[1]!, 10), windowMs };
}

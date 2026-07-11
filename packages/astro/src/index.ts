/**
 * @ahtmljs/astro — Astro adapter for AHTML (TASKS.md T1.7).
 *
 * Mounts the full AHTML surface on any Astro site: snapshot endpoint with
 * content negotiation + conditional GET + diff replies + streaming, the
 * well-known manifest, MCP and OpenAPI emitters, and llms.txt.
 *
 * Wire behavior mirrors `@ahtmljs/hono` byte-for-byte. Like that adapter,
 * this module never imports `astro` itself — Astro's integration and API
 * route contracts are consumed structurally (`AstroIntegrationLike`,
 * `APIContextLike`), so the package works across Astro majors and stays
 * runnable on every fetch-based runtime.
 *
 * Two ways in:
 *
 * 1. Integration (astro.config.mjs) — routes are injected for you. The
 *    config lives in its own module (default `./src/ahtml`) because a
 *    `snapshotBuilder` function cannot be serialized into the SSR bundle:
 *
 *      import { ahtml } from '@ahtmljs/astro';
 *      export default defineConfig({
 *        output: 'server',
 *        integrations: [ahtml({ config: './src/ahtml' })],
 *      });
 *
 *      // src/ahtml.ts — default-export an AHTMLAstroConfig
 *      import { snapshot } from '@ahtmljs/schema';
 *      export default {
 *        site: 'https://shop.example.com',
 *        policy: { agents_welcome: true, rate_limit: '100/min' },
 *        routes: [{ path: '/', page_type: 'home' }],
 *        snapshotBuilder: (segments, req) => snapshot(req.url, 'home').build(),
 *      };
 *
 * 2. Manual endpoints — `createAHTMLRoutes(config)` returns `{ GET, HEAD }`
 *    pairs you can re-export from `src/pages/ahtml/[...path].ts` etc., or
 *    call `handleAHTMLRequest(request, config)` from middleware.
 */

// prettier-ignore
import {
  snapshot, toJson, toCompact, toMarkdown, computeEtag, diff, toStreamResponse,
  chooseEncoding, compressStream, compressBuffer, STREAM_CONTENT_TYPE,
  buildWellKnown, snapshotsToMcp, snapshotsToOpenApi, buildLlmsTxt, chooseFormat,
  trace, verifyHttpSignature,
  type Snapshot, type PageType, type Policy, type Encoding, type VerifyKey,
} from '@ahtmljs/schema';
import { createExtractor, pageFromHtml } from '@ahtmljs/extract';

// ---------------------------------------------------------------------------
// Structural Astro types (no `astro` dependency — see module docblock)
// ---------------------------------------------------------------------------

/** The slice of Astro's `APIContext` the adapter needs. */
export interface APIContextLike { request: Request }

/** Astro `APIRoute`-compatible handler. */
export type APIRouteLike = (context: APIContextLike) => Promise<Response>;

/** A `{ GET, HEAD }` pair as exported from an Astro endpoint module. */
export interface RoutePair { GET: APIRouteLike; HEAD: APIRouteLike }

/** Structural subset of `AstroIntegration`. */
export interface AstroIntegrationLike {
  name: string;
  hooks: { 'astro:config:setup': (setup: AstroSetupApiLike) => void };
}

/** Structural subset of the `astro:config:setup` hook argument.
 *  `entryPoint` is the Astro <4 spelling — a harmless extra key on Astro 4+. */
export interface AstroSetupApiLike {
  injectRoute(route: { pattern: string; entrypoint: string; entryPoint?: string; prerender?: boolean }): void;
  updateConfig(config: { vite?: { plugins?: unknown[] } }): unknown;
  config?: { root?: URL | string };
}

// ---------------------------------------------------------------------------
// Config (mirrors AHTMLHonoConfig so users keep one mental model)
// ---------------------------------------------------------------------------

/** Builds the `Snapshot` for path segments beneath `/ahtml/`. `null` → 404. */
export type AstroSnapshotBuilder = (
  pathSegments: string[],
  req: Request,
) => Promise<Snapshot | null> | Snapshot | null;

export interface AHTMLAstroConfig {
  /** Canonical site URL — used in the well-known manifest and MCP server id. */
  site: string;
  /** Default policy applied to snapshots that don't set their own. */
  policy?: Policy;
  /** Default TTL in seconds applied to snapshots that don't set their own. */
  default_ttl?: number;
  /** Routes published in `/.well-known/ahtml.json`. */
  routes?: Array<{ path: string; page_type: string }>;
  /** Serve `/ahtml/mcp.json`. Defaults to true (404 when false). */
  emit_mcp?: boolean;
  /** Serve `/ahtml/openapi.json`. Defaults to true (404 when false). */
  emit_openapi?: boolean;
  /** Build the snapshot for the requested path. Required. */
  snapshotBuilder: AstroSnapshotBuilder;
  /** Optional snapshot catalog for the MCP/OpenAPI emitters; defaults to
   *  replaying `snapshotBuilder` over `routes`. */
  getAllSnapshots?: () => Snapshot[] | Promise<Snapshot[]>;
  /** NDJSON streaming: `true` always, number = entities+actions threshold,
   *  `false` (default) only on `Accept: application/ahtml+json-seq`. */
  stream?: boolean | number;
  /** When true, agents without a valid HTTP Message Signature get policy downgrade. */
  verifyAgents?: boolean;
  /** Keys used to verify incoming agent HTTP Message Signatures. */
  agentKeys?: VerifyKey[];
}

// ---------------------------------------------------------------------------
// Integration
// ---------------------------------------------------------------------------

const V = 'virtual:ahtml/';
const ROUTE_PATTERNS: Array<[pattern: string, name: keyof AHTMLRoutes]> = [
  ['/.well-known/ahtml.json', 'wellKnown'],
  ['/ahtml/mcp.json', 'mcp'],
  ['/ahtml/openapi.json', 'openapi'],
  ['/ahtml/[...path]', 'snapshot'],
  ['/llms.txt', 'llmsTxt'],
];

export interface AHTMLAstroIntegrationOptions {
  /** Module specifier whose default export (or named `ahtml` export) is the
   *  `AHTMLAstroConfig`. Relative specifiers resolve against the Astro
   *  project root. Defaults to `./src/ahtml`. */
  config?: string;
}

/**
 * Astro integration: injects `/.well-known/ahtml.json`, `/ahtml/[...path]`,
 * `/ahtml/mcp.json`, `/ahtml/openapi.json`, and `/llms.txt` as SSR routes
 * backed by {@link createAHTMLRoutes} over the user's config module.
 */
export function ahtml(options: AHTMLAstroIntegrationOptions = {}): AstroIntegrationLike {
  const spec = options.config ?? './src/ahtml';
  return {
    name: '@ahtmljs/astro',
    hooks: {
      'astro:config:setup': (setup) => {
        const root = setup.config?.root;
        const rootHref = typeof root === 'string' ? root : root?.href;
        const resolved = spec.startsWith('.') && rootHref
          ? decodeURIComponent(new URL(spec, rootHref).pathname)
          : spec;
        setup.updateConfig({ vite: { plugins: [virtualRoutesPlugin(resolved)] } });
        for (const [pattern, name] of ROUTE_PATTERNS) {
          setup.injectRoute({ pattern, entrypoint: V + name, entryPoint: V + name, prerender: false });
        }
      },
    },
  };
}

/** Vite plugin serving the virtual endpoint modules the integration injects. */
function virtualRoutesPlugin(configSpec: string) {
  return {
    name: '@ahtmljs/astro:virtual',
    resolveId: (id: string) => (id.startsWith(V) ? '\0' + id : undefined),
    load(id: string): string | undefined {
      if (!id.startsWith('\0' + V)) return undefined;
      const name = id.slice(1 + V.length);
      if (name === 'routes') {
        return `import * as m from ${JSON.stringify(configSpec)};\n` +
          `import { createAHTMLRoutes } from '@ahtmljs/astro';\n` +
          `export const routes = createAHTMLRoutes(m.default ?? m.ahtml);`;
      }
      return `import { routes } from ${JSON.stringify(V + 'routes')};\n` +
        `export const prerender = false;\n` +
        `export const GET = routes.${name}.GET;\nexport const HEAD = routes.${name}.HEAD;`;
    },
  };
}

// ---------------------------------------------------------------------------
// Route factory + request dispatcher
// ---------------------------------------------------------------------------

export interface AHTMLRoutes {
  wellKnown: RoutePair;
  snapshot: RoutePair;
  mcp: RoutePair;
  openapi: RoutePair;
  llmsTxt: RoutePair;
}

/** Build the five endpoint `{ GET, HEAD }` pairs for a config. */
export function createAHTMLRoutes(config: AHTMLAstroConfig): AHTMLRoutes {
  const pair = (fn: (req: Request) => Response | Promise<Response>): RoutePair => ({
    GET: async (ctx) => await fn(ctx.request),
    HEAD: async (ctx) => {
      const res = await fn(ctx.request);
      return new Response(null, { status: res.status, headers: res.headers });
    },
  });
  return {
    wellKnown: pair((req) => wellKnownResponse(req, config)),
    snapshot: pair((req) => serveSnapshot(req, config)),
    mcp: pair((req) => mcpResponse(req, config)),
    openapi: pair((req) => openApiResponse(req, config)),
    llmsTxt: pair((req) => llmsTxtResponse(req, config)),
  };
}

/**
 * Framework-free core: dispatch any `Request` against the AHTML surface.
 * Returns `null` for paths the adapter does not own (use from middleware).
 */
export async function handleAHTMLRequest(
  request: Request,
  config: AHTMLAstroConfig,
): Promise<Response | null> {
  const p = new URL(request.url).pathname;
  let res: Response | null = null;
  if (p === '/.well-known/ahtml.json') res = wellKnownResponse(request, config);
  else if (p === '/llms.txt') res = llmsTxtResponse(request, config);
  else if (p === '/ahtml/mcp.json') res = await mcpResponse(request, config);
  else if (p === '/ahtml/openapi.json') res = await openApiResponse(request, config);
  else if (p === '/ahtml' || p.startsWith('/ahtml/')) res = await serveSnapshot(request, config);
  if (res && request.method === 'HEAD') {
    return new Response(null, { status: res.status, headers: res.headers });
  }
  return res;
}

/**
 * Zero-config helper built on the `@ahtmljs/extract` plugin API: run the
 * universal extractors over rendered HTML and wrap the result in a Snapshot.
 */
export function snapshotFromHtml(url: string, html: string, pageType?: PageType): Snapshot {
  const ex = createExtractor().extract(pageFromHtml(url, html));
  return snapshot(url, pageType ?? ((ex.page_type as PageType) || 'other'))
    .add(...ex.entities)
    .action(...ex.actions)
    .build();
}

// ---------------------------------------------------------------------------
// Endpoint bodies (wire-identical to @ahtmljs/hono)
// ---------------------------------------------------------------------------

const CATALOG_HEADERS = { 'cache-control': 'public, max-age=300, must-revalidate', 'x-ahtml-version': '0.1' };

function wellKnownResponse(_req: Request, config: AHTMLAstroConfig): Response {
  const { site, policy, routes, emit_mcp, emit_openapi } = config;
  return jsonResponse(buildWellKnown({ site, policy, routes, emit_mcp, emit_openapi }), CATALOG_HEADERS);
}

async function mcpResponse(req: Request, config: AHTMLAstroConfig): Promise<Response> {
  if (config.emit_mcp === false) return errorResponse(404, 'mcp_disabled', 'emit_mcp is false');
  const url = new URL(req.url);
  const snaps = await collectSnapshots(config, req);
  return jsonResponse(snapshotsToMcp({ name: 'ahtml', url: `${url.protocol}//${url.host}` }, snaps), CATALOG_HEADERS);
}

async function openApiResponse(req: Request, config: AHTMLAstroConfig): Promise<Response> {
  if (config.emit_openapi === false) return errorResponse(404, 'openapi_disabled', 'emit_openapi is false');
  const url = new URL(req.url);
  const snaps = await collectSnapshots(config, req);
  return jsonResponse(snapshotsToOpenApi({ title: 'AHTML', baseUrl: `${url.protocol}//${url.host}` }, snaps), CATALOG_HEADERS);
}

function llmsTxtResponse(_req: Request, config: AHTMLAstroConfig): Response {
  const body = buildLlmsTxt({
    site: config.site,
    description: config.policy?.contact ? `Agents welcome — contact: ${config.policy.contact}` : undefined,
    routes: config.routes ?? [],
  });
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'public, max-age=300' },
  });
}

// ---------------------------------------------------------------------------
// Snapshot endpoint
// ---------------------------------------------------------------------------

/** Per-module snapshot cache used to answer `?since=<etag>` diffs. */
const _cache = new Map<string, Snapshot>();

async function serveSnapshot(req: Request, config: AHTMLAstroConfig): Promise<Response> {
  const url = new URL(req.url);
  // Same OTel span name as the Next.js/Hono adapters (no-op without OTel).
  return trace('ahtml.serve_snapshot', async () => {
    const denied = enforcePolicy(req, config);
    if (denied) return denied;

    const segments = pathSegmentsUnderAhtml(url.pathname);
    let snap: Snapshot | null;
    try {
      snap = await config.snapshotBuilder(segments, req);
    } catch (err) {
      return errorResponse(500, 'snapshot_build_failed', err);
    }
    if (!snap) return errorResponse(404, 'no_snapshot', `no snapshot for /${segments.join('/')}`);

    if (config.policy && !snap.policy) snap.policy = config.policy;
    if (config.default_ttl && snap.ttl == null) snap.ttl = config.default_ttl;
    const etag = snap.etag ?? computeEtag(snap);
    snap.etag = etag;
    const cc = () => cacheControl(snap!, config);
    const cacheKey = snap.url;
    const encoding = chooseEncoding(req.headers.get('accept-encoding'));

    // Diff endpoint: GET /ahtml/...?since=W/"abc" — falls through to the
    // full snapshot when the prior revision is unknown.
    const sinceEtag = url.searchParams.get('since');
    if (sinceEtag) {
      const prev = _cache.get(cacheKey);
      if (prev && (prev.etag === sinceEtag || computeEtag(prev) === sinceEtag)) {
        const d = diff(prev, snap);
        _cache.set(cacheKey, snap);
        if (d.changes.length === 0) {
          return new Response(null, { status: 304, headers: { etag, 'cache-control': cc() } });
        }
        return await encodedResponse(
          JSON.stringify(d),
          { 'content-type': 'application/ahtml-diff+json', etag, 'cache-control': cc(), 'x-ahtml-version': '0.1' },
          encoding,
        );
      }
    }

    // Conditional GET
    const ifNoneMatch = req.headers.get('if-none-match');
    if (ifNoneMatch && ifNoneMatch === etag) {
      return new Response(null, { status: 304, headers: { etag, 'cache-control': cc() } });
    }
    _cache.set(cacheKey, snap);

    // Agent signature verification. Zero overhead when disabled.
    const agentExtraHeaders: Record<string, string> = {};
    if (config.verifyAgents && config.agentKeys?.length) {
      const agentResult = await verifyHttpSignature(req, config.agentKeys);
      if (!agentResult.ok && snap.policy?.verified_agents_only) {
        snap = { ...snap, actions: [], policy: { ...snap.policy, agents_welcome: false } };
      }
      agentExtraHeaders['x-ahtml-agent-verified'] = agentResult.ok ? 'true' : 'false';
      if (agentResult.ok && agentResult.agent?.id) {
        agentExtraHeaders['x-ahtml-agent-id'] = agentResult.agent.id;
      }
    }

    const common: Record<string, string> = {
      etag,
      'cache-control': cc(),
      'last-modified': new Date(snap.fetched_at).toUTCString(),
      'x-ahtml-version': '0.1',
      vary: 'Accept, Accept-Encoding',
      ...agentExtraHeaders,
    };

    // Streaming path — emit NDJSON record-by-record.
    if (shouldStream(req, snap, config)) {
      const headers: Record<string, string> = {
        ...common,
        'content-type': `${STREAM_CONTENT_TYPE}; charset=utf-8`,
        'transfer-encoding': 'chunked',
      };
      if (encoding !== 'identity') headers['content-encoding'] = encoding;
      return new Response(compressStream(toStreamResponse(snap), encoding), { status: 200, headers });
    }

    const fmt = chooseFormat(req.headers.get('accept') ?? '');
    let body: string;
    let ct: string;
    if (fmt === 'markdown') {
      body = toMarkdown(snap);
      ct = 'text/markdown; charset=utf-8';
    } else if (fmt === 'json') {
      body = toJson(snap);
      ct = 'application/ahtml+json';
    } else {
      body = toCompact(snap);
      ct = 'application/ahtml+text; charset=utf-8';
    }
    return await encodedResponse(
      body,
      { ...common, 'content-type': ct, 'x-ahtml-tokens': String(Math.ceil(body.length / 4)) },
      encoding,
    );
  }, { 'ahtml.url': url.pathname });
}

// ---------------------------------------------------------------------------
// Helpers (same semantics as @ahtmljs/hono)
// ---------------------------------------------------------------------------

/** Split `/ahtml/foo/bar` into `['foo','bar']`. */
function pathSegmentsUnderAhtml(pathname: string): string[] {
  const parts = pathname.replace(/^\/+/, '').replace(/\/+$/, '').split('/').filter(Boolean);
  return parts[0] === 'ahtml' ? parts.slice(1) : parts;
}

function shouldStream(req: Request, snap: Snapshot, config: AHTMLAstroConfig): boolean {
  if ((req.headers.get('accept') ?? '').includes(STREAM_CONTENT_TYPE)) return true;
  if (config.stream === true) return true;
  if (typeof config.stream === 'number') return snap.entities.length + snap.actions.length >= config.stream;
  return false;
}

async function encodedResponse(body: string, headers: Record<string, string>, encoding: Encoding): Promise<Response> {
  const h: Record<string, string> = { ...headers, vary: headers.vary ?? 'Accept-Encoding' };
  if (encoding === 'identity') return new Response(body, { status: 200, headers: h });
  const bytes = await compressBuffer(body, encoding);
  h['content-encoding'] = encoding;
  return new Response(bytes as unknown as BodyInit, { status: 200, headers: h });
}

function cacheControl(snap: Snapshot, config: AHTMLAstroConfig): string {
  return `public, max-age=${snap.ttl ?? config.default_ttl ?? 60}, must-revalidate`;
}

function jsonResponse(payload: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: { 'content-type': 'application/json', ...extra },
  });
}

function errorResponse(status: number, code: string, detail: unknown): Response {
  return new Response(
    JSON.stringify({ error: code, detail: detail instanceof Error ? detail.message : String(detail) }),
    { status, headers: { 'content-type': 'application/json' } },
  );
}

/** Snapshot catalog for MCP/OpenAPI; failures and nulls are skipped so a
 *  partial catalog beats a 500. */
async function collectSnapshots(config: AHTMLAstroConfig, req: Request): Promise<Snapshot[]> {
  if (config.getAllSnapshots) return await config.getAllSnapshots();
  const out: Snapshot[] = [];
  for (const r of config.routes ?? []) {
    try {
      const s = await config.snapshotBuilder(r.path.replace(/^\/+/, '').split('/').filter(Boolean), req);
      if (s) out.push(s);
    } catch { /* emitters stay available even if one builder throws */ }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Policy enforcement (same semantics as @ahtmljs/hono)
// ---------------------------------------------------------------------------

const _buckets = new Map<string, { tokens: number; last: number }>();

/** Returns a deny Response, or null to allow. */
function enforcePolicy(req: Request, config: AHTMLAstroConfig): Response | null {
  if (config.policy?.agents_welcome === false) {
    return policyDeny(403, 'agents_not_welcome', 'this site has not opted into agent traffic');
  }
  const limit = parseRateLimit(config.policy?.rate_limit);
  if (limit && !consume(clientKey(req), limit)) {
    return policyDeny(429, 'rate_limited', `rate limit ${config.policy?.rate_limit} exceeded`);
  }
  return null;
}

function policyDeny(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { 'content-type': 'application/json', 'x-ahtml-policy': code },
  });
}

function clientKey(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'anon').toLowerCase();
}

/** Token-bucket consume — same refill math as @ahtmljs/hono. */
function consume(key: string, limit: { tokens: number; windowMs: number }): boolean {
  const now = Date.now();
  let b = _buckets.get(key);
  if (!b) _buckets.set(key, (b = { tokens: limit.tokens, last: now }));
  b.tokens = Math.min(limit.tokens, b.tokens + (Math.max(0, now - b.last) / limit.windowMs) * limit.tokens);
  b.last = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

function parseRateLimit(s: string | undefined): { tokens: number; windowMs: number } | null {
  const m = s?.match(/^(\d+)\/(s|sec|min|hr|hour)$/i);
  if (!m) return null;
  const unit = m[2]!.toLowerCase();
  return {
    tokens: parseInt(m[1]!, 10),
    windowMs: unit.startsWith('s') ? 1_000 : unit.startsWith('m') ? 60_000 : 3_600_000,
  };
}

/**
 * Per-route snapshot handler factory.
 *
 * Usage in a Next.js App Router project:
 *
 *   // app/ahtml/[...path]/route.ts
 *   import { createAHTMLRoute } from '@ahtmljs/next/handler';
 *   import { buildSnapshotForPath } from '../../lib/ahtml';
 *   export const { GET, HEAD } = createAHTMLRoute(buildSnapshotForPath);
 *
 * The handler supports:
 *   - Content negotiation:
 *       Accept: application/ahtml+json   → canonical JSON
 *       Accept: application/ahtml+text   → token-optimal compact text  (default)
 *   - Conditional GET via If-None-Match → 304
 *   - Diff endpoint via ?since=<etag>   → SnapshotDiff
 *   - ETag, Cache-Control, Last-Modified headers
 *   - Optional policy enforcement (rate limit / auth gate)
 *   - OpenTelemetry tracing via @ahtmljs/schema `trace` helper
 */

import {
  toJson,
  toCompact,
  toMarkdown,
  computeEtag,
  diff,
  toStreamResponse,
  chooseEncoding,
  compressStream,
  compressBuffer,
  trace,
  STREAM_CONTENT_TYPE,
  type Snapshot,
  type Encoding,
} from '@ahtmljs/schema';
import { getConfig, type AHTMLConfig } from './index.js';
import { enforcePolicy } from './policy.js';

export type SnapshotBuilder = (
  pathSegments: string[],
  req: Request,
) => Promise<Snapshot | null> | Snapshot | null;

export interface CreateRouteOptions {
  /**
   * Emit responses as a streaming NDJSON sequence
   * (`application/ahtml+json-seq`) instead of a buffered body. The server
   * can start writing entities before the full snapshot is materialized,
   * and the client can begin processing them before the response ends.
   *
   * Use for snapshots with many entities (typically datasets) or whenever
   * peak server memory matters. The non-streaming default keeps the
   * v0.6.0 wire shape and is still the right choice for small pages.
   *
   * - `true`  → always stream
   * - a number → stream when `entities.length + actions.length >= threshold`
   * - `false` (default) → never stream
   */
  stream?: boolean | number;
}

/** A simple in-memory store for previous snapshots (per process) so the
 *  diff endpoint can answer "what changed since <etag>?" without the
 *  caller re-uploading. Sites with multiple instances should plug in
 *  their own KV store via setSnapshotCache. */
const _cache = new Map<string, Snapshot>();

export function setSnapshotCache(impl: { get(key: string): Snapshot | undefined; set(key: string, s: Snapshot): void }): void {
  // override
  (_cache as unknown as { _impl?: typeof impl })._impl = impl;
}

function cacheGet(key: string): Snapshot | undefined {
  const impl = (_cache as unknown as { _impl?: { get(k: string): Snapshot | undefined } })._impl;
  return impl ? impl.get(key) : _cache.get(key);
}
function cacheSet(key: string, s: Snapshot): void {
  const impl = (_cache as unknown as { _impl?: { set(k: string, s: Snapshot): void } })._impl;
  if (impl) impl.set(key, s); else _cache.set(key, s);
}

export function createAHTMLRoute(
  builder: SnapshotBuilder,
  configOverride?: AHTMLConfig,
  routeOpts: CreateRouteOptions = {},
) {
  async function GET(req: Request, ctx: { params: Promise<{ path?: string[] }> | { path?: string[] } }): Promise<Response> {
    return trace(
      'ahtml.serve_snapshot',
      async () => {
        const config = configOverride ?? getConfig();
        const params = await ctx.params;
        const segments = params.path ?? [];

        const policyDecision = await trace(
          'ahtml.enforce_policy',
          () => enforcePolicy(req, config),
          { 'ahtml.url': new URL(req.url).pathname },
        );
        if (policyDecision.deny) return policyDecision.response;

        let snap: Snapshot | null;
        try {
          snap = await trace(
            'ahtml.build_snapshot',
            () => Promise.resolve(builder(segments, req)),
            { 'ahtml.url': new URL(req.url).pathname },
          );
        } catch (err) {
          return error(500, 'snapshot_build_failed', err);
        }
        if (!snap) {
          return error(404, 'no_snapshot', `no snapshot for /${segments.join('/')}`);
        }

        snap = ensureDefaults(snap, config);

        const etag = snap.etag ?? computeEtag(snap);
        snap.etag = etag;

        const cacheKey = snap.url;
        const url = new URL(req.url);
        const encoding = chooseEncoding(req.headers.get('accept-encoding'));

        // Diff endpoint: GET /ahtml/...?since=W/"abc"
        const sinceEtag = url.searchParams.get('since');
        if (sinceEtag) {
          const prev = cacheGet(cacheKey);
          if (prev && (prev.etag === sinceEtag || computeEtag(prev) === sinceEtag)) {
            // `const` capture so the closure below sees the narrowed Snapshot.
            const current = snap;
            return await trace(
              'ahtml.serve_diff',
              async () => {
                const d = diff(prev, current);
                cacheSet(cacheKey, current);
                // Optimization: when there are no changes, return 304 — saves
                // ~150 B per page on no-change recrawls at scale.
                if (d.changes.length === 0) {
                  return new Response(null, {
                    status: 304,
                    headers: { etag, 'cache-control': cacheControl(current, config) },
                  });
                }
                return await encodedResponse(
                  JSON.stringify(d),
                  {
                    'content-type': 'application/ahtml-diff+json',
                    etag,
                    'cache-control': cacheControl(current, config),
                    'x-ahtml-version': '0.1',
                  },
                  encoding,
                );
              },
              { 'ahtml.url': url.pathname, 'ahtml.since': sinceEtag },
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

        cacheSet(cacheKey, snap);

        // Streaming path — emit NDJSON record-by-record. Cannot honor JSON / compact
        // content negotiation since the wire format is its own type. Caller opts in
        // via routeOpts.stream or via `Accept: application/ahtml+json-seq`.
        if (shouldStream(req, snap, routeOpts)) {
          let stream = toStreamResponse(snap);
          stream = compressStream(stream, encoding);
          return new Response(stream, {
            status: 200,
            headers: streamHeaders(snap, config, etag, encoding),
          });
        }

        const fmt = pickFormat(req);
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
          {
            'content-type': ct,
            etag,
            'cache-control': cacheControl(snap, config),
            'last-modified': new Date(snap.fetched_at).toUTCString(),
            'x-ahtml-version': '0.1',
            'x-ahtml-tokens': String(Math.ceil(body.length / 4)),
            vary: 'Accept, Accept-Encoding',
          },
          encoding,
        );
      },
      { 'ahtml.url': new URL(req.url).pathname },
    );
  }

  async function HEAD(req: Request, ctx: { params: Promise<{ path?: string[] }> | { path?: string[] } }): Promise<Response> {
    const res = await GET(req, ctx);
    return new Response(null, { status: res.status, headers: res.headers });
  }

  return { GET, HEAD };
}

function shouldStream(req: Request, snap: Snapshot, opts: CreateRouteOptions): boolean {
  // Client can always force streaming by explicitly accepting the seq type.
  const accept = req.headers.get('accept') ?? '';
  if (accept.includes(STREAM_CONTENT_TYPE)) return true;
  const s = opts.stream;
  if (s === true) return true;
  if (typeof s === 'number') {
    return snap.entities.length + snap.actions.length >= s;
  }
  return false;
}

function streamHeaders(
  snap: Snapshot,
  config: AHTMLConfig,
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
  // Uint8Array is a valid BodyInit at runtime; TS's narrower types disagree.
  return new Response(bytes as unknown as BodyInit, { status: 200, headers: h });
}

function ensureDefaults(snap: Snapshot, config: ReturnType<typeof getConfig>): Snapshot {
  if (config.policy && !snap.policy) snap.policy = config.policy;
  if (config.default_ttl && snap.ttl == null) snap.ttl = config.default_ttl;
  return snap;
}

function cacheControl(snap: Snapshot, config: ReturnType<typeof getConfig>): string {
  const ttl = snap.ttl ?? config.default_ttl ?? 60;
  return `public, max-age=${ttl}, must-revalidate`;
}

function pickFormat(req: Request): 'json' | 'compact' | 'markdown' {
  return chooseFormat(req.headers.get('accept') ?? '');
}

/**
 * Choose JSON vs compact vs markdown from an Accept header, honoring RFC 7231 q-values.
 *
 * Returns 'json' when the client signals a higher preference for any of
 * `application/ahtml+json` or `application/json`. Returns 'compact' for
 * `application/ahtml+text` or `text/plain`. Returns 'markdown' for
 * `text/markdown`. Wildcards (`* /*`) keep the agent-friendly default (compact).
 * Ties favor JSON, which is the more widely-interoperable format.
 */
export function chooseFormat(header: string): 'json' | 'compact' | 'markdown' {
  if (!header) return 'compact';
  let bestJson = -1;
  let bestCompact = -1;
  let bestMarkdown = -1;
  for (const m of parseAccept(header)) {
    if (m.type === 'application/ahtml+json' || m.type === 'application/json') {
      if (m.q > bestJson) bestJson = m.q;
    } else if (m.type === 'application/ahtml+text' || m.type === 'text/plain') {
      if (m.q > bestCompact) bestCompact = m.q;
    } else if (m.type === 'text/markdown') {
      if (m.q > bestMarkdown) bestMarkdown = m.q;
    }
  }
  if (bestJson < 0 && bestCompact < 0 && bestMarkdown < 0) return 'compact';
  const best = Math.max(bestJson, bestCompact, bestMarkdown);
  if (best === bestMarkdown && bestMarkdown >= 0) return 'markdown';
  return bestJson >= bestCompact ? 'json' : 'compact';
}

interface AcceptEntry { type: string; q: number; }
function parseAccept(header: string): AcceptEntry[] {
  const out: AcceptEntry[] = [];
  for (const raw of header.split(',')) {
    const parts = raw.trim().split(';').map((p) => p.trim());
    const type = (parts.shift() ?? '').toLowerCase();
    if (!type) continue;
    let q = 1;
    for (const p of parts) {
      const m = p.match(/^q=([0-9]*\.?[0-9]+)$/i);
      if (m) q = Math.max(0, Math.min(1, parseFloat(m[1]!)));
    }
    out.push({ type, q });
  }
  return out;
}

function error(status: number, code: string, detail: unknown): Response {
  return new Response(
    JSON.stringify({ error: code, detail: detail instanceof Error ? detail.message : String(detail) }),
    { status, headers: { 'content-type': 'application/json' } },
  );
}

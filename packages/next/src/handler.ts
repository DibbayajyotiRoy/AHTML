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
 */

import {
  toJson,
  toCompact,
  computeEtag,
  diff,
  type Snapshot,
} from '@ahtmljs/schema';
import { getConfig, type AHTMLConfig } from './index.js';
import { enforcePolicy } from './policy.js';

export type SnapshotBuilder = (
  pathSegments: string[],
  req: Request,
) => Promise<Snapshot | null> | Snapshot | null;

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

export function createAHTMLRoute(builder: SnapshotBuilder, configOverride?: AHTMLConfig) {
  async function GET(req: Request, ctx: { params: Promise<{ path?: string[] }> | { path?: string[] } }): Promise<Response> {
    const config = configOverride ?? getConfig();
    const params = await ctx.params;
    const segments = params.path ?? [];

    const policyDecision = await enforcePolicy(req, config);
    if (policyDecision.deny) return policyDecision.response;

    let snap: Snapshot | null;
    try {
      snap = await builder(segments, req);
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

    // Diff endpoint: GET /ahtml/...?since=W/"abc"
    const sinceEtag = url.searchParams.get('since');
    if (sinceEtag) {
      const prev = cacheGet(cacheKey);
      if (prev && (prev.etag === sinceEtag || computeEtag(prev) === sinceEtag)) {
        const d = diff(prev, snap);
        cacheSet(cacheKey, snap);
        // Optimization: when there are no changes, return 304 — saves
        // ~150 B per page on no-change recrawls at scale.
        if (d.changes.length === 0) {
          return new Response(null, {
            status: 304,
            headers: { etag, 'cache-control': cacheControl(snap, config) },
          });
        }
        return new Response(JSON.stringify(d), {
          status: 200,
          headers: {
            'content-type': 'application/ahtml-diff+json',
            etag,
            'cache-control': cacheControl(snap, config),
            'x-ahtml-version': '0.1',
          },
        });
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

    const fmt = pickFormat(req);
    const body = fmt === 'json' ? toJson(snap) : toCompact(snap);
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': fmt === 'json' ? 'application/ahtml+json' : 'application/ahtml+text; charset=utf-8',
        etag,
        'cache-control': cacheControl(snap, config),
        'last-modified': new Date(snap.fetched_at).toUTCString(),
        'x-ahtml-version': '0.1',
        vary: 'Accept',
      },
    });
  }

  async function HEAD(req: Request, ctx: { params: Promise<{ path?: string[] }> | { path?: string[] } }): Promise<Response> {
    const res = await GET(req, ctx);
    return new Response(null, { status: res.status, headers: res.headers });
  }

  return { GET, HEAD };
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

function pickFormat(req: Request): 'json' | 'compact' {
  const accept = req.headers.get('accept') ?? '';
  if (/application\/ahtml\+json/.test(accept)) return 'json';
  if (/application\/ahtml\+text/.test(accept)) return 'compact';
  if (/application\/json/.test(accept) && !/text/.test(accept)) return 'json';
  // Default: compact text. Maximally token-efficient for LLM agents.
  return 'compact';
}

function error(status: number, code: string, detail: unknown): Response {
  return new Response(
    JSON.stringify({ error: code, detail: detail instanceof Error ? detail.message : String(detail) }),
    { status, headers: { 'content-type': 'application/json' } },
  );
}

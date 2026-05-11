/**
 * AHTMLClient — the agent-side fetcher.
 *
 * Behaviour worth understanding:
 *
 *   - Defaults to Accept: application/ahtml+text (compact, token-optimal).
 *   - Caches snapshots by URL keyed on ETag.
 *   - On second fetch sends If-None-Match; 304 reuses cached body.
 *   - Optional diff mode sends ?since=<etag>; reconstructs snapshot via applyDiff.
 *   - Respects the site's TTL when deciding to skip the network entirely.
 *
 * No network library — uses the global fetch (Node 20+, modern browsers).
 */

import {
  fromCompact,
  fromJson,
  applyDiff,
  type Snapshot,
  type SnapshotDiff,
} from '@ahtml/schema';

export interface FetchOptions {
  /** "compact" (default, token-optimal) or "json". */
  format?: 'compact' | 'json';
  /** Bypass the local cache. */
  noCache?: boolean;
  /** Allow returning a stale-but-cached snapshot if the network fails. */
  allowStale?: boolean;
  /** Identity header. Set this when AHTML providers gate by agent identity. */
  agent?: string;
  /** Auth bearer for action execution endpoints. */
  bearer?: string;
  /** Custom fetch override (testing). */
  fetch?: typeof fetch;
}

export interface CachedSnapshot {
  snapshot: Snapshot;
  fetchedAt: number;
  etag?: string;
}

export class AHTMLClient {
  private cache = new Map<string, CachedSnapshot>();

  constructor(private defaults: FetchOptions = {}) {}

  /**
   * Fetch the snapshot for a URL. Uses ETag-based incremental fetch by
   * default; falls back to the diff endpoint when the cached snapshot is
   * stale enough that the server might prefer to send a delta.
   */
  async fetch(url: string, opts: FetchOptions = {}): Promise<Snapshot> {
    const o = { ...this.defaults, ...opts };
    const fetcher = o.fetch ?? globalThis.fetch;
    const cached = this.cache.get(url);

    // 1) Fresh cache (within TTL) — skip the network entirely.
    if (cached && !o.noCache && isFresh(cached)) {
      return cached.snapshot;
    }

    const accept =
      o.format === 'json'
        ? 'application/ahtml+json'
        : 'application/ahtml+text';

    // 2) Try a diff request if we already have a snapshot.
    if (cached && !o.noCache) {
      const diffUrl = url + (url.includes('?') ? '&' : '?') + 'since=' + encodeURIComponent(cached.etag ?? '');
      const res = await fetcher(diffUrl, {
        headers: {
          'accept': 'application/ahtml-diff+json, ' + accept,
          ...(o.agent && { 'user-agent': o.agent }),
        },
      }).catch((err) => failOrStale(err, cached, o));

      if (res instanceof Response) {
        const ct = res.headers.get('content-type') ?? '';
        if (res.ok && ct.includes('application/ahtml-diff+json')) {
          const d = (await res.json()) as SnapshotDiff;
          const next = applyDiff(cached.snapshot, d);
          const etag = res.headers.get('etag') ?? d.to_etag;
          this.cache.set(url, { snapshot: next, fetchedAt: Date.now(), etag });
          return next;
        }
        if (res.ok && ct.includes('application/ahtml')) {
          return this.storeFromResponse(url, res);
        }
        if (res.status === 304) {
          this.cache.set(url, { ...cached, fetchedAt: Date.now() });
          return cached.snapshot;
        }
        // anything else — fall through to a fresh fetch
      }
    }

    // 3) Conditional or fresh GET.
    const headers: Record<string, string> = { accept };
    if (cached?.etag && !o.noCache) headers['if-none-match'] = cached.etag;
    if (o.agent) headers['user-agent'] = o.agent;

    let res: Response;
    try {
      res = await fetcher(url, { headers });
    } catch (err) {
      const fb = failOrStale(err, cached, o);
      if (fb instanceof Response) res = fb;
      else throw err;
    }

    if (res.status === 304 && cached) {
      this.cache.set(url, { ...cached, fetchedAt: Date.now() });
      return cached.snapshot;
    }
    if (!res.ok) {
      if (cached && o.allowStale) return cached.snapshot;
      throw new AHTMLError(res.status, await res.text());
    }
    return this.storeFromResponse(url, res);
  }

  private async storeFromResponse(url: string, res: Response): Promise<Snapshot> {
    const ct = res.headers.get('content-type') ?? '';
    const body = await res.text();
    const snapshot = ct.includes('application/ahtml+json')
      ? fromJson(body)
      : fromCompact(body);
    const etag = res.headers.get('etag') ?? undefined;
    this.cache.set(url, { snapshot, fetchedAt: Date.now(), etag });
    return snapshot;
  }

  invalidate(url?: string): void {
    if (url) this.cache.delete(url);
    else this.cache.clear();
  }

  /** Discover a site's manifest. Returns the parsed JSON. */
  async manifest(siteOrUrl: string, opts: FetchOptions = {}): Promise<unknown> {
    const fetcher = opts.fetch ?? globalThis.fetch;
    const base = siteOrUrl.replace(/\/$/, '');
    const url = base.endsWith('/.well-known/ahtml.json')
      ? base
      : base + '/.well-known/ahtml.json';
    const res = await fetcher(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new AHTMLError(res.status, `manifest fetch failed for ${url}`);
    return res.json();
  }
}

export class AHTMLError extends Error {
  constructor(public status: number, message: string) {
    super(`AHTML ${status}: ${message}`);
    this.name = 'AHTMLError';
  }
}

function isFresh(cached: CachedSnapshot): boolean {
  const ttl = cached.snapshot.ttl;
  if (ttl == null) return false;
  return Date.now() - cached.fetchedAt < ttl * 1000;
}

function failOrStale(err: unknown, cached: CachedSnapshot | undefined, o: FetchOptions): Response | unknown {
  if (cached && o.allowStale) {
    return new Response(null, { status: 504 }); // signal caller to keep cached
  }
  return err;
}

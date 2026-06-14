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
 *   - v0.6.0: typed `AHTMLError` for every failure mode, opt-in retry with
 *     backoff + Retry-After honoring, configurable timeout (AbortController),
 *     in-flight request coalescing (parallel `fetch(url)` calls dedupe to
 *     one network request), and an `onEvent` hook for structured logging.
 *   - v0.9.0: OpenTelemetry spans wrap `fetch()` and `streamSnapshot()` via
 *     the framework-neutral `trace` helper from `@ahtmljs/schema`. The helper
 *     is a no-op when no OTEL provider is registered, so non-instrumented
 *     callers pay nothing.
 *
 * No network library — uses the global fetch (Node 20+, modern browsers).
 */

import {
  fromCompact,
  fromJson,
  applyDiff,
  validate,
  AHTMLError,
  DEFAULT_HINTS,
  parseStream,
  STREAM_CONTENT_TYPE,
  InMemoryCacheStore,
  trace,
  snapshot as buildSnapshot,
  type AHTMLErrorCode,
  type CacheStore,
  type Entity,
  type Action,
  type Snapshot,
  type SnapshotDiff,
  type StreamRecord,
} from '@ahtmljs/schema';
import {
  extractFromSchemaOrg,
  extractFromOpenGraph,
  extractFromDataAttrs,
  extractFromMicrodata,
  mergeExtractions,
} from '@ahtmljs/schema/extract';
import { PageView } from './page-view.js';

/**
 * Retry policy governing transient-failure recovery for a single
 * client call. Defaults are conservative: 3 attempts on
 * NETWORK / TIMEOUT / RATE_LIMITED / 5xx with exponential backoff
 * and ±25% jitter.
 */
export interface RetryPolicy {
  /** Max attempts including the first try. 0 or 1 disables retries. */
  attempts?: number;
  /** Codes that are eligible for retry. Defaults to NETWORK / TIMEOUT / RATE_LIMITED / 5xx HTTP_STATUS. */
  on?: AHTMLErrorCode[];
  /** Base delay in milliseconds (exponential: base * 2^attempt). */
  baseDelayMs?: number;
  /** Cap on per-attempt delay. */
  maxDelayMs?: number;
  /** When the server returns Retry-After, use it verbatim instead of the computed backoff. */
  respectRetryAfter?: boolean;
  /** Add up to ±25% jitter to each delay to avoid retry storms. */
  jitter?: boolean;
}

/**
 * Per-call fetch options. Anything omitted falls back to the
 * `ClientOptions` defaults passed to the `AHTMLClient` constructor.
 */
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
  /** Per-request timeout in ms. Default: client-level `timeout` (or `30_000`). */
  timeout?: number;
  /** Retry policy. `true` enables defaults; `false` disables. */
  retry?: boolean | RetryPolicy;
  /** Disable in-flight coalescing for this call. Default: on. */
  coalesce?: boolean;
}

/**
 * The cache entry shape stored by `AHTMLClient`. Plug-in cache
 * backends must serialize/deserialize this shape verbatim.
 */
export interface CachedSnapshot {
  snapshot: Snapshot;
  fetchedAt: number;
  etag?: string;
}

/**
 * Events emitted through `onEvent` for structured observability. Never
 * `console.log` inside library code — adopters wire their own logger.
 */
export type ClientEvent =
  | { type: 'request'; url: string; ms: number; status: number }
  | { type: 'cache_hit'; url: string }
  | { type: 'cache_miss'; url: string }
  | { type: 'diff_applied'; url: string; changes: number }
  | { type: 'coalesced'; url: string }
  | { type: 'retry'; url: string; attempt: number; delayMs: number; code: AHTMLErrorCode }
  | { type: 'error'; url: string; code: AHTMLErrorCode; status?: number };

/**
 * Client-wide defaults. Per-call `FetchOptions` overlay these.
 */
export interface ClientOptions extends FetchOptions {
  /** Client-wide per-request timeout in ms. Default 30_000. */
  timeout?: number;
  /** Structured-log hook. Called for every internal event. */
  onEvent?: (e: ClientEvent) => void;
  /**
   * Snapshot cache backend. Defaults to a bounded in-memory `Map`
   * (1000 entries). Swap for `@ahtmljs/kv/upstash`, `@ahtmljs/kv/cloudflare`,
   * or your own `CacheStore<CachedSnapshot>` to share cache across
   * replicas. v0.6 callers pass nothing and inherit the default.
   */
  cache?: CacheStore<CachedSnapshot>;
  /** When true, fetching a URL that returns text/html runs the auto-extractors
   * and returns an extracted snapshot rather than throwing COMPACT_PARSE.
   * Note: `fetchPage()` always performs HTML fallback regardless of this flag. */
  htmlFallback?: boolean;
}

const DEFAULT_RETRY: Required<RetryPolicy> = {
  attempts: 3,
  on: ['NETWORK', 'TIMEOUT', 'RATE_LIMITED', 'HTTP_STATUS'],
  baseDelayMs: 250,
  maxDelayMs: 10_000,
  respectRetryAfter: true,
  jitter: true,
};

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * The agent-side AHTML fetcher. Use one client per process / worker;
 * cache + in-flight coalescing live on the instance.
 *
 * v0.9.0 wraps the public `fetch()` and `streamSnapshot()` paths in
 * OpenTelemetry spans (`ahtml.client.fetch`, `ahtml.client.stream`)
 * via the framework-neutral `trace` helper from `@ahtmljs/schema`.
 * When no OTEL provider is registered, `trace` is a zero-overhead
 * pass-through.
 */
export class AHTMLClient {
  /**
   * v0.7.0: cache is a pluggable `CacheStore<CachedSnapshot>`. Default is
   * the in-memory bounded LRU adapter — drop-in equivalent to the v0.6
   * `Map`. Pass `{ cache: redisStore }` to share across replicas.
   */
  private cache: CacheStore<CachedSnapshot>;
  // v0.6.0: in-flight request coalescing — two parallel `fetch(url)` calls
  // for the same URL share one HTTP request. Keyed by the cache key.
  private inflight = new Map<string, Promise<Snapshot>>();
  private onEvent?: (e: ClientEvent) => void;

  constructor(private defaults: ClientOptions = {}) {
    if (defaults.onEvent) this.onEvent = defaults.onEvent;
    this.cache = defaults.cache ?? new InMemoryCacheStore<CachedSnapshot>(1000);
  }

  /**
   * Fetch the snapshot for a URL. Uses ETag-based incremental fetch by
   * default; falls back to the diff endpoint when the cached snapshot is
   * stale enough that the server might prefer to send a delta.
   *
   * v0.9.0: the entire call is wrapped in an `ahtml.client.fetch` span
   * with `ahtml.url` and `ahtml.format` attributes. Inner HTTP retries
   * remain a single span — child spans for individual attempts are a
   * future enhancement.
   */
  fetch(url: string, opts: FetchOptions = {}): Promise<Snapshot> {
    return trace(
      'ahtml.client.fetch',
      async () => {
        const o = { ...this.defaults, ...opts };
        const coalesceOn = o.coalesce !== false;
        const key = coalesceKey(url, o);

        if (coalesceOn) {
          const inflight = this.inflight.get(key);
          if (inflight) {
            this.emit({ type: 'coalesced', url });
            return inflight;
          }
        }

        const p = this.fetchOnce(url, o).finally(() => {
          this.inflight.delete(key);
        });
        if (coalesceOn) this.inflight.set(key, p);
        return p;
      },
      { 'ahtml.url': url, 'ahtml.format': opts?.format ?? 'compact' },
    );
  }

  /**
   * v0.9.2: universal fetcher — works against ANY URL, not just AHTML-adopting
   * sites. If the server responds with AHTML content-type the snapshot is
   * returned as `provenance: 'authoritative'`. If the server returns regular
   * HTML the auto-extractors run and produce an extracted snapshot
   * (`provenance: 'extracted'`). Extracted snapshots never carry `actions`
   * since the markup source is untrusted.
   */
  async fetchPage(url: string, opts: FetchOptions = {}): Promise<PageView> {
    const o = { ...this.defaults, ...opts };
    const fetcher = o.fetch ?? globalThis.fetch;
    const timeoutMs = o.timeout ?? this.defaults.timeout ?? DEFAULT_TIMEOUT_MS;
    const retry = normalizeRetry(o.retry, this.defaults.retry);

    // Accept AHTML first; fall back to HTML
    const headers = requestHeaders(
      'application/ahtml+text, application/ahtml+json;q=0.9, text/html;q=0.5',
      o,
    );
    const res = await this.doFetch(fetcher, url, { headers }, timeoutMs, retry, url);
    if (!res.ok) throw await httpError(url, res);

    const ct = res.headers.get('content-type') ?? '';

    if (ct.includes('application/ahtml')) {
      // Site is an AHTML adopter — use normal parsing path
      const snap = await this.storeFromResponse(url, res);
      return new PageView(snap, { provenance: 'authoritative' });
    }

    // HTML fallback path — extract structured data from the page
    const html = await res.text();

    const merged = mergeExtractions([
      extractFromDataAttrs(html),
      extractFromSchemaOrg(html),
      extractFromMicrodata(html),
      extractFromOpenGraph(html),
    ]);

    const pageType = merged.page_type ?? 'other';
    const builder = buildSnapshot(url, pageType as Parameters<typeof buildSnapshot>[1]);
    for (const entity of merged.entities) builder.add(entity);
    // Extracted snapshots do NOT carry actions — untrusted markup
    const snap = builder.build();
    snap.provenance = { source: 'extracted' };

    return new PageView(snap, { provenance: 'extracted' });
  }

  private async fetchOnce(url: string, o: FetchOptions): Promise<Snapshot> {
    const fetcher = o.fetch ?? this.defaults.fetch ?? globalThis.fetch;
    const cached = await this.cache.get(url);
    const retry = normalizeRetry(o.retry, this.defaults.retry);
    const timeoutMs = o.timeout ?? this.defaults.timeout ?? DEFAULT_TIMEOUT_MS;

    // 1) Fresh cache (within TTL) — skip the network entirely.
    if (cached && !o.noCache && isFresh(cached)) {
      this.emit({ type: 'cache_hit', url });
      return cached.snapshot;
    }

    const accept =
      o.format === 'json'
        ? 'application/ahtml+json'
        : 'application/ahtml+text';

    // 2) Try a diff request if we already have a snapshot.
    if (cached && !o.noCache) {
      const diffUrl = url + (url.includes('?') ? '&' : '?') + 'since=' + encodeURIComponent(cached.etag ?? '');
      try {
        const res = await this.doFetch(fetcher, diffUrl, {
          headers: requestHeaders('application/ahtml-diff+json, ' + accept, o),
        }, timeoutMs, retry, url);

        const ct = res.headers.get('content-type') ?? '';
        if (res.ok && ct.includes('application/ahtml-diff+json')) {
          const d = (await res.json()) as SnapshotDiff;
          const next = applyDiff(cached.snapshot, d);
          const etag = res.headers.get('etag') ?? d.to_etag;
          await this.cache.set(url, { snapshot: next, fetchedAt: Date.now(), etag });
          this.emit({ type: 'diff_applied', url, changes: d.changes.length });
          return next;
        }
        if (res.ok && ct.includes('application/ahtml')) {
          return this.storeFromResponse(url, res);
        }
        if (res.status === 304) {
          await this.cache.set(url, { ...cached, fetchedAt: Date.now() });
          this.emit({ type: 'cache_hit', url });
          return cached.snapshot;
        }
        // anything else — fall through to a fresh fetch
      } catch (err) {
        if (cached && o.allowStale) return cached.snapshot;
        // fall through to fresh GET; the GET path may succeed where diff didn't.
        if (!AHTMLError.is(err)) throw err;
      }
    }

    // 3) Conditional or fresh GET.
    const headers = requestHeaders(accept, o);
    if (cached?.etag && !o.noCache) headers['if-none-match'] = cached.etag;

    let res: Response;
    try {
      res = await this.doFetch(fetcher, url, { headers }, timeoutMs, retry, url);
    } catch (err) {
      if (cached && o.allowStale) return cached.snapshot;
      throw err;
    }

    if (res.status === 304 && cached) {
      await this.cache.set(url, { ...cached, fetchedAt: Date.now() });
      this.emit({ type: 'cache_hit', url });
      return cached.snapshot;
    }
    if (!res.ok) {
      if (cached && o.allowStale) return cached.snapshot;
      throw await httpError(url, res);
    }
    this.emit({ type: 'cache_miss', url });
    // TODO(v0.9.x): when the agent grows automatic signed-snapshot
    // verification, wrap the verifySnapshot call site here in a
    // `trace('ahtml.client.verify', ..., { 'ahtml.url': url })` span so
    // signature-check latency is visible alongside fetch latency.
    return this.storeFromResponse(url, res);
  }

  private async doFetch(
    fetcher: typeof fetch,
    targetUrl: string,
    init: RequestInit,
    timeoutMs: number,
    retry: Required<RetryPolicy>,
    eventUrl: string,
  ): Promise<Response> {
    let attempt = 0;
    const maxAttempts = Math.max(1, retry.attempts);

    for (;;) {
      const start = Date.now();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      let res: Response | null = null;
      let thrown: unknown = null;
      try {
        res = await fetcher(targetUrl, { ...init, signal: ctrl.signal });
      } catch (err) {
        thrown = err;
      } finally {
        clearTimeout(timer);
      }

      if (res) {
        this.emit({ type: 'request', url: eventUrl, ms: Date.now() - start, status: res.status });
        if (res.status === 429 && shouldRetry('RATE_LIMITED', retry, attempt, maxAttempts)) {
          const delay = retryAfterDelay(res, retry) ?? backoff(attempt, retry);
          this.emit({ type: 'retry', url: eventUrl, attempt: attempt + 1, delayMs: delay, code: 'RATE_LIMITED' });
          await sleep(delay);
          attempt++;
          continue;
        }
        if (res.status >= 500 && res.status < 600 && shouldRetry('HTTP_STATUS', retry, attempt, maxAttempts)) {
          const delay = backoff(attempt, retry);
          this.emit({ type: 'retry', url: eventUrl, attempt: attempt + 1, delayMs: delay, code: 'HTTP_STATUS' });
          await sleep(delay);
          attempt++;
          continue;
        }
        return res;
      }

      // Network or abort
      const aborted = isAbortError(thrown);
      const code: AHTMLErrorCode = aborted ? 'TIMEOUT' : 'NETWORK';
      if (shouldRetry(code, retry, attempt, maxAttempts)) {
        const delay = backoff(attempt, retry);
        this.emit({ type: 'retry', url: eventUrl, attempt: attempt + 1, delayMs: delay, code });
        await sleep(delay);
        attempt++;
        continue;
      }
      this.emit({ type: 'error', url: eventUrl, code });
      throw new AHTMLError({
        code,
        message: aborted
          ? `request timed out after ${timeoutMs}ms`
          : `fetch failed: ${(thrown as Error)?.message ?? String(thrown)}`,
        hint: DEFAULT_HINTS[code],
        retryable: true,
        cause: thrown,
        context: eventUrl,
      });
    }
  }

  private async storeFromResponse(url: string, res: Response): Promise<Snapshot> {
    const ct = res.headers.get('content-type') ?? '';
    const body = await res.text();
    let snapshot: Snapshot;
    try {
      snapshot = ct.includes('application/ahtml+json') ? fromJson(body) : fromCompact(body);
    } catch (err) {
      // Parser already threw AHTMLError with JSON_PARSE / COMPACT_PARSE; surface
      // through onEvent for observability.
      if (AHTMLError.is(err)) this.emit({ type: 'error', url, code: err.code });
      throw err;
    }
    const issues = validate(snapshot);
    const errors = issues.filter((i) => i.severity === 'error');
    if (errors.length) {
      this.emit({ type: 'error', url, code: 'CACHE_POISONED', status: 502 });
      throw new AHTMLError({
        code: 'CACHE_POISONED',
        status: 502,
        message:
          `server returned an invalid AHTML snapshot: ` +
          errors.slice(0, 3).map((e) => `${e.path}: ${e.message}`).join('; '),
        hint: DEFAULT_HINTS.CACHE_POISONED,
        path: errors[0]?.path,
        cause: errors,
        context: url,
      });
    }
    const etag = res.headers.get('etag') ?? undefined;
    await this.cache.set(url, { snapshot, fetchedAt: Date.now(), etag });
    return snapshot;
  }

  /**
   * Drop the cached entry for one URL, or the whole cache if `url` is
   * omitted. Use this when an out-of-band invalidation (webhook,
   * publish event) tells you the upstream snapshot has rolled forward.
   */
  async invalidate(url?: string): Promise<void> {
    if (url) await this.cache.delete(url);
    else await this.cache.clear();
  }

  /**
   * v0.7.0: stream a snapshot record-by-record. Returns an `AsyncIterable`
   * over `StreamRecord`s — caller can begin processing entities while later
   * ones are still on the wire. End-to-end peak memory stays bounded by
   * the per-entity working set rather than the full snapshot.
   *
   * Caller is responsible for the iteration lifecycle: do NOT skip the
   * `kind: 'end'` record if you rely on its `etag`. The client does not
   * populate its snapshot cache on stream paths — call `fetch(url)` if
   * you also want the cache to warm up.
   *
   * v0.9.0: the request-setup phase (up to the point we begin yielding
   * records) is wrapped in an `ahtml.client.stream` span. The yielded
   * iterator itself is not enclosed by the span because the span would
   * have to outlive the caller's loop; that would skew duration metrics
   * and entangle span lifetime with backpressure. Per-record spans are
   * out of scope — record bandwidth would dominate the cost.
   */
  async *streamSnapshot(url: string, opts: FetchOptions = {}): AsyncIterable<StreamRecord> {
    const body = await trace(
      'ahtml.client.stream',
      async (): Promise<ReadableStream<Uint8Array>> => {
        const o = { ...this.defaults, ...opts };
        const fetcher = o.fetch ?? globalThis.fetch;
        const headers = requestHeaders(STREAM_CONTENT_TYPE, o);
        const retry = normalizeRetry(o.retry, this.defaults.retry);
        const timeoutMs = o.timeout ?? this.defaults.timeout ?? DEFAULT_TIMEOUT_MS;
        const res = await this.doFetch(fetcher, url, { headers }, timeoutMs, retry, url);
        if (!res.ok) throw await httpError(url, res);
        const ct = res.headers.get('content-type') ?? '';
        if (!ct.includes(STREAM_CONTENT_TYPE)) {
          throw new AHTMLError({
            code: 'HTTP_STATUS',
            status: res.status,
            message: `expected ${STREAM_CONTENT_TYPE} but server returned ${ct || 'no content-type'}`,
            hint: 'The server did not advertise streaming. Either pass routeOpts.stream = true on the route, or use client.fetch() instead.',
            context: url,
          });
        }
        if (!res.body) {
          throw new AHTMLError({
            code: 'NETWORK',
            message: 'stream response had no body',
            hint: DEFAULT_HINTS.NETWORK,
            context: url,
          });
        }
        return res.body;
      },
      { 'ahtml.url': url, 'ahtml.format': opts?.format ?? 'compact' },
    );
    yield* parseStream(body);
  }

  /** Convenience: stream only the entity records (skip envelope/actions/end). */
  async *streamEntities(url: string, opts: FetchOptions = {}): AsyncIterable<Entity> {
    for await (const r of this.streamSnapshot(url, opts)) {
      if (r.kind === 'entity') yield r.entity;
    }
  }

  /** Convenience: stream only the action records. */
  async *streamActions(url: string, opts: FetchOptions = {}): AsyncIterable<Action> {
    for await (const r of this.streamSnapshot(url, opts)) {
      if (r.kind === 'action') yield r.action;
    }
  }

  /** Discover a site's manifest. Returns the parsed JSON. */
  async manifest(siteOrUrl: string, opts: FetchOptions = {}): Promise<unknown> {
    const fetcher = opts.fetch ?? this.defaults.fetch ?? globalThis.fetch;
    const base = siteOrUrl.replace(/\/$/, '');
    const url = base.endsWith('/.well-known/ahtml.json')
      ? base
      : base + '/.well-known/ahtml.json';
    const timeoutMs = opts.timeout ?? this.defaults.timeout ?? DEFAULT_TIMEOUT_MS;
    const retry = normalizeRetry(opts.retry, this.defaults.retry);
    const res = await this.doFetch(
      fetcher,
      url,
      { headers: { accept: 'application/json' } },
      timeoutMs,
      retry,
      url,
    );
    if (!res.ok) throw await httpError(url, res);
    return res.json();
  }

  private emit(e: ClientEvent): void {
    if (!this.onEvent) return;
    try {
      this.onEvent(e);
    } catch {
      // Logger faults must never break the request path.
    }
  }
}

/**
 * Re-export so adopters can `import { AHTMLError } from '@ahtmljs/agent'`
 * without reaching into the schema package. This is the *same class* as
 * `@ahtmljs/schema`'s — there is exactly one error type across the stack.
 */
export { AHTMLError };

/** Build outbound headers honoring agent identity + bearer auth. */
function requestHeaders(accept: string, o: FetchOptions): Record<string, string> {
  const h: Record<string, string> = { accept };
  if (o.agent) h['user-agent'] = o.agent;
  // `bearer` was documented but not wired until v0.4.0 — auth-gated content
  // depends on this header reaching the origin.
  if (o.bearer) h['authorization'] = `Bearer ${o.bearer}`;
  return h;
}

function isFresh(cached: CachedSnapshot): boolean {
  const ttl = cached.snapshot.ttl;
  if (ttl == null) return false;
  return Date.now() - cached.fetchedAt < ttl * 1000;
}

function coalesceKey(url: string, o: FetchOptions): string {
  // Vary by format + bearer presence so a json-and-compact mix doesn't collide.
  return `${o.format ?? 'compact'}|${o.bearer ? 'auth' : 'noauth'}|${url}`;
}

function normalizeRetry(
  perCall: FetchOptions['retry'],
  defaults: ClientOptions['retry'],
): Required<RetryPolicy> {
  const eff = perCall !== undefined ? perCall : defaults;
  if (eff === false) return { ...DEFAULT_RETRY, attempts: 1 };
  if (eff === true || eff === undefined) return { ...DEFAULT_RETRY, attempts: 1 };
  return { ...DEFAULT_RETRY, ...eff };
}

function shouldRetry(
  code: AHTMLErrorCode,
  retry: Required<RetryPolicy>,
  attempt: number,
  maxAttempts: number,
): boolean {
  if (attempt + 1 >= maxAttempts) return false;
  return retry.on.includes(code);
}

function backoff(attempt: number, retry: Required<RetryPolicy>): number {
  const raw = retry.baseDelayMs * Math.pow(2, attempt);
  const capped = Math.min(raw, retry.maxDelayMs);
  if (!retry.jitter) return capped;
  // ±25% jitter
  const j = capped * (0.75 + Math.random() * 0.5);
  return Math.round(j);
}

/** Parse `Retry-After` (RFC 7231) to milliseconds. No clamping. */
function parseRetryAfter(res: Response): number | null {
  const hdr = res.headers.get('retry-after');
  if (!hdr) return null;
  const secs = Number(hdr);
  if (Number.isFinite(secs) && secs >= 0) return secs * 1000;
  const date = Date.parse(hdr);
  if (Number.isFinite(date)) {
    const delta = date - Date.now();
    if (delta > 0) return delta;
  }
  return null;
}

function retryAfterDelay(res: Response, retry: Required<RetryPolicy>): number | null {
  if (!retry.respectRetryAfter) return null;
  const raw = parseRetryAfter(res);
  if (raw == null) return null;
  return Math.min(raw, retry.maxDelayMs);
}

function isAbortError(e: unknown): boolean {
  return e instanceof Error && (e.name === 'AbortError' || /abort/i.test(e.message));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function httpError(url: string, res: Response): Promise<AHTMLError> {
  const body = await res.text().catch(() => '');
  const status = res.status;
  let code: AHTMLErrorCode;
  let retryable = false;
  if (status === 401) code = 'AUTH_REQUIRED';
  else if (status === 403) code = 'POLICY_DENIED';
  else if (status === 429) { code = 'RATE_LIMITED'; retryable = true; }
  else if (status >= 500) { code = 'HTTP_STATUS'; retryable = true; }
  else code = 'HTTP_STATUS';
  const retryAfter = parseRetryAfter(res);
  return new AHTMLError({
    code,
    status,
    retryable,
    message: `AHTML ${status}: ${body.slice(0, 200) || res.statusText || 'request failed'}`,
    hint: DEFAULT_HINTS[code],
    ...(retryAfter !== null ? { retryAfterMs: retryAfter } : {}),
    context: url,
  });
}

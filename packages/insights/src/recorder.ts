/**
 * Recorder + middleware — T5.2 / T5.5.
 *
 * `createInsights({ kv, site })` returns an {@link Insights} handle that:
 *   - classifies each request (verified agent / bot / human) via T5.1,
 *   - derives the negotiated format from the *response* Content-Type,
 *   - derives the outcome (snapshot ok/not_modified/denied/error, or
 *     action invoked/refused/paid) from the method + status + x402 signal,
 *   - and appends exactly the six allowed fields to the KV-backed store.
 *
 * It exposes a Next.js route wrapper (`withInsights`) and a Hono middleware
 * (`honoMiddleware`) so the same recording logic drops into both adapters.
 * Recording only ever reads request/response *headers* and the status line —
 * never a body, query string, cookie, or arbitrary header value — so it is
 * structurally incapable of leaking PII (T5.3).
 */

import type { KvStore } from '@ahtmljs/kv';
import type { VerifyKey } from '@ahtmljs/schema';
import {
  classifyRequest,
  type Classification,
  type ClassifyInput,
  type HeadersLike,
} from './classify.js';
import {
  formatFromContentType,
  pathnameOnly,
  type InsightEvent,
  type InsightFormat,
  type InsightOutcome,
} from './events.js';
import { InsightStore, type InsightStoreOptions } from './store.js';

export interface InsightsConfig {
  /** Any `@ahtmljs/kv` backend: memory, Cloudflare KV, or Upstash Redis. */
  kv: KvStore;
  /** Canonical site identifier — namespaces the stored events. */
  site: string;
  /**
   * Trusted keys for RFC 9421 verification. Without them a signed request
   * classifies as `unverified` (never `verified`).
   */
  keys?: VerifyKey[];
  /** Max signature age in seconds (default 300). */
  maxAge?: number;
  /** Per-event retention hint in ms (default: unbounded). */
  ttlMs?: number;
  /** Key namespace prefix (default `insights`). */
  namespace?: string;
}

/** Minimal response shape the recorder reads — status line + headers only. */
export interface ResponseLike {
  status?: number;
  headers?: HeadersLike;
}

export interface RecordOptions {
  /** Force the outcome instead of deriving it from method + status. Use
   *  this to record a policy/safety refusal the HTTP status doesn't show. */
  outcome?: InsightOutcome;
  /** Force the format instead of deriving it from Content-Type. */
  format?: InsightFormat;
  /** Reuse a classification already computed for this request. */
  classification?: Classification;
  /** Override the event timestamp (tests / replays). */
  ts?: string;
}

/** A request the recorder can read: a Fetch `Request` or the classify triple. */
export type RecordRequest = Request | ClassifyInput;

export interface Insights {
  /** The underlying KV-backed store (export / count / clear). */
  readonly store: InsightStore;
  /** Classify + derive + append one event. Returns the stored event. */
  record(req: RecordRequest, res?: ResponseLike, opts?: RecordOptions): Promise<InsightEvent>;
  /** Wrap a Next.js App Router route handler so every call is recorded. */
  withInsights<H extends NextRouteHandler>(handler: H): H;
  /** A Hono middleware that records after `next()` resolves. */
  honoMiddleware(): HonoMiddleware;
  /** Read every stored event, oldest first. */
  export(): Promise<InsightEvent[]>;
}

/** Next.js App Router handler shape: `(req, ctx?) => Response`. */
export type NextRouteHandler = (
  req: Request,
  ctx?: unknown,
) => Response | Promise<Response>;

/** Structural slice of a Hono context + middleware, matching `@ahtmljs/hono`. */
export interface HonoContextLike {
  req?: { raw?: Request; url?: string; method?: string };
  res?: Response;
}
export type HonoMiddleware = (
  c: HonoContextLike,
  next: () => Promise<void>,
) => Promise<void>;

/* -------------------------------------------------------------------------- */
/* header access — works on Headers, a get()-bag, or a plain record           */
/* -------------------------------------------------------------------------- */

function getHeader(headers: HeadersLike | undefined, name: string): string | null {
  if (!headers) return null;
  const asGet = headers as { get?: (n: string) => string | null };
  if (typeof asGet.get === 'function') return asGet.get(name);
  const rec = headers as Record<string, string | undefined>;
  const direct = rec[name] ?? rec[name.toLowerCase()];
  if (direct != null) return direct;
  const wanted = name.toLowerCase();
  for (const [k, v] of Object.entries(rec)) {
    if (k.toLowerCase() === wanted && v != null) return v;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* request/response normalization                                             */
/* -------------------------------------------------------------------------- */

interface NormalizedReq {
  method: string;
  path: string;
  headers: HeadersLike;
  hadPayment: boolean;
}

function normalizeRequest(req: RecordRequest): NormalizedReq {
  if (req instanceof Request) {
    return {
      method: req.method,
      path: pathnameOnly(req.url),
      headers: req.headers,
      hadPayment: req.headers.has('x-payment'),
    };
  }
  const method = String(req.method ?? 'GET');
  return {
    method,
    path: pathnameOnly(String(req.path ?? '/')),
    headers: req.headers,
    hadPayment: getHeader(req.headers, 'x-payment') != null,
  };
}

/**
 * Derive the outcome from the method, response status, and whether the
 * request carried an x402 payment token.
 *
 *   snapshot fetch (GET/HEAD): 2xx → ok, 304 → not_modified,
 *                              401/403 → denied, else → error
 *   action (other methods):    2xx+payment → paid, 2xx → invoked,
 *                              402 → refused, 401/403 → denied, else → error
 *
 * A 402 (Payment Required) is the x402 "refused pending payment" state; the
 * agent then pays and retries, and the successful retry — carrying
 * `X-Payment` — records as `paid`. That is the three-way invoked/refused/paid
 * split the x402 acceptance criterion asks for.
 */
function deriveOutcome(method: string, status: number, hadPayment: boolean): InsightOutcome {
  const isAction = method !== 'GET' && method !== 'HEAD';
  if (isAction) {
    if (status === 402) return 'refused';
    if (status === 401 || status === 403) return 'denied';
    if (status >= 200 && status < 300) return hadPayment ? 'paid' : 'invoked';
    return 'error';
  }
  if (status === 304) return 'not_modified';
  if (status === 401 || status === 403) return 'denied';
  if (status >= 200 && status < 300) return 'ok';
  return 'error';
}

/* -------------------------------------------------------------------------- */
/* createInsights                                                             */
/* -------------------------------------------------------------------------- */

export function createInsights(config: InsightsConfig): Insights {
  const storeOpts: InsightStoreOptions = {};
  if (config.ttlMs != null) storeOpts.ttlMs = config.ttlMs;
  if (config.namespace != null) storeOpts.namespace = config.namespace;
  const store = new InsightStore(config.kv, config.site, storeOpts);

  async function record(
    req: RecordRequest,
    res?: ResponseLike,
    opts: RecordOptions = {},
  ): Promise<InsightEvent> {
    const norm = normalizeRequest(req);

    const classification =
      opts.classification ??
      (await classifyRequest(req, {
        ...(config.keys ? { keys: config.keys } : {}),
        ...(config.maxAge != null ? { maxAge: config.maxAge } : {}),
      }));

    const status = res?.status ?? (res ? 200 : 0);
    const contentType = getHeader(res?.headers, 'content-type');
    const format = opts.format ?? formatFromContentType(contentType);
    const outcome =
      opts.outcome ??
      (res ? deriveOutcome(norm.method, status, norm.hadPayment) : 'error');

    const event: InsightEvent = {
      ts: opts.ts ?? new Date().toISOString(),
      method: norm.method,
      path: norm.path,
      agent: {
        kind: classification.kind,
        ...(classification.identity?.id ? { id: classification.identity.id } : {}),
      },
      ...(format ? { format } : {}),
      outcome,
    };
    return store.record(event);
  }

  function withInsights<H extends NextRouteHandler>(handler: H): H {
    const wrapped = async (req: Request, ctx?: unknown): Promise<Response> => {
      let res: Response;
      try {
        res = await handler(req, ctx);
      } catch (err) {
        // Record the failure, then re-throw so the wrapper is transparent.
        await record(req, undefined, { outcome: 'error' }).catch(() => {});
        throw err;
      }
      await record(req, res).catch(() => {});
      return res;
    };
    return wrapped as unknown as H;
  }

  function honoMiddleware(): HonoMiddleware {
    return async (c, next) => {
      await next();
      const raw = c.req?.raw;
      if (!(raw instanceof Request) || !c.res) return;
      await record(raw, c.res).catch(() => {});
    };
  }

  return {
    store,
    record,
    withInsights,
    honoMiddleware,
    export: () => store.export(),
  };
}

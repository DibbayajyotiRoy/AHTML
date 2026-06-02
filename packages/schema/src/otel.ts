/**
 * v0.9.0 — optional OpenTelemetry tracing helper.
 *
 * `@opentelemetry/api` is a soft, optional peer dependency: users who
 * never install it see zero overhead beyond a single boolean check, and
 * `@ahtmljs/schema` keeps its install footprint tiny. Users who *do*
 * install it get full span coverage of every `trace(name, fn)` site
 * across the AHTML stack without any wiring.
 *
 * Design constraints:
 *   - No `node:*` imports — the module must run on Workers, Deno, Bun,
 *     browsers, and Node ≥ 20 alike.
 *   - The dynamic import is memoized so it runs at most once per
 *     process; subsequent `trace()` calls are a synchronous fast path
 *     when OTel is absent.
 *   - When OTel is absent, `trace()` reduces to `Promise.resolve(fn())`.
 *     No tracer is allocated, no span is created, no allocations happen
 *     beyond the user's own `fn`.
 *
 * Usage:
 * ```ts
 * import { trace } from '@ahtmljs/schema';
 * const snap = await trace('schema.validate', () => validate(input), {
 *   'ahtml.url': input.url,
 * });
 * ```
 */

import { AHTML_VERSION } from './types.js';

/**
 * Minimal structural type for the subset of `@opentelemetry/api` we
 * touch. We avoid `typeof import('@opentelemetry/api')` because the
 * package is an *optional* peer dep — it is intentionally absent from
 * our own `devDependencies`, so a hard type-import would break `tsc`
 * for anyone building `@ahtmljs/schema` from source without OTel
 * installed. The shape below matches the public 1.x API.
 */
interface OtelApi {
  trace: {
    getTracer(name: string, version?: string): {
      startSpan(name: string): OtelSpan;
    };
    getActiveSpan(): OtelSpan | undefined;
    setSpan(ctx: unknown, span: OtelSpan): unknown;
  };
  context: {
    active(): unknown;
    with<F extends (...args: never[]) => unknown>(ctx: unknown, fn: F): ReturnType<F>;
  };
  SpanStatusCode: { OK: number; ERROR: number };
}

interface OtelSpan {
  setAttribute(key: string, value: string | number | boolean): void;
  setStatus(s: { code: number; message?: string }): void;
  recordException(e: Error): void;
  addEvent(name: string, attrs?: Record<string, string | number | boolean>): void;
  end(): void;
}

/** Status codes accepted by {@link setStatus}. Mirrors `SpanStatusCode`. */
export type OtelStatusCode = 'ok' | 'error';

/** Resolved OTel API module, or `null` if the peer dep isn't installed. */
let cached: OtelApi | null | undefined;
/** In-flight import promise — guarantees we only attempt the import once. */
let inflight: Promise<OtelApi | null> | undefined;

/**
 * Resolve `@opentelemetry/api` at most once per process. Returns `null`
 * when the optional peer dep is not installed, so callers can treat the
 * absence as a fast no-op.
 */
async function loadOtel(): Promise<OtelApi | null> {
  if (cached !== undefined) return cached;
  if (!inflight) {
    // The specifier is built as a runtime string so `tsc` does not try
    // to resolve `@opentelemetry/api` at compile time — the package is
    // an optional peer and is intentionally not in our devDependencies.
    const spec = '@opentelemetry/api';
    inflight = (import(/* @vite-ignore */ spec) as Promise<OtelApi>)
      .then((mod) => {
        cached = mod;
        return mod;
      })
      .catch(() => {
        cached = null;
        return null;
      });
  }
  return inflight;
}

/**
 * Run `fn` inside an OpenTelemetry span when `@opentelemetry/api` is
 * installed; otherwise call `fn()` directly. The span is named `name`,
 * attributed with `attrs`, and ended in a `finally`. Thrown errors are
 * recorded on the span and re-thrown unchanged.
 *
 * This is the only public entry point you need in normal code — both
 * sync and async `fn` work, and the return type follows `fn`'s return.
 */
export async function trace<T>(
  name: string,
  fn: () => Promise<T> | T,
  attrs?: Record<string, unknown>,
): Promise<T> {
  const otel = await loadOtel();
  if (!otel) return await fn();

  const tracer = otel.trace.getTracer('@ahtmljs/schema', AHTML_VERSION);
  const span = tracer.startSpan(name);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      // OTel attribute values must be primitives or arrays of primitives;
      // anything else is coerced to JSON to avoid silent drops.
      const safe =
        typeof v === 'string' ||
        typeof v === 'number' ||
        typeof v === 'boolean'
          ? v
          : JSON.stringify(v);
      span.setAttribute(k, safe as string | number | boolean);
    }
  }
  try {
    return await otel.context.with(
      otel.trace.setSpan(otel.context.active(), span),
      fn,
    );
  } catch (err) {
    span.recordException(err as Error);
    span.setStatus({
      code: otel.SpanStatusCode.ERROR,
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  } finally {
    span.end();
  }
}

/**
 * Add a structured event to the currently-active span. No-op when OTel
 * is absent or no span is active. Safe to call from any code path.
 */
export function addEvent(
  name: string,
  attrs?: Record<string, unknown>,
): void {
  if (!cached) return;
  const span = cached.trace.getActiveSpan();
  if (!span) return;
  span.addEvent(name, attrs as Record<string, string | number | boolean>);
}

/**
 * Set the status of the currently-active span. No-op when OTel is
 * absent or no span is active.
 */
export function setStatus(code: OtelStatusCode, message?: string): void {
  if (!cached) return;
  const span = cached.trace.getActiveSpan();
  if (!span) return;
  span.setStatus({
    code:
      code === 'ok'
        ? cached.SpanStatusCode.OK
        : cached.SpanStatusCode.ERROR,
    message,
  });
}

/**
 * Unified error taxonomy — the v0.6.0 release theme.
 *
 * Every throw across `@ahtmljs/*` routes through this `AHTMLError` class.
 * The `code` is a stable discriminator that `catch` blocks can switch on;
 * the `hint` field carries the most likely fix in plain prose, so caught
 * errors are self-documenting in `console.error`.
 *
 * Why this exists: the v0.5 and earlier surface mixed three error shapes
 * (flat `AHTMLError(status, message)` in the agent, `InvalidDiffError(op,
 * reasons)` in schema, `validate()` returning `string[]`). Adopters had no
 * way to write a `catch` block that meant anything. v0.6 collapses all of
 * those into one class.
 */

/**
 * Stable, machine-readable discriminator for `AHTMLError`. Adopters should
 * `switch` on this in `catch` blocks — it never changes shape across
 * minor releases.
 */
export type AHTMLErrorCode =
  /** A snapshot failed structural validation. `path` points at the first offending field. */
  | 'SCHEMA_INVALID'
  /** `applyDiff()` received a structurally-invalid change. `cause` carries the underlying validation errors. */
  | 'DIFF_INVALID'
  /** `fromCompact()` failed to parse its input. */
  | 'COMPACT_PARSE'
  /** `fromJson()` failed to parse its input. */
  | 'JSON_PARSE'
  /** A diff was requested against a base etag the server no longer recognizes. */
  | 'ETAG_MISMATCH'
  /** Underlying `fetch()` rejected (DNS, connection reset, TLS, etc.). `cause` carries the original error. */
  | 'NETWORK'
  /** Server returned a non-2xx, non-304 status that doesn't map to a more specific code. */
  | 'HTTP_STATUS'
  /** Server replied 401 and the client has no credentials configured. */
  | 'AUTH_REQUIRED'
  /** Server replied 403 (policy enforcement). */
  | 'POLICY_DENIED'
  /** Server replied 429. `retryAfterMs` carries the parsed Retry-After hint. */
  | 'RATE_LIMITED'
  /** Client-side timeout fired before the server responded. */
  | 'TIMEOUT'
  /** Server returned a snapshot that failed `validate()`. The cache was NOT updated. */
  | 'CACHE_POISONED'
  /** Cryptographic signature verification failed. v0.8.0 territory; reserved for now. */
  | 'SIGNATURE_INVALID';

export interface AHTMLErrorInit {
  message: string;
  /** Stable taxonomy discriminator — switch on this in `catch`. */
  code: AHTMLErrorCode;
  /** HTTP status if the error originated from a wire response. */
  status?: number;
  /** Whether a transparent retry could succeed. */
  retryable?: boolean;
  /** Plain-English next step — the error message is the documentation. */
  hint?: string;
  /** Dotted path / JSON pointer into the snapshot for schema errors. */
  path?: string;
  /** Underlying error or value for `ES2022` cause chaining. */
  cause?: unknown;
  /** When `code === 'RATE_LIMITED'`, the parsed Retry-After hint in milliseconds. */
  retryAfterMs?: number;
  /** Best-effort identifier for the request that failed (URL, op, etc.). */
  context?: string;
}

/**
 * The one error type across `@ahtmljs/schema`, `@ahtmljs/agent`,
 * `@ahtmljs/next`, `@ahtmljs/vite`, `@ahtmljs/langchain`. Re-exported by
 * each so adopters never need to import from multiple packages to write
 * a `catch` block.
 */
export class AHTMLError extends Error {
  readonly code: AHTMLErrorCode;
  readonly status?: number;
  readonly retryable: boolean;
  readonly hint?: string;
  readonly path?: string;
  readonly retryAfterMs?: number;
  readonly context?: string;
  // Override the type of `cause` to `unknown` so adopters can narrow it.
  readonly cause?: unknown;

  constructor(init: AHTMLErrorInit) {
    super(init.message);
    this.name = 'AHTMLError';
    this.code = init.code;
    if (init.status !== undefined) this.status = init.status;
    this.retryable = init.retryable ?? defaultRetryable(init.code);
    if (init.hint !== undefined) this.hint = init.hint;
    if (init.path !== undefined) this.path = init.path;
    if (init.retryAfterMs !== undefined) this.retryAfterMs = init.retryAfterMs;
    if (init.context !== undefined) this.context = init.context;
    if (init.cause !== undefined) this.cause = init.cause;
  }

  /**
   * Structured form suitable for `pino` / `bunyan` / OTel attributes. The
   * `cause` is summarized to its message + name to keep logs bounded.
   */
  toJSON(): Record<string, unknown> {
    const cause = this.cause;
    const summarized =
      cause instanceof Error
        ? { name: cause.name, message: cause.message }
        : cause === undefined
          ? undefined
          : cause;
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      ...(this.status !== undefined && { status: this.status }),
      retryable: this.retryable,
      ...(this.hint !== undefined && { hint: this.hint }),
      ...(this.path !== undefined && { path: this.path }),
      ...(this.retryAfterMs !== undefined && { retryAfterMs: this.retryAfterMs }),
      ...(this.context !== undefined && { context: this.context }),
      ...(summarized !== undefined && { cause: summarized }),
    };
  }

  /**
   * Type guard. `AHTMLError.is(e, 'RATE_LIMITED')` is shorter than
   * `e instanceof AHTMLError && e.code === 'RATE_LIMITED'`.
   */
  static is(e: unknown, code?: AHTMLErrorCode): e is AHTMLError {
    if (!(e instanceof AHTMLError)) return false;
    return code === undefined || e.code === code;
  }
}

function defaultRetryable(code: AHTMLErrorCode): boolean {
  switch (code) {
    case 'NETWORK':
    case 'TIMEOUT':
    case 'RATE_LIMITED':
      return true;
    case 'HTTP_STATUS':
      // 5xx is retryable, but we don't know the status here — leave decision
      // to the caller via the `retryable` init override.
      return false;
    default:
      return false;
  }
}

/**
 * Hint registry. Centralized so we can promise "every code has a hint"
 * without scattering string literals across the codebase. Callers can
 * override with a more contextual hint at construction time.
 */
export const DEFAULT_HINTS: Record<AHTMLErrorCode, string> = {
  SCHEMA_INVALID:
    'Run `validate(snapshot)` locally to surface every issue; fix the field at `path` and retry.',
  DIFF_INVALID:
    'The server diff was structurally invalid. Pass `noCache: true` to drop the cache and refetch the full snapshot.',
  COMPACT_PARSE:
    'The compact-format text was not parseable. If the server is on AHTML < 0.5 it may be emitting legacy syntax; pass `format: "json"` to fall back.',
  JSON_PARSE:
    'The response body was not valid JSON. The server may have returned an HTML error page; inspect `cause` for the raw bytes.',
  ETAG_MISMATCH:
    'The server no longer recognizes the cached etag. Pass `noCache: true` to fetch a fresh full snapshot.',
  NETWORK:
    'The underlying fetch failed (DNS, TLS, or connection reset). Check connectivity; retries are safe.',
  HTTP_STATUS:
    'The server returned an unexpected HTTP status. Inspect `status` and the response body in `cause`.',
  AUTH_REQUIRED:
    'Pass `{ bearer: "..." }` to AHTMLClient, or set `policy.agents_welcome = true` on the server.',
  POLICY_DENIED:
    'The server policy refused this request. Check `policy.actions_require` in the site manifest.',
  RATE_LIMITED:
    'The server returned 429. Pass `retry: "auto"` to retry transparently, or wait for `retryAfterMs` before the next call.',
  TIMEOUT:
    'The request exceeded the configured timeout. Increase `timeout` on the AHTMLClient or check server latency.',
  CACHE_POISONED:
    'The server returned a snapshot that failed `validate()`. The cache was NOT updated; see `cause` for the schema error.',
  SIGNATURE_INVALID:
    'The detached signature did not verify against the trusted keys. Check `provenance.signed` and the key registry.',
};

/** Convenience: construct an AHTMLError with the default hint for its code. */
export function makeError(init: Omit<AHTMLErrorInit, 'hint'> & { hint?: string }): AHTMLError {
  return new AHTMLError({
    ...init,
    hint: init.hint ?? DEFAULT_HINTS[init.code],
  });
}

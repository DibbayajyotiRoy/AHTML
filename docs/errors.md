# AHTML errors

*Reference for the unified `AHTMLError` taxonomy introduced in v0.6.0.*

Every failure across `@ahtmljs/schema`, `@ahtmljs/agent`, `@ahtmljs/next`,
`@ahtmljs/vite`, and `@ahtmljs/langchain` is reported through a single
class, **`AHTMLError`**, with a stable **`code`** discriminator. Catch
blocks switch on `code` and stay stable across minor releases.

```ts
import { AHTMLClient, AHTMLError } from '@ahtmljs/agent';

const client = new AHTMLClient({ bearer: process.env.X_TOKEN });

try {
  const snap = await client.fetch('https://shop.com/p/mbp-14');
  // ...use snapshot
} catch (err) {
  if (AHTMLError.is(err)) {
    console.error({
      code: err.code,
      status: err.status,
      retryable: err.retryable,
      hint: err.hint,        // human-readable next step
      retryAfterMs: err.retryAfterMs,
    });
    switch (err.code) {
      case 'AUTH_REQUIRED':    return promptUserForLogin();
      case 'RATE_LIMITED':     return scheduleRetry(err.retryAfterMs ?? 60_000);
      case 'POLICY_DENIED':    return abort('site disallows agent access');
      case 'CACHE_POISONED':   return reportBugToSite(err.cause);
      default:                 throw err;
    }
  }
  throw err;
}
```

## The error class

```ts
class AHTMLError extends Error {
  readonly code: AHTMLErrorCode;       // stable discriminator
  readonly status?: number;            // HTTP status if from the wire
  readonly retryable: boolean;         // safe to retry transparently?
  readonly hint?: string;              // human-readable next step
  readonly path?: string;              // dotted path for SCHEMA_INVALID
  readonly retryAfterMs?: number;      // parsed Retry-After
  readonly context?: string;           // URL / op identifier
  readonly cause?: unknown;            // ES2022 cause chain

  toJSON(): Record<string, unknown>;   // for pino / bunyan / OTel attributes

  static is(e: unknown, code?: AHTMLErrorCode): e is AHTMLError;
}
```

`AHTMLError.is(e)` is shorter than `e instanceof AHTMLError`, and
`AHTMLError.is(e, 'RATE_LIMITED')` narrows in one step.

## Every code

Each row lists the code, what causes it, where it originates, and what
the caller can do about it. Every code has a default `hint` baked into
`DEFAULT_HINTS` so the error message itself is the documentation —
adopters can read `err.hint` instead of looking up this table.

| Code | Causes | Retryable | Catch action |
|---|---|---|---|
| `SCHEMA_INVALID` | `validateStrict()` failed; lint warnings carry this code too | no | Fix `path` in the snapshot you're building / receiving |
| `DIFF_INVALID` | `applyDiff()` got a structurally-invalid change from the server | no | `invalidate(url)` and refetch full snapshot |
| `COMPACT_PARSE` | `fromCompact()` could not parse its input | no | Inspect `cause`; if the server is on `< 0.5`, pass `format: "json"` |
| `JSON_PARSE` | `fromJson()` could not parse its input | no | The server may have returned an HTML error page; check `cause` for raw bytes |
| `ETAG_MISMATCH` | Diff requested against an etag the server no longer recognizes | no | Pass `noCache: true` to refetch the full snapshot |
| `NETWORK` | Underlying `fetch()` rejected (DNS, TLS, ECONNRESET) | **yes** | Default retry kicks in if enabled; otherwise back off and retry |
| `HTTP_STATUS` | Non-2xx, non-304 response that doesn't fit a more specific code | 5xx: **yes** | Inspect `status` + `cause` |
| `AUTH_REQUIRED` | Server replied 401 | no | Pass `{ bearer: "…" }` to the client |
| `POLICY_DENIED` | Server replied 403 (policy enforcement) | no | Check `policy.actions_require` in the site manifest |
| `RATE_LIMITED` | Server replied 429 | **yes** | Use `retryAfterMs` to schedule the next attempt |
| `TIMEOUT` | Client-side abort fired before the response | **yes** | Increase `timeout` on the client or check server latency |
| `CACHE_POISONED` | Server returned a snapshot that failed `validate()` | no | Report to the site; cache is **untouched** so subsequent calls are safe |
| `SIGNATURE_INVALID` | Detached signature did not verify (reserved for v0.8.0) | no | Check the trusted-keys registry |

## Choosing how to handle errors

### "I just want it to keep working"

Enable retries on the client. `NETWORK`, `TIMEOUT`, `RATE_LIMITED`, and
5xx `HTTP_STATUS` retry automatically with exponential backoff (capped
at 10s) plus jitter. `Retry-After` headers are honored verbatim.

```ts
const client = new AHTMLClient({
  retry: { attempts: 3 },
  timeout: 10_000,
});
```

### "I need to know why it failed"

Pass an `onEvent` hook. Every cache hit, miss, retry, and error fans out
through it. Wire it to `pino`, `bunyan`, or your OTel exporter:

```ts
const client = new AHTMLClient({
  onEvent: (e) => log.info(e),
});
```

Events:

- `request` — every outbound HTTP request with `ms` + `status`
- `cache_hit` / `cache_miss` — local cache decisions
- `diff_applied` — server returned a delta; `changes` is the patch size
- `coalesced` — a parallel call reused an in-flight promise
- `retry` — the client is about to retry; `attempt`, `delayMs`, `code`
- `error` — a fatal `AHTMLError` was emitted; `code` and `status`

A throwing `onEvent` never breaks a request; logger faults are swallowed.

### "I want to write my own retry loop"

Disable the built-in retry and inspect the error directly:

```ts
async function fetchWithCustomBackoff(url: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await client.fetch(url, { retry: false });
    } catch (err) {
      if (!AHTMLError.is(err) || !err.retryable) throw err;
      const wait = err.retryAfterMs ?? 1000 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw new Error('exhausted retries');
}
```

## Producing `AHTMLError` in your own code

If you're writing extractors or middleware that throw, route through
`makeError()` so callers see consistent hints:

```ts
import { makeError } from '@ahtmljs/schema';

throw makeError({
  code: 'SCHEMA_INVALID',
  message: 'product without price is meaningless on a product_detail page',
  path: 'entities[0].price',
  cause: extractionErrors,
});
```

`makeError()` stamps the default `hint` for the code; pass a custom
`hint` to override.

## Backward compatibility

The v0.5 surface still works:

- `applyDiff()` still throws `InvalidDiffError` — but `InvalidDiffError`
  is now a subclass of `AHTMLError` with `code: 'DIFF_INVALID'`. Both
  `instanceof InvalidDiffError` and `AHTMLError.is(e, 'DIFF_INVALID')`
  match the same throw.
- `validate()` still returns `Issue[]`. `validateStrict()` is the new
  throwing variant; choose one based on whether the error is recoverable
  in your code path.
- `lint()` still returns warnings with the `rule` field. v0.6 adds a
  `code: 'SCHEMA_INVALID'` so the same `catch`/log path that consumes
  `validate()` errors also consumes lint warnings without case-splitting.

No public surface was removed in v0.6. v0.5 callers compile against
v0.6 unchanged.

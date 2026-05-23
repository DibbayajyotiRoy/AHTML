# AHTML — Plan for the next 5 versions

*Drafted: 2026-05-24 · Revised after review · Author: Dibbayajyoti*
*Status: ready for tonight's cut*

This plan covers **v0.5.0 (shipping tonight)** and the **four versions after it**.
Revised against a sequencing critique: too much was packed into v0.8, signing
was deferred past framework expansion, performance was descriptive rather than
enforceable, and the typed-error work was treated as a feature rather than as
the project's identity.

This revision:

1. **Typed errors become the project identity in v0.6.** It is the single
   biggest DX differentiator we have. It gets a release of its own with
   request coalescing folded in (coalescing is a correctness fix, not a
   scalability one — it belongs next to retry/timeout).
2. **Signing ships before framework expansion.** Trust matters more for
   ecosystem adoption than Astro or SvelteKit adapters do. v0.8 is signing +
   emitter consolidation; framework expansion is deliberately *one* adapter
   (Hono) in v0.9 and no more before 1.0.
3. **v0.8 is cut in half.** Observability + multi-framework + signing in one
   release was three releases of work. Signing + consolidation in 0.8;
   observability + the single new adapter + doctor in 0.9.
4. **Performance budgets are enforceable.** Every release defines hard
   numeric limits that ship as failing CI tests. The benchmark stops being
   descriptive.

---

## v0.5.0 — Lossless round-trip *(tonight, 2026-05-24)*

**One-line:** every field `toCompact()` writes round-trips through
`fromCompact()`. The SPEC.md claim becomes true.

### Scope (locked in [`roundtrip.test.ts`](packages/schema/src/__tests__/roundtrip.test.ts))

Promote the 14 pinned `test.todo()` entries to passing tests:

- **Product** — `description`, `category`, `list_price`, `attributes`,
  `images`, `variants`
- **Document** — `author`, `summary`, `content`, `tags`, `chunks`,
  `language`, `word_count`
- **Task** — `priority`, `due_at`, `labels`, `description`
- **Profile** — `email`, `homepage`, `handle`, `bio`, `avatar`, `verified`,
  `attributes`
- **Dataset entities** — `parseEntity` currently returns `null`. Implement.
- **Conversation entities** — same.
- **Action** — `category`, `execute_url`, `preview_url`, `rate_limit`,
  `input`, `output`, object-form `auth: { scheme, scopes }`, array-form
  `target`
- **Top-level** — `links`, `schemas`, `meta` (non-numeric values),
  full `policy` (`caching`, `actions_require`, `terms_url`,
  `attribution_required`, `republish`)

### Performance budget (new, enforced in CI)

| Metric | Limit |
|---|---|
| `fromCompact()` on a 100-entity snapshot | < 3 ms median, < 8 ms p99 |
| `toCompact()` on the same | < 2 ms median, < 5 ms p99 |
| `applyDiff()` (100 changes) | < 2 ms median |
| Memory growth in 1,000-iteration round-trip | < 1 MB retained |

Failing test if any budget regresses by > 15% versus the previous release.

### Acceptance

- All 14 `test.todo()` → passing
- Property test: 1,000 random snapshots survive `fromCompact(toCompact(s))`
  bit-for-bit on canonical JSON
- All budget tests green
- `CHANGELOG.md` updated, `POST-BRIEF.md` v0.5.0 section added
- **No breaking API changes.** Additive only — older snapshots still parse.

---

## v0.6.0 — The error story *(target: 2026-06-07, two weeks)*

**One-line:** every throw across every package becomes a discriminated union
with a stable `code`, an actionable `hint`, and `cause` chaining. This is the
release we lead the README with.

### Why this is the project identity, not just a feature

Every adopter writes `try { fetchSnapshot() } catch (e) { ??? }`. Today there
is nothing to put in the `catch` block — `e` is either a flat `AHTMLError`
with a number, a `string[]` from `validate()`, or something else. Make that
block easy to write and you've removed the largest reason teams shelve
agent-web work after the first 500. **No other adjacent standard
(`llms.txt`, JSON-LD, MCP, OpenAPI) ships typed errors with hints.** This is
the wedge.

### Scope

#### 1. Unified error taxonomy in `@ahtmljs/schema`

```ts
// new: packages/schema/src/errors.ts
export type AHTMLErrorCode =
  | 'SCHEMA_INVALID'           // validate() failure
  | 'DIFF_INVALID'             // applyDiff() patch malformed
  | 'COMPACT_PARSE'            // fromCompact() failure
  | 'JSON_PARSE'               // fromJson() failure
  | 'ETAG_MISMATCH'            // diff base etag does not match cached
  | 'NETWORK'                  // fetch-layer failure
  | 'HTTP_STATUS'              // non-2xx, non-304 response
  | 'AUTH_REQUIRED'            // 401 with no credentials configured
  | 'POLICY_DENIED'            // 403 from policy enforcement
  | 'RATE_LIMITED'             // 429 with Retry-After
  | 'TIMEOUT'                  // client-side abort
  | 'CACHE_POISONED';          // server returned snapshot that fails validate()

export class AHTMLError extends Error {
  readonly code: AHTMLErrorCode;
  readonly status?: number;
  readonly retryable: boolean;
  readonly hint?: string;       // human-readable next-step
  readonly path?: string;       // JSON pointer for schema errors
  readonly cause?: unknown;     // ES2022 error chaining
  toJSON(): object;             // structured for logs
}
```

- All packages re-export `AHTMLError` from `@ahtmljs/schema` — one error
  type across the stack.
- `validate()` keeps its `string[]` return for back-compat, **adds**
  `validateStrict()` that throws `AHTMLError('SCHEMA_INVALID', { path, hint })`.
- `lint()` warnings get the same shape — `code`, `path`, `hint`, plus
  the existing `rule` id.

#### 2. Hints, not log lines

Every error gets a `hint` field with the most likely fix:

| Code | Example `hint` |
|---|---|
| `AUTH_REQUIRED` | `Pass { bearer: "..." } to AHTMLClient, or set ahtml.policy.public = true on the server.` |
| `RATE_LIMITED` | `Server returned Retry-After: 12s. Pass { retry: 'auto' } to retry transparently.` |
| `CACHE_POISONED` | `Server returned a snapshot that failed validate(). The cache was not updated. See cause for the schema error.` |
| `ETAG_MISMATCH` | `Pass full=true to fetch a fresh snapshot, or clear the cache for this URL.` |

The hint is *in the error itself*, not just the docs. Caught errors are
self-documenting in `console.error`.

#### 3. Client-side retry + timeout

```ts
new AHTMLClient({
  base: '...',
  timeout: 10_000,        // default 30s, abort via AbortController
  retry: {
    attempts: 3,
    on: ['NETWORK', 'TIMEOUT', 'RATE_LIMITED', 'HTTP_STATUS'],
    backoff: 'exponential', // 250ms, 500ms, 1000ms
    respectRetryAfter: true,
  },
});
```

Default off, opt-in.

#### 4. Request coalescing (moved here from v0.7)

Two parallel `fetchSnapshot(url)` calls today fire two HTTP requests.
Add an in-flight `Map<url, Promise>` so the second call piggybacks on the
first. **This is a correctness fix, not a perf fix** — it lives with retry
and timeout. On by default; disable per-call with `{ coalesce: false }`.

#### 5. Logging hook

```ts
new AHTMLClient({
  onEvent: (e) =>
    pino.info({ type: e.type, url: e.url, ms: e.ms, code: e.code }),
});
```

Events: `request`, `cache_hit`, `cache_miss`, `diff_applied`, `error`,
`retry`, `coalesced`. No `console.log` inside the library.

### Performance budget

| Metric | Limit |
|---|---|
| Error construction overhead | < 50 µs (hint + cause chain must not be expensive) |
| Coalesced concurrent fetches (100 parallel for same URL) | Exactly **1** network call |
| Retry backoff jitter | ±25% of nominal delay |

### Acceptance

- 100% of throws across all four packages route through `AHTMLError`
- Every error code has a unit test asserting the hint text
- `docs/errors.md` enumerates every code with an example `catch` block
- Coalescing test: 100 parallel `fetchSnapshot()` → 1 fetch, all 100
  resolve with the same instance reference
- Zero breaking changes for callers who don't `instanceof AHTMLError`
- **README hero gets rewritten around this release**

---

## v0.7.0 — Scalability *(target: 2026-06-28)*

**One-line:** snapshots stop being one big buffer. Move bytes on the wire,
survive Vercel Edge and Cloudflare Workers, and stop letting two replicas
double the rate budget.

### Scope (deliberately narrowed — pure scalability, nothing DX)

#### 1. NDJSON streaming snapshots

- `createAHTMLRoute({ stream: true })` → `transfer-encoding: chunked`,
  content-type `application/ahtml+json-seq` (RFC 7464).
- Server emits header → entities → actions → footer as separate records.
- `AHTMLClient.streamSnapshot(url)` returns `AsyncIterable<Entity>`.
- Compact format gets a streaming variant via NDJSON-of-lines.

#### 2. `gzip` + `br` content-encoding

- Handler reads `Accept-Encoding`, picks `br` > `gzip` > identity.
- `zlib.createBrotliCompress` on Node, `CompressionStream` on Edge — same
  code path.
- Client decompresses automatically with explicit guards on the streaming
  path.

#### 3. Edge-runtime story

- Add `export const runtime = 'edge'` to the demo `/ahtml/[...path]` route
  and prove it works.
- Remove every `node:` import from the hot path. `computeEtag` uses
  `globalThis.crypto.subtle` with a Node fallback.
- Document the constraint surface in `docs/edge.md`.

#### 4. Pluggable cache + rate-limit backends

```ts
interface KvStore {
  get(k: string): Promise<string | null>;
  set(k: string, v: string, ttlMs?: number): Promise<void>;
  incr(k: string, ttlMs?: number): Promise<number>;
}

enforcePolicy({ store: redisStore, /* … */ });
```

Default still in-memory. **One** new package — `@ahtmljs/kv` — with
sub-exports `@ahtmljs/kv/upstash`, `@ahtmljs/kv/cloudflare`,
`@ahtmljs/kv/memory`. (Original plan had two separate packages; reviewer
correctly flagged adapter proliferation.)

### Performance budget

| Metric | Limit |
|---|---|
| Peak server memory, 10,000-entity dataset, streaming on | < 50 MB (today: unbounded) |
| Wire size, benchmark corpus, `br` enabled | ≥ 60% reduction vs identity |
| Edge cold-start to first byte (Cloudflare Worker) | < 50 ms p50 |
| Rate-limit accuracy across 2 replicas (Redis backend) | ±5% of single-replica baseline |

### Acceptance

- 10,000-entity benchmark holds the 50 MB ceiling
- Cloudflare Worker example deploys and serves snapshots
- `Accept-Encoding: br` hits the 60% bar on `examples/benchmark`
- Redis adapter passes the same rate-limit suite as in-memory

---

## v0.8.0 — Signing + emitter consolidation *(target: 2026-07-19)*

**One-line:** trust ships before framework expansion. The v0.2 signing
promise lands. Emitters consolidate into one canonical implementation.

### Why signing before framework expansion (reviewer's call, correct)

A signed snapshot is a verifiable, replayable proof of what a site told an
agent. That is the foundation of ecosystem trust — without it, "AHTML
adopters" is just a list of URLs that could change between fetches. New
framework adapters expand the supported surface; signing decides whether
the supported surface is worth adopting in the first place. Order matters.

### Scope

#### 1. Detached JWS over canonical JSON

- `@ahtmljs/schema/sign` — sign with `did:web` or raw `ES256` / `EdDSA`.
  Detached signature so snapshot bytes don't change.
- `@ahtmljs/agent/sign` — `verifySnapshot(snap, sig, { trustedKeys })`.
  Returns `{ ok: true, signer }` or throws `AHTMLError('SIGNATURE_INVALID')`.
- Wire format: `X-AHTML-Signature` header (binary) and
  `provenance.signature` (JSON).
- Canonical JSON rules pinned as **normative** in SPEC.md.

#### 2. Emitter consolidation

`@ahtmljs/next` and `@ahtmljs/vite` each carry copies of the same
well-known / MCP / OpenAPI / Accept / policy code. The v0.4 audit caught
one drift bug (vite's missing `openapi.json`) — the next one is just a
matter of when. Extract before any new adapter lands.

New subpaths in `@ahtmljs/schema`, all tree-shakable:

```
@ahtmljs/schema/emit/well-known
@ahtmljs/schema/emit/mcp
@ahtmljs/schema/emit/openapi
@ahtmljs/schema/emit/llms-txt
@ahtmljs/schema/http/accept
@ahtmljs/schema/http/conditional
@ahtmljs/schema/policy
```

Next and Vite become thin request/response adapters re-exporting the
same logic. One snapshot-test suite is the source of truth.

### Performance budget

| Metric | Limit |
|---|---|
| Sign a 100-entity snapshot (ES256) | < 5 ms median |
| Verify a 100-entity snapshot | < 3 ms median |
| `@ahtmljs/next` LOC reduction | ≥ 40% versus v0.7 |
| `@ahtmljs/vite` LOC reduction | ≥ 40% versus v0.7 |
| Emitter output byte-equality across Next / Vite | 100% (one snapshot test) |

### Acceptance

- Sign + verify round-trip green for ES256, EdDSA, `did:web`
- Tampered snapshot fails verification with `SIGNATURE_INVALID`
- LOC budgets met for Next and Vite
- All emitter tests live in `@ahtmljs/schema`; framework packages
  re-import them as smoke tests

### Out of scope (deliberately deferred to v0.9)

- CJS dual publish, Node 18 support, new framework adapters,
  observability, doctor CLI. Each is a real piece of work and belongs in
  its own release.

---

## v0.9.0 — Observability + Hono + doctor → 1.0.0-rc *(target: 2026-08-09)*

**One-line:** the last release before 1.0. Adds production observability,
a single new adapter (Hono), and the `doctor` CLI. Tags `1.0.0-rc.1`.

### Scope (deliberately narrowed)

#### 1. OpenTelemetry hooks

- Library emits trace spans for `serve_snapshot`, `serve_diff`,
  `enforce_policy`, `validate`, `lint`, `verify_signature`.
- Auto-instrumentation when `@opentelemetry/api` is present; no-op
  otherwise. Zero dependency added.
- v0.6's `AHTMLClient.onEvent` is upgraded to forward to the global tracer
  when configured.

#### 2. One new adapter — Hono only

- `@ahtmljs/hono` — generic adapter for Hono / Bun / Deno.
- **Astro, SvelteKit, Nuxt, Remix are explicitly deferred to post-1.0.**
  Each is a real maintenance burden and none have proven demand yet.
  Hono alone gives us Bun, Deno, and Cloudflare Workers — three new
  runtimes for one adapter's worth of work.

#### 3. `npx @ahtmljs/cli doctor`

```
npx @ahtmljs/cli doctor https://example.com
```

Walks the discovery chain (`/.well-known/ahtml.json` → `/ahtml/manifest`
→ snapshots → MCP / OpenAPI / llms.txt), runs `validate()` + `lint()`,
verifies any signatures it finds, and prints a green/red report.

#### 4. CJS dual publish + Node 18

- `tsup` (or `unbuild`) replaces ESM-only build.
- `exports` map: `import`, `require`, `types` per subpath.
- Drop `crypto.randomUUID()` dependency; polyfill via `@noble/hashes`.
- CI matrix expands to 18 / 20 / 22.

### Performance budget

| Metric | Limit |
|---|---|
| OTel overhead with tracer attached | < 5% of v0.8 baseline (each handler) |
| OTel overhead with no tracer (no-op) | < 0.5% of v0.8 baseline |
| `doctor` runtime against the demo landing site | < 5 s end-to-end |
| `@ahtmljs/hono` LOC | < 200 (proves the consolidation worked) |

### Acceptance

- OTel spans visible in a Jaeger demo
- `require('@ahtmljs/schema')` works in CJS
- Node 18 CI green
- `doctor` runs cleanly against the demo, surfaces both `validate` errors
  and `lint` warnings, verifies signatures end-to-end
- Hono adapter passes the same conformance suite as Next and Vite
- `1.0.0-rc.1` tagged

### Stability commitment at 1.0.0

After 0.9 bakes for two weeks with zero P0 issues, tag `1.0.0`. The 1.0
commitment is **API stability**: anything shipped through 0.9 stays stable
for the 1.x line. Breaking changes after 1.0 go through one full
deprecation cycle.

---

## Cross-cutting principles

These apply to every release above; calling them out so reviewers can hold
the work to them:

1. **The typed error system is the identity.** README, hero, comparison
   docs all lead with it from v0.6 onward.
2. **No silent failures.** Every recoverable error has a typed code. Every
   unrecoverable error throws `AHTMLError`. `console.warn` is banned in
   library code — surface it through `onEvent` or the error itself.
3. **Performance budgets are enforced in CI.** A failing budget test is a
   release blocker. Budgets ratchet — a budget that holds for two
   releases tightens by 10% in the third.
4. **Additive by default.** Until 1.0, breaking changes require a written
   justification in `CHANGELOG.md` and a one-version deprecation window
   where the old API still works behind a warning surfaced through the
   host's logger (not ours).
5. **Edge-runtime first.** Anything new that imports from `node:*` must
   ship with a Web-Standards equivalent.
6. **One adapter per release after consolidation.** Hono in 0.9; nothing
   else before 1.0. Adapter proliferation is the failure mode the
   reviewer correctly flagged.
7. **The error message is the doc.** If a `hint` field can't tell the
   user what to do, the error doesn't ship.

---

## Version-at-a-glance

| Version | Date | Theme | Headline |
|---|---|---|---|
| **v0.5.0** | 2026-05-24 (tonight) | Correctness | Lossless compact round-trip |
| v0.6.0 | ~2026-06-07 | **Identity** | Typed errors + hints + retry + coalescing |
| v0.7.0 | ~2026-06-28 | Scalability | Streaming, `br`, edge runtime, pluggable KV |
| v0.8.0 | ~2026-07-19 | Trust | Signed snapshots + emitter consolidation |
| v0.9.0 → 1.0.0-rc | ~2026-08-09 | Production | OTel, Hono adapter, doctor CLI, CJS |

Five releases, eleven weeks, one coherent story: *AHTML earns the wedge
(typed errors, v0.6), scales (v0.7), earns trust (signing, v0.8), and
arrives at production-ready (v0.9 → 1.0).* Each release is independently
useful — none depend on the next to be coherent. Each ships with
enforceable performance budgets so the benchmarks stop being marketing
and start being a contract.

# Changelog

All notable changes to AHTML are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning
follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

Planned for v0.9 → 1.0.0-rc (the *production-ready* release):
- OpenTelemetry tracing spans across handlers and the client
- `@ahtmljs/hono` adapter (covers Bun, Deno, Cloudflare Workers)
- `npx @ahtmljs/cli doctor` external auditor walking the discovery chain
- CJS dual-publish + Node 18 support
- did:web resolution for signed snapshots

## [0.8.0] — 2026-05-27

**The trust release.** Signed snapshots land. The duplicated framework
emitters consolidate into one canonical implementation. Plus a sweeping
README + npm SEO pass across all five packages for AI-agent discovery.

### Added
- **`@ahtmljs/schema`** — `signSnapshot(snap, key, opts?)` produces a
  detached JWS over `toJson(snap)` using Web Crypto (`globalThis.crypto.subtle`).
  Supports `ES256`, `EdDSA`, `RS256`. No `node:crypto` import — runs on
  Cloudflare Workers, Vercel Edge, Bun, Deno.
- **`@ahtmljs/schema`** — `verifySnapshot(snap, jws, { trustedKeys })`
  returns `{ ok: true, signer: { kid, alg } } | { ok: false, reason }`.
  Tries each trusted key in order. **Never throws on mismatch** — only on
  programmer errors (malformed JWS, missing fields).
- **`@ahtmljs/schema`** — `verifySnapshotStrict(snap, jws, opts)`
  throws `AHTMLError('SIGNATURE_INVALID')` on verification failure.
- **`@ahtmljs/agent/sign`** — re-exports the verifier so adopters write
  `import { verifySnapshot } from '@ahtmljs/agent/sign'` without
  reaching into the schema package.
- **`@ahtmljs/schema/emit/*`** — framework-neutral emitter modules.
  `buildWellKnown(config)`, `snapshotsToMcp(server, snaps)`,
  `snapshotsToOpenApi(opts, snaps)`, `buildLlmsTxt(config, snaps?)`.
  These are the canonical implementations used by every framework
  adapter from v0.8.0 on.
- **`@ahtmljs/schema/http/*`** — pure HTTP helpers. `chooseFormat()` and
  `parseAcceptEntries()` (q-value-aware Accept parsing); `isNotModified()`,
  `notModifiedResponse()`, `weakEtagOf()` for ETag-based conditional GET
  on arbitrary bodies.
- **`docs/signing.md`** — JWS signing guide. Producer + verifier code,
  key distribution options (`did:web`, `.well-known/ahtml-keys.json`,
  out-of-band), threat model, error handling, performance budget.

### Changed
- **`@ahtmljs/next`** — `well-known.ts`, `mcp.ts`, `openapi.ts`,
  `llms-txt.ts` are now thin adapters (~30-40 LOC each) delegating to
  `@ahtmljs/schema/emit/*`. Public exports (`buildManifest`,
  `snapshotsToMcp`, `snapshotsToOpenApi`, `buildLlmsTxt`,
  `createXxxRoute`) are preserved.
- **`buildLlmsTxt` signature update** — moved from the `@ahtmljs/next`
  internal `{title, description, sections, ahtml_manifest_url}` shape
  to the canonical `@ahtmljs/schema` shape `{site, title?, description?, routes?}`.
  Callers using `createLlmsTxtRoute()` are unaffected (it translates
  from `AHTMLConfig`). Direct callers of `buildLlmsTxt()` must update
  their call site — see `docs/signing.md` and the schema/emit/llms-txt
  source for the new shape.

### Documentation
- **All six READMEs rewritten** for npm + GitHub discoverability:
  root, `@ahtmljs/schema`, `@ahtmljs/agent`, `@ahtmljs/next`,
  `@ahtmljs/vite`, `@ahtmljs/langchain`. Each now leads with the
  one-line value prop, ships copy-pasteable code in the first 20 lines,
  carries badges (npm version, MIT, MCP-compatible, OpenAPI 3.1, npm
  provenance), and ends with a Search-keywords section + a suggested
  `npm keywords` block calibrated to what AI engineers, RAG operators,
  Cursor/Continue users, and MCP server builders actually search for.
  Targets competitor positioning vs Firecrawl, Jina Reader,
  ScrapingBee, Crawlee, the various MCP SDKs, Schema.org, and
  hand-rolled llms.txt.

### Compatibility
- **Fully additive at the package root.** Five packages bumped 0.7.0 →
  0.8.0 with peer-deps aligned. v0.7 callers compile unchanged for
  every public API surface other than `buildLlmsTxt` (see above).
- **Wire-compatible.** Compact text, canonical JSON, NDJSON stream,
  diff endpoint — all unchanged from v0.7.
- **Edge runtime preserved.** Every new module (sign, emit/*, http/*)
  uses Web Standards only; no `node:*` imports. Verified on the schema
  test suite which runs identically in Node 22.

### Test totals
- Schema: **149 passing** (was 137), 0 todo — adds 12 tests for JWS
  round-trip across ES256/EdDSA/RS256, tamper detection, multi-key
  trusted set, `kid` round-trip, `SIGNATURE_INVALID` strict path.
- Agent: 57 passing (same)
- Next: 51 passing (same — emitter tests now exercise the new shape via
  the rewired adapters)
- Vite: 11 passing
- LangChain: 5 passing
- UX integration: 30 passing
- **Total: 303 passing, 0 todo, 0 failing** (was 291 at v0.7.0)

## [0.7.0] — 2026-05-26

**The scalability release.** Snapshots stop being one big buffer.

### Added
- **`@ahtmljs/schema/stream`** — new module. `toStream(snap)` is an
  `AsyncIterable<string>` (one NDJSON line per record). `toStreamResponse(snap)`
  returns a `ReadableStream<Uint8Array>` suitable as a `Response` body in
  any Web-Standards runtime. `parseStream(source)` is the inverse, yielding
  `StreamRecord`s as they arrive. `fromStream(source)` materializes back to
  a `Snapshot` when buffering is acceptable. Content-Type:
  `application/ahtml+json-seq` (length-delimited NDJSON).
- **`@ahtmljs/schema/compress`** — new module. `chooseEncoding(header)`
  parses `Accept-Encoding` with q-values, prefers `br > gzip > identity`,
  honors `q=0` refusals, respects `*` wildcards.
  `compressBuffer(body, enc)` and `compressStream(body, enc)` use
  `CompressionStream` (Web Standard) — no `node:zlib` import.
- **`@ahtmljs/schema/kv`** — new module. `KvStore` interface
  (`get / set / delete / incr` with optional `ttlMs`) for cross-process
  rate-limit / idempotency / cache backends. `CacheStore<T>` interface for
  object-valued caches (sync or async). `InMemoryKvStore` and
  `InMemoryCacheStore` ship as the default adapters. `InMemoryCacheStore`
  is a bounded LRU (default 1,000 entries) with lazy TTL expiration.
- **`@ahtmljs/next/handler`** — `createAHTMLRoute(builder, config, opts)`
  gains an `opts.stream` parameter (`true` / threshold number / default
  `false`). When triggered, the handler emits NDJSON via a
  `ReadableStream`. A client can also force streaming by sending
  `Accept: application/ahtml+json-seq`.
- **`@ahtmljs/next/handler`** — every response path now negotiates
  `Accept-Encoding` and wraps the body in `CompressionStream` for
  `br` / `gzip`. `Content-Encoding` + `Vary: Accept, Accept-Encoding`
  emitted accordingly.
- **`@ahtmljs/agent`** — `AHTMLClient.streamSnapshot(url)` returns an
  `AsyncIterable<StreamRecord>`. `streamEntities(url)` and
  `streamActions(url)` are convenience filters. Caller can `break` out of
  the iteration to short-circuit — the underlying `ReadableStream` is
  torn down cleanly.
- **`@ahtmljs/agent`** — `ClientOptions.cache` accepts any
  `CacheStore<CachedSnapshot>` (sync or async). The default is the
  `InMemoryCacheStore` from `@ahtmljs/schema`. Swap for Redis / Upstash /
  Cloudflare KV by implementing the four-method interface.
- **`docs/streaming.md`** — the streaming wire format, client patterns,
  short-circuit behaviour, and error taxonomy.
- **`docs/edge.md`** — the runtime constraint surface, Cloudflare Workers
  example, multi-replica cache wiring, cold-start budget.

### Fixed
- **`@ahtmljs/agent`** — the v0.6 snapshot cache was a private `Map`,
  hard-coded. Now defaults to `InMemoryCacheStore` but is fully swappable.
  Existing v0.6 callers (no `cache:` option) see identical behaviour and
  a bounded 1,000-entry LRU instead of the old unbounded `Map`.

### Changed
- **`@ahtmljs/agent`** — `AHTMLClient.invalidate()` now returns
  `Promise<void>` (it was `void`). Required to support async cache
  backends. Existing call sites work unchanged in async contexts; sync
  callers that ignored the return value are unaffected.
- **`@ahtmljs/next/handler`** — `Vary` header changes from `Accept` to
  `Accept, Accept-Encoding`. Caches that key on `Vary` will treat this
  as a cold cache the first time, then settle.

### Compatibility
- **Fully additive at the API level.** No public surface removed.
- **Wire-compatible**: legacy `application/ahtml+text` and
  `application/ahtml+json` paths are unchanged.
- All five `@ahtmljs/*` packages bumped 0.6.0 → 0.7.0 with peer-deps
  aligned.

### Edge runtime
- Every package in the hot path runs on Cloudflare Workers, Vercel Edge,
  Bun, and Deno with no runtime-conditional imports. `computeEtag` uses
  pure-JS `djb2`; compression uses `CompressionStream`. No `node:*`
  imports.

### Test totals
- Schema: **137 passing** (was 112), 0 todo — 25 new tests covering
  `toStream` / `fromStream` round-trip, `chooseEncoding` q-value parsing,
  `compressBuffer` round-trip via `DecompressionStream`,
  `InMemoryCacheStore` LRU + TTL, `InMemoryKvStore` async `incr`.
- Agent: **57 passing** (was 49), 0 todo — 8 new tests for `streamSnapshot`,
  `streamEntities`, pluggable `CacheStore` (sync + async), default behaviour.
- Next: **51 passing** (was 43), 0 todo — 8 new tests for
  `createAHTMLRoute` streaming + gzip negotiation, threshold triggering,
  `Accept` override, byte-size win.
- Vite: 11 passing
- LangChain: 5 passing
- UX integration: 30 passing
- **Total: 291 passing, 0 todo, 0 failing** (was 250 at v0.6.0)

## [0.6.0] — 2026-05-24

**The error story.** Every throw across `@ahtmljs/*` now routes through a
single `AHTMLError` class with a stable `code` discriminator, an
actionable `hint`, and ES2022 `cause` chaining. Adopters can finally
write a `catch` block that means something. This is the release we lead
the README with.

### Added
- **`@ahtmljs/schema`** — new `errors.ts` module exports `AHTMLError`,
  `AHTMLErrorCode`, `DEFAULT_HINTS`, `makeError()`. Re-exported from
  every package so adopters can write
  `import { AHTMLError } from '@ahtmljs/agent'`. There is exactly **one**
  error type across the stack.
- **`@ahtmljs/schema`** — 13 stable error codes:
  `SCHEMA_INVALID` / `DIFF_INVALID` / `COMPACT_PARSE` / `JSON_PARSE` /
  `ETAG_MISMATCH` / `NETWORK` / `HTTP_STATUS` / `AUTH_REQUIRED` /
  `POLICY_DENIED` / `RATE_LIMITED` / `TIMEOUT` / `CACHE_POISONED` /
  `SIGNATURE_INVALID`. Every code has a default `hint` in
  `DEFAULT_HINTS` — the error message itself is the documentation.
- **`@ahtmljs/schema`** — `AHTMLError.is(e, code?)` type guard.
  `AHTMLError.is(err, 'RATE_LIMITED')` narrows in one step.
- **`@ahtmljs/schema`** — `validateStrict(snap)` throwing variant. Keeps
  `validate()` returning `Issue[]` for back-compat; use whichever fits
  the call site.
- **`@ahtmljs/schema`** — `lint()` warnings now carry `code: 'SCHEMA_INVALID'`
  alongside the existing `rule` field, so the same `catch`/log path that
  consumes `validate()` errors also consumes lint warnings without
  case-splitting.
- **`@ahtmljs/schema`** — `fromCompact()` and `fromJson()` now throw
  typed `AHTMLError('COMPACT_PARSE' / 'JSON_PARSE')` with the original
  parse error in `cause`. Previously raw `SyntaxError` leaked through.
- **`@ahtmljs/agent`** — `AHTMLClient` gains opt-in **retry policy**:
  exponential backoff with optional ±25% jitter, `Retry-After` honoring
  (seconds form *and* HTTP-date), per-code retry filter. Default retry
  is OFF to preserve v0.5 behavior; pass `retry: { attempts: 3 }` to
  enable.
- **`@ahtmljs/agent`** — `AHTMLClient` gains per-request **timeout**
  (default 30s, abort via `AbortController`).
- **`@ahtmljs/agent`** — `AHTMLClient` gains **request coalescing**:
  100 parallel `fetch(url)` calls now produce **exactly 1** network
  request. Keyed by `format`/`bearer`/`url`. On by default; disable per
  call with `coalesce: false`.
- **`@ahtmljs/agent`** — `onEvent` hook on `ClientOptions` emits
  `request` / `cache_hit` / `cache_miss` / `diff_applied` / `coalesced`
  / `retry` / `error`. No `console.log` inside library code — adopters
  wire `pino`, `bunyan`, or OTel. A throwing `onEvent` never breaks a
  request (logger faults are swallowed).
- **`docs/errors.md`** — every code documented with an example `catch`
  block. The error message is the doc; this file is the index.

### Fixed
- **`@ahtmljs/schema`** — `InvalidDiffError` is now a subclass of
  `AHTMLError` with `code: 'DIFF_INVALID'`. Both
  `instanceof InvalidDiffError` and `AHTMLError.is(e, 'DIFF_INVALID')`
  match the same throw; back-compat preserved for v0.4 / v0.5 callers.
- **`@ahtmljs/agent`** — the old flat `AHTMLError(status, message)`
  surface is replaced by the unified class. The new class still has a
  `status` field, plus `code`, `hint`, `retryable`, `retryAfterMs`,
  `path`, `context`, and `cause` — so existing callers that only
  inspect `err.status` continue to work, and new callers gain the
  taxonomy.
- **`@ahtmljs/agent`** — the v0.4 `502` thrown for poisoned cache responses
  is now `AHTMLError('CACHE_POISONED', { status: 502, … })` with the
  validation errors in `cause`. Cache state is untouched — subsequent
  calls do NOT serve poisoned content; they re-fetch.

### Compatibility
- **Fully additive.** No public API removed or renamed. v0.5 callers
  compile against v0.6 unchanged.
- **Wire compatibility** — unchanged from v0.5; same compact and JSON
  formats.
- All five `@ahtmljs/*` packages bumped 0.5.0 → 0.6.0 with peer-deps
  aligned.

### Test totals
- Schema: **112 passing** (was 97), 0 todo — adds 15 tests for the new
  error taxonomy
- Agent: **49 passing** (was 30), 0 todo — adds 19 tests for retry,
  timeout, coalescing, onEvent, and typed errors
- Next: 43 passing
- Vite: 11 passing
- LangChain: 5 passing
- UX integration: 30 passing
- **Total: 250 passing, 0 todo, 0 failing** (was 216 at v0.5.0)

## [0.5.0] — 2026-05-24

**The lossless round-trip release.** Every field that `toCompact()` writes
now survives `fromCompact()`. The SPEC.md claim is finally true.

### Fixed
- **`@ahtmljs/schema`** — compact-format parser was silently dropping 14
  classes of fields documented as supported. The v0.4.0 audit pinned each
  one as `test.todo()` in `roundtrip.test.ts`; v0.5.0 turns every one of
  them into a passing assertion:
  - **Product** — `description`, `category`, `list_price`, `attributes`
    (with typed scalars), `images` (URL-only inline form *and* rich form
    preserving `alt` / `width` / `height`), `variants` with their full
    metadata
  - **Document** — `author` (single or array), `summary`, `content`
    (multi-line block scalar), `tags`, `chunks` (with byte ranges,
    anchors, headings, prev/next links, embed hints), `language`,
    `word_count`, `reading_time`
  - **Task** — `priority`, `due_at`, `labels`, `description`
  - **Profile** — `email`, `homepage`, `handle`, `bio`, `avatar` (URL-only
    *and* rich `Asset` form), `verified`, `attributes`
  - **Dataset entities** — previously `parseEntity` returned `null` and
    dataset snapshots were silently dropped. Now fully restored
    (`columns`, `rows`, `row_count_total`, `description`).
  - **Conversation entities** — same. `messages`, `participants`,
    `message_count_total`, `title` all round-trip.
  - **Action** — `category`, `execute_url`, `preview_url`, `rate_limit`,
    `input`, `output`, `auth` in object form (`{ scheme, scopes }`),
    `target` in array form (multi-target actions)
  - **Top-level blocks** — `@links` (self / canonical / parent / next /
    prev / related), `@schemas` (per-snapshot JSON Schema registry),
    `@meta` (now correctly coerces booleans, null, arrays, and objects in
    addition to numbers), `@policy` (`caching` with `allowed` + `ttl`,
    `actions_require`, `terms_url`, `attribution_required`, `republish`),
    `@provenance` with typed `signed` boolean
- **`@ahtmljs/schema`** — action `execute_url` previously emitted
  `execute: ${method ?? 'POST'} ${url}` which caused round-trip drift when
  the original had no method (a phantom `method: POST` field appeared).
  Now emits URL-only; legacy `execute: METHOD url` form still parses
  cleanly for backward compatibility with v0.4 wire output.
- **`@ahtmljs/schema`** — `@provenance` block previously round-tripped
  `signed: true` (boolean) as the string `"true"`; now correctly typed.

### Added
- **`@ahtmljs/schema`** — `Body` parser model in `format-compact.ts`
  separates scalar lines, nested lists (`key:` → `- item`), block scalars
  (`key: |` → multi-line text), and nested sub-bodies (attribute maps).
  Replaces the flat `Record<string, string>` that lost structure.
- **`@ahtmljs/schema`** — `coerceTypedScalar()` for `@meta` correctly
  recovers `null` / `true` / `false` / numbers / arrays / objects from
  their compact-form spellings; the v0.4 parser only handled numbers.
- **`@ahtmljs/schema`** — chunks, avatars, and images-with-metadata are
  now serialized in a parseable form (JSON-per-line for chunks /
  variants / dataset rows / messages; inline-or-rich for images and
  avatars depending on whether metadata is present).
- **Tests** — `roundtrip.test.ts` now contains a 1000-iteration property
  fuzz test (`buildRandom(seed)` → `toCompact` → `fromCompact` →
  structural equality) and a 200-iteration idempotent re-emit test
  (`toCompact(.) === toCompact(fromCompact(toCompact(.)))`). Both green.

### Compatibility
- **Wire compatibility** — v0.5 parser reads v0.4 output without
  modification (legacy `execute: METHOD url` form still parses).
- **API compatibility** — fully additive. No public API surface removed
  or renamed. v0.4 callers continue to work unchanged.
- **`@ahtmljs/next`**, **`@ahtmljs/agent`**, **`@ahtmljs/vite`**,
  **`@ahtmljs/langchain`** — bumped to 0.5.0 with peer dep on schema
  0.5.0. No behavior change beyond inheriting the fixes above.

### Test totals
- Schema: 97 passing, **0 todo** (was 78 passing, 14 todo)
- Agent: 30 passing
- Next: 43 passing
- Vite: 11 passing
- LangChain: 5 passing
- UX integration: 30 passing
- **Total: 216 passing, 0 todo, 0 failing**

## [0.1.0] — 2026-05-12

Initial public preview.

### Added
- `@ahtmljs/schema` v0.1.0:
  - TypeScript types for `Snapshot`, six entity primitives (`Product`, `Document`, `Task`, `Profile`, `Dataset`, `Conversation`), `Action`, `Policy`, `Provenance`, `Links`, `SnapshotDiff`
  - `snapshot()` builder DSL
  - Zero-dependency runtime validator
  - Canonical JSON serializer (`toJson` / `fromJson`)
  - Token-optimal compact text serializer (`toCompact` / `fromCompact`) — round-trips losslessly
  - Structural diff (`diff` / `applyDiff`)
  - Content-addressed `computeEtag`
  - JSON Schema 2020-12 spec at `src/schema.json`

- `@ahtmljs/next` v0.1.0:
  - `withAHTML` config wrapper
  - `createAHTMLRoute` route handler factory — content negotiation (compact / JSON), conditional GET (`If-None-Match`), diff endpoint (`?since=<etag>`), TTL-based cache headers, policy enforcement
  - `createWellKnownRoute` for `/.well-known/ahtml.json` site manifest
  - `createLlmsTxtRoute` for `/llms.txt` compatibility shim
  - Three extractors: `extractFromSchemaOrg`, `extractFromOpenGraph`, `extractFromDataAttrs`
  - `snapshotsToMcp` — MCP tools manifest emitter
  - `snapshotsToOpenApi` — OpenAPI 3.1 document emitter with `x-ahtml-*` extensions
  - `enforcePolicy` — token-bucket rate limiter at the route edge

- `@ahtmljs/agent` v0.1.0:
  - `AHTMLClient` fetcher with ETag caching, `If-None-Match`, diff replay, content negotiation, stale-while-error
  - `runAction` workflow executor with dry-run via `preview_url`
  - `countTokens` / `countTokensGpt` / `countTokensClaude` / `measure` — wrappers around `gpt-tokenizer` and `@anthropic-ai/tokenizer`

- Benchmark (`examples/benchmark`):
  - Programmatic corpus (product / article / dashboard) so HTML, llms.txt, AHTML compact, and AHTML JSON derive from the same source data
  - Real tokenizer measurements (`cl100k_base`, `o200k_base`, Claude)
  - Markdown report generator
  - Persisted `benchmark-results.md`

- Demo landing site (`examples/landing`):
  - Next.js 15 with App Router
  - Editorial cream + ink design with single rust accent
  - Hero, dogfood strip, agent-view, problem, fan-out, live benchmark, install, features, comparison, demo strip, roadmap, CTA, footer
  - Mini demo store at `/demo/products/[id]`
  - Live AHTML routes at `/ahtml/*`, `/.well-known/ahtml.json`, `/llms.txt`, `/ahtml/mcp.json`, `/ahtml/openapi.json`
  - `/api/waitlist` action endpoint

- Documentation:
  - `README.md` — agent-optimized pitch + install + comparison + FAQ + guidance for AI assistants
  - `SPEC.md` — formal v0.1 snapshot spec
  - `PLAN.md` — phased build plan, tech selections, risk register
  - `LANGUAGE.md` — Phase-2 `.ahtml` syntax preview
  - `docs/agents.md` — guide for AI code assistants
  - `docs/faq.md` — extended FAQ
  - `docs/compare.md` — exhaustive comparison vs every adjacent standard
  - `docs/recipes.md` — task-oriented cookbook
  - `llms.txt` — root-level Jeremy Howard convention shim
  - `llms-full.txt` — self-contained full-text LLM ingestion file
  - `SECURITY.md` — threat model + hardening checklists
  - `CONTRIBUTING.md` — schema change process
  - `LICENSE` — MIT

### Known limitations
- `.ahtml` source language is a Phase-2 deliverable (months 6–12). v0.1 uses the TypeScript `snapshot()` DSL.
- Signing (`provenance.signed: true`) is a v0.2 deliverable. The field is reserved in v0.1.
- Only Next.js 14+ App Router is shipping. Vite / SvelteKit / Astro / Nuxt / Remix are Phase 0 in-progress.
- The Rust core is a Phase-1 deliverable (months 4–9). v0.1 is TypeScript-only.

### Compatibility
- Node 20+
- Next.js 14+ (App Router)
- MCP spec version: 2025-11-25
- OpenAPI 3.1
- JSON Schema 2020-12

[Unreleased]: https://github.com/DibbayajyotiRoy/AHTML/compare/v0.8.0...HEAD
[0.8.0]: https://github.com/DibbayajyotiRoy/AHTML/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/DibbayajyotiRoy/AHTML/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/DibbayajyotiRoy/AHTML/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/DibbayajyotiRoy/AHTML/compare/v0.4.0...v0.5.0
[0.1.0]: https://github.com/DibbayajyotiRoy/AHTML/releases/tag/v0.1.0

# Changelog

All notable changes to AHTML are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning
follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

Planned post-1.0:
- OpenTelemetry metrics + logs (1.0 ships traces only)

## [1.1.0] — unreleased (series 1.1: reach the other half of the agent world)

### Added

- **`ahtml-py`** (`python/`) — Python consumer SDK mirroring `@ahtmljs/agent`:
  `from_json`/`from_compact` byte-identical to the TS reference, `AHTMLClient`
  with ETag/TTL caching, detached-JWS + `did:web` verification, `run_action`
  with the same `ActionRefused` gates, token counting, LangChain loader.
  46+ tests including cross-implementation byte-parity; PyPI trusted-publishing
  workflow ready (project registration pending).
- **`@ahtmljs/extract`** — the extractor pipeline behind every adapter, now a
  stable plugin API: `definePlugin({ match, extract, priority })` over a
  framework-neutral `PageModel`. Equal priorities and duplicate names are hard
  errors. `@ahtmljs/next` re-exports unchanged (freeze holds); the CLI consumes
  it; a <100-LOC third-party recipe plugin (`examples/recipe-plugin`) proves the
  contract, budget-enforced in CI.
- **`@ahtmljs/astro`** and **`@ahtmljs/sveltekit`** — full adapters
  (`.well-known`, snapshot routes with negotiation/304/diff, MCP/OpenAPI,
  llms.txt) with zero framework dependency, both passing the shared adapter
  matrix (extract → validate → sign → serve → agent-consume) identically to Next.

## [1.2.0] — unreleased (series 1.2: 10-minute, visibly-rewarded adoption)

### Added

- **`ahtml init`** — detects Next/Vite/Hono/Astro/SvelteKit, wires the adapter,
  generates a validateStrict-clean starter snapshot via the universal extractor.
  Idempotent; unsupported frameworks exit non-zero leaving the tree untouched.
- **`ahtml badge <url>`** + **`@ahtmljs/badge`** — hosted score badge service
  (Cloudflare-Worker-shaped) serving an SVG + linked report; score is the
  CLI's `computeScore` imported, byte-identical to local `ahtml score`;
  TTL-honoring cache + per-IP rate limit (deployment pending).
- **`@ahtmljs/insights`** — agent-traffic analytics: RFC 9421-verified agent
  classification (unverifiable ≠ verified, ever), KV-backed event recording
  with a tested zero-PII guarantee, ≤1 ms p95 middleware overhead
  (CI-budgeted), offline single-file HTML dashboard, OTel export.

## [1.3.0] — unreleased (series 1.3: protocol with a network effect)

### Added

- **`@ahtmljs/conformance`** — language-agnostic corpus (20 fixtures: canonical
  round-trips, ETag, diff, signature vectors incl. negatives, validateStrict
  negatives, dry-run gates) with CI-enforced RFC-2119 MUST traceability, a
  runner-manifest contract, signed result attestations, and
  `ahtml conformance <manifest>`. Both the TS reference and `ahtml-py` pass
  100% through the same runner — two independent implementations.
- **`@ahtmljs/index`** — the AHTML Index: opt-in submission (validate + score +
  signature check, rejects with the lint report), TTL/ETag-honoring re-crawl
  (unchanged sites cost one 304), RSL/policy opt-out delisting within one
  cycle, per-entry signature status that never upgrades unsigned content, MCP
  query surface (`search_sites`, `sites_with_action`) reusing `snapshotsToMcp`,
  and a dogfood snapshot that scores 100/100 (public deployment pending).
- **`ahtml submit <url>`** — CLI submission to the index.

## [1.4.0] — unreleased (series 1.4: safe to transact)

### Added

- **SPEC §4.7 dry-run addendum** (ADR-0003, additive — pinned 1.0.0 clients
  proven unaffected): actions may declare `dry_run.url`; simulated responses
  MUST carry `simulated: true`, MUST NOT mutate or charge, and sign like real
  ones.
- **`@ahtmljs/schema/simulate`** — `createSimulateHandler` (framework-neutral
  producer side) + `signBytes`/`verifyBytes`.
- **`@ahtmljs/agent`**: `POLICY_PRESETS` (`strict` requires a prior
  same-parameters dry-run within TTL before irreversible+priced actions),
  `DryRunLedger`, and anti-spoofing refusals in both directions — mirrored 1:1
  in `ahtml-py` (`RUN_POLICY_PRESETS`). 100×-dry-run e2e proves zero side
  effects and zero x402 charges; conformance corpus gained the dry-run gates in
  the same release.

## [1.0.0] — 2026-07-05

**Stability** — the API freeze. Everything shipped through 0.9.5 is stable for the
1.x line; breaking changes now require a full deprecation cycle. No new features.

### Changed

- **SPEC.md is stable.** The canonical-JSON serialization rules are now normative
  (§1.1: fixed top-level key order, no insignificant whitespace, UTF-8, signing
  input definition), and the detached-JWS signing profile (§6) is documented as
  the normative profile it became in v0.8.
- **`docs/compare.md` rewritten against the July 2026 field** — new sections for
  WebMCP, Cloudflare `Accept: text/markdown`, Firecrawl/Jina (the typed-output
  axis), and RSL 1.0 / Content Signals; MCP and llms.txt sections updated with
  current adoption data; decision tree covers non-adopter sites.
- **LLM benchmark now includes a `Markdown (auto)` column** — CDN-style lossy
  HTML→markdown auto-conversion — answering "why not just let the CDN convert?"
  in numbers. Report regenerated; reproduce with `bash scripts/run-llm-benchmark.sh`.

### Added

- **Doc-import test** (`npm run test:docs`): every `@ahtmljs/*` import specifier
  documented in README/SPEC/docs/package READMEs is resolved against the real
  `exports` maps (import + require conditions) in CI. Two broken documented
  imports found and fixed (`@ahtmljs/schema/emit`, `@ahtmljs/schema/canonical`).

### Stability commitment

The snapshot wire format (`ahtml: "0.1"`), the canonical-JSON form, the compact
text serialization, the discovery chain, and all documented package entry points
are frozen for 1.x. Additive changes only; removals require deprecation in a
minor release and removal no earlier than 2.0.

## [0.9.5] — 2026-06-24

**Verified agents, priced actions** — the trust + economics layer. Signed requests, per-agent
policy, x402 machine payments, RSL 1.0 licensing, and Content Signals. No breaking changes.

### Added — HTTP Message Signatures (RFC 9421) — agent request signing

- `signHttpRequest(request, key, agent, opts?)` in `@ahtmljs/schema` — signs any HTTP Request
  with `Signature` + `Signature-Input` + `X-AHTML-Agent` headers per RFC 9421 subset.
  Covers `@method`, `@authority`, `@target-uri`, `content-type`, `date`.
- `verifyHttpSignature(request, keys, opts?)` — verifies incoming agent signatures; returns
  `AgentVerifyResult` with parsed `AgentIdentity` (`id`, `did`, `version`).
- `signRequest` / `verifyAgentSignature` / `buildAgentHeader` re-exported from `@ahtmljs/agent`.
- Hono + Next.js adapters: new `verifyAgents` + `agentKeys` config options. When enabled,
  unverified agents hitting `policy.verified_agents_only: true` snapshots get a restricted
  snapshot (actions stripped). `X-AHTML-Agent-Verified` + `X-AHTML-Agent-Id` headers on
  all responses. Zero overhead when disabled.

### Added — x402 machine payments + policy presets

- `buildX402Response(action, opts?)` in `@ahtmljs/schema` — builds a standards-compliant
  `402 Payment Required` response with `x-payment-required` (base64url-encoded x402/0.2
  payload), `accept-payment-request: x402/0.2`, and optional `x-checkout-url`.
- `hasPaymentToken(req)` / `extractPaymentToken(req)` — helpers for verifying paid retries.
- `ActionCost.rails?: ('x402' | 'acp')[]` + `ActionCost.checkout_url?` — new fields in types.
- `Policy.verified_agents_only?` + `Policy.per_agent_policy?` + `Policy.content_signals?` — new
  policy fields for agent tiering and crawl signal declarations.
- **5 policy presets** in `@ahtmljs/schema`: `publicReadOnly`, `rateLimited`, `authRequired`,
  `paidAction`, `trainDeny` — and `POLICY_PRESETS` named map.
- `withPaymentGuard(actions, handler)` middleware for Next.js action route handlers — auto-returns
  402 when an action requires x402 payment and `X-Payment` is absent.

### Added — RSL 1.0 emitter + Content Signals

- `toRsl(snap, opts?)` / `policyToRsl(policy, siteUrl, opts?)` in `@ahtmljs/schema` — emits
  a standards-compliant RSL 1.0 file (`/rsl.txt`) from a snapshot's policy. Sections:
  `[RSL]` (version, license, republication, attribution) + `[content-signals]` (search,
  ai-input, ai-train). Defaults to conservative signals when `content_signals` is unset.
- `/.well-known/ahtml.json` manifest now includes `rsl_url` and `content_signals` when set.
- `buildLlmsTxt` emits YAML front-matter Content Signals at the top of `llms.txt` when
  `config.policy.content_signals` is set, per the contentsignals.org spec.
- After the series completes and bakes two weeks, tag `1.0.0` with the
  API-stability commitment

## [0.9.4] — 2026-06-18

**The browser** — AHTML meets the browser tab. Three new surfaces: `Accept: text/markdown`
negotiation for curl/LLM clients; `@ahtmljs/webmcp` registering AHTML actions as native
WebMCP tools in Chrome 149+; `@ahtmljs/kv` pluggable KV backends (memory, Upstash, Cloudflare).
No breaking changes.

### Added — `Accept: text/markdown` content negotiation

- All three adapters (Hono, Next.js, Vite) now serve `text/markdown` responses when
  `Accept: text/markdown` is the highest-weighted type in the request.
- `toMarkdown(snap: Snapshot): string` added to `@ahtmljs/schema` — hand-authored
  structured markdown preserving Products, Documents, Tasks, Profiles, Actions, and
  Policy in readable sections. Unlike auto-HTML→MD (lossy), this reflects the page's
  typed AHTML contract.
- `X-AHTML-Tokens: N` response header on all snapshot endpoints (JSON, compact,
  markdown). Approximate (`Math.ceil(body.length / 4)`) with no external dependency.
- `chooseFormat()` return type extended to `'json' | 'compact' | 'markdown'`; RFC 7231
  q-value precedence fully respected.

### Added — `@ahtmljs/webmcp` (new package)

- `registerAhtmlTools(snapshot, opts?)` — registers all page actions as WebMCP tools,
  populating `window.__AHTML_TOOLS__` as the stable fallback and trying both proposed
  native WebMCP API shapes (`navigator.ml.tools.register`, `window.registerMCPTool`)
  for Chrome 149+ origin trial compatibility.
- AHTML's richer metadata (cost, reversibility, confirmation, side-effects) surface as
  `x-ahtml-*` annotations on each tool — more context than plain WebMCP baseline.
- `unregisterAll()` for SPA route changes.
- `getBookmarkletHref()` / `getBookmarkletSource()` in `@ahtmljs/webmcp/bookmarklet` —
  floating dark panel that reads `__AHTML_TOOLS__` and fetches `/.well-known/ahtml.json`.
  Works in any browser, no origin trial required.
- ESM-only (browser), < 6 kB min+br.

### Added — `@ahtmljs/kv` (new package)

- `@ahtmljs/kv/memory` — re-exports `InMemoryKvStore` and `InMemoryCacheStore` from
  schema (test-friendly, zero deps).
- `@ahtmljs/kv/upstash` — `UpstashKvStore` and `UpstashCacheStore<T>` backed by
  `@upstash/redis` (optional peer dep). Works in Node.js, Cloudflare Workers, Deno.
- `@ahtmljs/kv/cloudflare` — `CloudflareKvStore` and `CloudflareCacheStore<T>` backed by
  a Cloudflare KV namespace binding. No `@cloudflare/workers-types` required at compile
  time (structural interface).
- `RateLimiter` (main export) — token-bucket rate limiter built on `KvStore.incr()`,
  backend-agnostic. `limiter.check(id)` → `{ allowed, remaining, resetAt, limit }`.
  `limiter.enforce(id)` throws on rate-limit breach.
- Dual ESM + CJS output.

### Added — Cloudflare Worker example

- `examples/cloudflare-worker/` — end-to-end example: Hono v4 + `@ahtmljs/hono` +
  `@ahtmljs/kv/cloudflare` rate limiting + snapshot caching + `wrangler.toml`.
- Demonstrates `Accept: text/markdown` negotiation, per-IP rate limiting from CF KV,
  and 60-second snapshot cache at the edge.

## [0.9.3] — 2026-06-15

**The agent loop** — AHTML inside Claude/Cursor sessions today. Any site becomes
typed MCP tools with zero server-side changes. No breaking changes.

### Added — `ahtml mcp <url>` — stdio MCP proxy

- Runs a JSON-RPC 2.0 stdio server compatible with `claude mcp add`, Cursor,
  Cline, and any MCP client. Works on **any URL** — AHTML adopters or plain HTML.
- **AHTML adopter path**: probes `/.well-known/ahtml.json` on startup; if found,
  `fetch_page` proxies to the real `/ahtml/{path}` endpoint (native compact format)
  and `invoke_action` posts to `execute_url`. The full adoption gradient is live
  inside the agent's session.
- **HTML fallback path**: any non-adopter site auto-extracts via schema-org,
  OpenGraph, microdata, and data-attrs — the same pipeline as `ahtml extract`.
- **Four MCP tools** (universal): `fetch_page`, `list_pages`, `search`, plus
  `invoke_action` for adopters.
- `list_pages` sources from AHTML manifest routes → sitemap.xml → BFS crawl →
  single page, in preference order, capped at 50.
- All debug output goes to stderr; stdout is pure JSON-RPC (Claude Desktop safe).

### Added — `ahtml llms <url>` — site crawler → llms.txt

- Crawls any site and emits a spec-compliant `llms.txt` to stdout or `--out <file>`.
- Source priority: AHTML manifest (curated, typed) → sitemap.xml / sitemap_index.xml
  (cap 200) → BFS crawl (max 30 pages, depth 3, 500 ms delay, respects noindex) →
  single page fallback.
- Respects `robots.txt` `Disallow:` for `User-agent: *` and `User-agent: AhtmlBot`.
- Zero new dependencies — uses Node's built-in `fs/promises` + global `fetch`.

### Fixed — `VERSION` constant updated to `0.9.3` in CLI entry point.

## [0.9.2] — 2026-06-14

**The universal web** — every tool works on every site. Value first, adoption second.
The funnel inverts: `npx @ahtmljs/cli analyze <any-url>` is the release announcement.
No breaking changes.

### Added — `@ahtmljs/schema/extract` (new subpath)

- **`extractFromSchemaOrg(html)`** — extracts Product and Article/Document entities
  from inline `<script type="application/ld+json">` blocks. Moved from
  `@ahtmljs/next` (source of truth now lives in schema).
- **`extractFromOpenGraph(html)`** — extracts entities from OG/Twitter card meta
  tags. Moved from `@ahtmljs/next`.
- **`extractFromDataAttrs(html)`** — extracts entities and actions from
  `data-ahtml-*` attributes. Moved from `@ahtmljs/next`.
- **`extractFromMicrodata(html)`** — NEW extractor for HTML Microdata
  (`itemscope`/`itemprop`). Maps `schema.org/Product` → Product, Article/BlogPosting
  → Document. Fills the largest extraction-yield gap in the corpus.
- **`mergeExtractions(extractions)`** — merges multiple extractions in precedence
  order (data-attrs > schema-org > microdata > opengraph). Moved from `@ahtmljs/next`.
- **`type Extraction`** — exported from `@ahtmljs/schema/extract`.
- `Provenance.source?: 'extracted' | 'authoritative'` added to the
  `Provenance` interface — lets downstream code distinguish hand-authored
  snapshots from auto-extracted ones without a separate channel.

### Added — `@ahtmljs/next` extractors now re-export from schema

All five files in `packages/next/src/extractors/` are thin re-exports from
`@ahtmljs/schema/extract`. The public API is unchanged; next consumers
continue to `import { extractFromSchemaOrg } from '@ahtmljs/next/extractors'`.

### Added — `PageView` + `AHTMLClient.fetchPage()` in `@ahtmljs/agent`

- **`PageView`** — typed view over a snapshot with accessors:
  `.products`, `.documents`, `.tasks`, `.profiles`, `.entities`, `.actions`,
  `.provenance` (`'authoritative' | 'extracted'`), `.snapshot`.
- **`AHTMLClient.fetchPage(url)`** — universal page fetch. Sends
  `Accept: application/ahtml+text, ..., text/html;q=0.5`. If the site is an
  AHTML adopter it returns `PageView { provenance: 'authoritative' }`.
  For any HTML-only site it auto-extracts (schema-org + OG + microdata +
  data-attrs), builds a snapshot, and returns `PageView { provenance: 'extracted' }`.
  Extracted snapshots never carry actions (untrusted markup).
- **`ClientOptions.htmlFallback`** — documents the html-fallback intent for
  callers using `fetch()` directly (advisory; `fetchPage()` always applies it).
- Exported: `PageView`, `PageViewOptions`, `ProvenanceSource`.

### Added — CLI commands: extract, analyze, score, benchmark

- **`ahtml extract <url>`** — fetches any URL, runs all four extractors,
  prints per-extractor yield and the merged compact snapshot. `--json` flag
  emits `toJson()` output.
- **`ahtml analyze <url>`** — one-run shareable block: HTML byte size,
  compact size, token estimates (÷4 est.), savings %, entity counts by type,
  quick agent-readiness probe (JSON-LD, llms.txt, AHTML well-known), nudge
  to `score`. This command is the release announcement.
- **`ahtml score <url> [--json]`** — Lighthouse for agents. Two-tier scoring
  (0–100, grade A–F): Tier A covers every site (JSON-LD 20pt, OpenGraph 15pt,
  extraction yield 15pt, token efficiency 10pt, robots AI directives 10pt,
  llms.txt 10pt); Tier B is AHTML adoption bonus (well-known 10pt, /ahtml 10pt).
  Output includes a copy-paste fix snippet for the top missing item. Exit 1 if
  score < 60.
- **`ahtml benchmark <url>`** — format comparison table: raw HTML vs JSON-LD
  extract vs AHTML compact vs AHTML JSON, in bytes and token estimates. The
  screenshot markets itself.
- Shared `fetch.ts` helper in CLI: 30 s timeout, no new runtime dependencies.

### Fixed — CJS `moduleResolution` for workspace packages using schema subpaths

`packages/agent/tsconfig.cjs.json` and `packages/next/tsconfig.cjs.json` now
add a `paths` override (`@ahtmljs/schema/extract` → `../schema/dist/extract/index`)
so the `module: CommonJS` / `moduleResolution: Node10` CJS typecheck pass can
resolve the new subpath. Runtime `require('@ahtmljs/schema/extract')` continues
to work via Node's exports map; this fix is compile-time only.

## [0.9.1] — 2026-06-11

**Close the v0.9 gate** — nothing new in scope; this release finishes
what v0.9 promised and fixes everything that would otherwise be frozen
broken at 1.0. No breaking changes.

### Added — dual ESM + CJS publish (all library packages)
- `require('@ahtmljs/schema')` (and every other package) now works.
  Implemented as a second `tsc` emit to `dist/cjs/` with a
  `{"type":"commonjs"}` marker — *not* per-entry bundling, which would
  have duplicated `AHTMLError` across entries and broken `instanceof`.
  ESM output is unchanged; the `dist/` layout is additive.
- **Fixed broken documented subpaths.** These all threw
  `ERR_PACKAGE_PATH_NOT_EXPORTED` in 0.9.0 and now resolve in both
  module systems: `@ahtmljs/schema/{stream,kv,sign}`,
  `@ahtmljs/schema/emit/{well-known,mcp,openapi,llms-txt}`,
  `@ahtmljs/schema/http/{accept,conditional}`, `@ahtmljs/agent/sign`
  (also now re-exported from the `@ahtmljs/agent` root).
- A `smoke:imports` script verifies every entry point in both module
  systems; it runs in CI.

### Added — Node 18
- `engines` floor drops from `>=20` to `>=18` everywhere; CI matrix is
  now 18 / 20 / 22.
- `sign.ts` / `did-web.ts` gained a guarded dynamic `node:crypto`
  fallback for bare Node 18 (no Web Crypto global). Edge runtimes never
  reach the import.

### Added — shared conformance suite (`tests/conformance/`)
- One parameterized suite now runs the full wire surface against Next,
  Vite, and Hono: well-known, compact/JSON negotiation, ETag/304, diff,
  NDJSON streaming, encodings, policy 403, mcp.json, openapi.json,
  llms.txt — plus cross-adapter **byte-equality** of emitter outputs.

### Added — performance budgets in CI (`tests/budgets/`)
- The v0.5–v0.8 budget tables are now failing tests, not prose:
  round-trip medians/p99, `AHTMLError` construction `< 50 µs`,
  ES256 sign `< 5 ms` / verify `< 3 ms`, retained-memory ceiling.
  `BUDGET_SCALE` env guards against shared-runner flake.

### Added — `@ahtmljs/cli` doctor verifies signatures
- `doctor` now checks `X-AHTML-Signature` (detached JWS) and embedded
  `provenance.signature`, resolves `did:web` signers, and reports
  pass/fail with actionable hints. Unsigned snapshots get a WARN, not a
  FAIL — non-adopters don't regress.

### Added — OpenTelemetry completion
- New spans: `ahtml.validate`, `ahtml.lint`, `ahtml.verify_signature`
  (via a new sync-safe `traceSync()` helper — public APIs stay sync),
  and `ahtml.serve_diff` in the Next handler.
- `@ahtmljs/hono` is now fully instrumented (it had zero spans).
- New `examples/jaeger` demo: two commands to see the span tree live.

### Changed — `@ahtmljs/vite` consolidation (the deferred v0.8 half)
- The Vite plugin now delegates well-known / MCP / OpenAPI / llms.txt /
  Accept parsing to `@ahtmljs/schema` (411 → 274 LOC). This fixed real
  drift: a stale `generated_by` field, wrong MCP `server.name`, missing
  MCP annotations, an **invalid OpenAPI oauth2 securityScheme**, and
  llms.txt format divergences. Snapshot endpoint bytes were already
  identical and remain so.

### Fixed
- **`@ahtmljs/hono`: catalog routes were shadowed on the real router.**
  `/ahtml/mcp.json` and `/ahtml/openapi.json` were registered after the
  `/ahtml/*` wildcard; real Hono dispatches in registration order, so
  both returned snapshot 404s. Specific routes now register first, with
  regression tests on the real `hono` router (new devDependency).
- **`chooseEncoding()` advertised `br` on runtimes that can't produce
  it** (Node ≤ 22), turning a br-only client into an unhandled throw.
  `br` is now offered only after a one-time `CompressionStream('br')`
  feature probe.
- CI now builds and tests `@ahtmljs/vite` and `@ahtmljs/langchain`
  (both were publish-only — untested code could ship); stale test-count
  step names removed.

## [0.9.0] — 2026-06-02

**The production-ready release** — the last one before `1.0.0-rc`. Adds
OpenTelemetry tracing, a `did:web` key resolver, two **new packages**
(`@ahtmljs/hono`, `@ahtmljs/cli`), and an external auditor `npx ahtml
doctor` for end-to-end verification of any AHTML deployment.

### Added — `@ahtmljs/schema`
- **OpenTelemetry tracing** via a new `trace()` helper. Lazy
  dynamic-imports `@opentelemetry/api` (declared as optional
  `peerDependency`). Zero overhead when OTel is not installed — a
  single null check per span. When present, spans are created via the
  global tracer with proper status / exception / `finally` semantics.
  Also exports `addEvent(name, attrs?)` and `setStatus(code, message?)`.
- **`did:web` resolver** (`resolveDidWeb(did)`, `verifySnapshotWithDidWeb(snap, jws, did)`).
  Fetches the publisher's `.well-known/did.json`, imports each
  `verificationMethod.publicKeyJwk` via `crypto.subtle.importKey`, and
  returns a `VerifyKey[]` ready for signature verification. Caches
  resolved keys for 5 minutes (`CacheStore<VerifyKey[]>`, pluggable).
  Maps JWK `alg` (and `kty`/`crv` fallback) to `ES256` / `EdDSA` /
  `RS256`. Unsupported algs are skipped, not thrown. End-to-end signing
  + verification now requires zero out-of-band key distribution — just
  publish `did.json`.

### Added — instrumentation in existing packages
- **`@ahtmljs/next/handler`** — `createAHTMLRoute` GET wrapped in
  `ahtml.serve_snapshot` span; nested `ahtml.enforce_policy` and
  `ahtml.build_snapshot` spans. All existing behavior (diff endpoint,
  streaming, compression, error paths) preserved exactly.
- **`@ahtmljs/agent/client`** — `AHTMLClient.fetch()` wrapped in
  `ahtml.client.fetch` span; `streamSnapshot()` setup phase wrapped in
  `ahtml.client.stream` span. Attributes include `ahtml.url` and
  `ahtml.format`. Retry, coalescing, timeout, `onEvent` hook all
  unchanged.

### Added — new packages

- **`@ahtmljs/hono@0.9.0`** — first-class Hono adapter. Single export
  `mountAHTML(app, config)` registers `/ahtml/*`, `/.well-known/ahtml.json`,
  `/ahtml/mcp.json`, `/ahtml/openapi.json`, `/llms.txt` on an existing
  Hono app. Structural `HonoAppLike` interface — no hard dependency on
  `hono` (declared `peerDependenciesMeta` optional). Runs identically on
  Node, Bun, Deno, Cloudflare Workers, AWS Lambda. 14 tests covering
  route registration + per-handler response shapes.

- **`@ahtmljs/cli@0.9.0`** — `npx @ahtmljs/cli doctor <url>` walks the
  AHTML discovery chain on a live site:
  1. `/.well-known/ahtml.json` — must parse, must declare endpoints.
  2. `/ahtml` snapshot — must fetch, must `validate()` clean, must
     carry ≥1 entity (warn if zero).
  3. `lint()` warnings printed alongside.
  4. `/ahtml/mcp.json` — must declare `schema_version`, `server`, `tools`.
  5. `/ahtml/openapi.json` — must be `openapi: '3.1.0'`.
  6. `/llms.txt` — must exist, must start with `#` (warn if absent).
  Final report: `N PASS, N WARN, N FAIL`. Exit 0 on all-pass, 1 if any
  fail. ANSI-coloured output, zero deps beyond `@ahtmljs/schema` +
  `@ahtmljs/agent`. Exported `doctor(url, opts?)` returns a structured
  `DoctorReport` for programmatic use. 4 tests covering green/yellow/red
  paths.

### Added — docs
- `docs/observability.md` — OpenTelemetry setup guide. Span catalog,
  attribute reference, Node + Cloudflare Workers wiring examples,
  zero-overhead-when-absent guarantee, roadmap to metrics + logs in 1.x.
- `docs/did-web.md` — did:web producer + verifier guide. Sample
  `did.json` with ES256 key rotation, threat model (trust anchor =
  TLS), 5-min cache semantics, roadmap to did:key + did:ion.

### Changed
- **CI workflow** (`.github/workflows/ci.yml`) — added typecheck +
  unit test jobs for `@ahtmljs/hono` and `@ahtmljs/cli`.
- **Release workflow** (`.github/workflows/release.yml`) — added build,
  typecheck, and `npm publish --provenance` steps for the two new
  packages. The auto-generated GitHub Release body lists all seven
  packages with npm links.

### Compatibility
- **Fully additive.** No public API removed. v0.8 callers compile
  unchanged.
- **Wire-compatible.** Same compact text, canonical JSON, NDJSON,
  diff endpoint, `Accept-Encoding` negotiation as v0.8.
- **Edge-runtime preserved.** No new `node:*` imports. OTel + did:web
  both use Web Standards exclusively.
- **All seven `@ahtmljs/*` packages bumped 0.8.1 → 0.9.0**, peer-deps
  aligned, inter-package deps pinned to exact `0.9.0`.

### Test totals
- Schema: **170 passing + 1 intentional skip** (was 149), 0 todo — +21
  tests for OTel no-op behavior and did:web key resolution.
- Agent: 57 passing (unchanged behavior; OTel wrapping is transparent)
- Next: 53 passing (unchanged behavior; OTel wrapping is transparent)
- Vite: 11 passing
- LangChain: 5 passing
- **Hono: 14 passing** (NEW)
- **CLI: 4 passing** (NEW)
- UX integration: 30 passing
- **Total: 344 passing, 0 todo, 0 failing** (was 305 at v0.8.1)

## [0.8.1] — 2026-05-31

**Patch: restore `buildLlmsTxt` v0.7 back-compat.** Adopters who were
calling `buildLlmsTxt({title, description, sections, ahtml_manifest_url})`
on v0.4–v0.7 hit a typecheck error on v0.8.0 because the signature
moved to `{site, ...}`. The legacy shape is now restored as a runtime-
discriminated overload — both forms produce their original output. The
canonical v0.8 form is unchanged.

### Fixed
- **`@ahtmljs/schema`** — `buildLlmsTxt()` now accepts
  `LlmsTxtConfig | LegacyLlmsTxtConfig`. The legacy `{title, description?,
  sections?, ahtml_manifest_url?}` shape is detected by the absence of
  `site` and rendered via the v0.4–v0.7 path: rich `## H2` sections + a
  `## Machine-readable` block driven by `ahtml_manifest_url`. The new
  `{site, title?, description?, routes?}` shape still emits the canonical
  `## Pages` + `## Machine-readable` layout. Zero call-site changes
  required for v0.7 → v0.8 upgrade.
- **`@ahtmljs/next`** — `createLlmsTxtRoute(cfgFn?, configOverride?)`
  widened: `cfgFn` may return `AHTMLConfig | LegacyLlmsTxtConfig | LlmsTxtConfig`.
  The route shell detects `AHTMLConfig` (by presence of `policy` /
  `default_ttl` / `emit_mcp` / `emit_openapi`) and translates to
  `LlmsTxtConfig`; everything else is forwarded verbatim to
  `buildLlmsTxt()` which auto-discriminates.
- **`examples/landing`** — the v0.7 rich-sections call site in
  `app/llms.txt/route.ts` continues to produce its hand-curated
  `## Get started` / `## Demo` / `## Machine-readable` output. The CI
  typecheck failure that v0.8.0 caused is gone.

### Added
- **`@ahtmljs/schema`** — new exported type `LegacyLlmsTxtConfig` for
  callers who want to construct the v0.7 shape with type safety.
- **Tests** — `@ahtmljs/next`'s `emitters.test.ts` now covers both
  shapes: the new `{site, ...}` Pages layout and the legacy `{title,
  sections, ahtml_manifest_url}` rich layout.

### Compatibility
- All five packages bumped 0.8.0 → 0.8.1 with peer-deps aligned.
- v0.8.0 callers compile unchanged.
- v0.7 callers (rich `buildLlmsTxt` shape) compile unchanged again —
  the v0.8.0 CHANGELOG note "Direct callers of `buildLlmsTxt()` need a
  one-line update" no longer applies. Both shapes are first-class.

### Test totals
- Schema: 149 passing
- Agent: 57 passing
- Next: **53 passing** (was 51 — adds 2 for the legacy shape coverage)
- Vite: 11 passing
- LangChain: 5 passing
- UX integration: 30 passing
- **Total: 305 passing, 0 todo, 0 failing** (was 303 at v0.8.0)

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
- **`buildLlmsTxt` signature** — adds a canonical
  `{site, title?, description?, routes?}` shape. **v0.8.1 restored
  back-compat for the legacy `{title, sections, ahtml_manifest_url}`
  shape**, so v0.7 callers compile unchanged on v0.8.1+. If you're
  pinning exactly v0.8.0, direct callers of `buildLlmsTxt()` need a
  one-line update — pin v0.8.1 instead and the rich shape continues
  to work.

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

[Unreleased]: https://github.com/DibbayajyotiRoy/AHTML/compare/v0.9.0...HEAD
[0.9.0]: https://github.com/DibbayajyotiRoy/AHTML/compare/v0.8.1...v0.9.0
[0.8.1]: https://github.com/DibbayajyotiRoy/AHTML/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/DibbayajyotiRoy/AHTML/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/DibbayajyotiRoy/AHTML/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/DibbayajyotiRoy/AHTML/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/DibbayajyotiRoy/AHTML/compare/v0.4.0...v0.5.0
[0.1.0]: https://github.com/DibbayajyotiRoy/AHTML/releases/tag/v0.1.0

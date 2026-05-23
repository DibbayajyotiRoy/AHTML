# Changelog

All notable changes to AHTML are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning
follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

Planned for v0.6 (the *error story* release):
- Unified `AHTMLError` taxonomy with stable error codes, actionable `hint`
  field, and ES2022 `cause` chaining across every package
- Client-side retry + timeout in `AHTMLClient` with `Retry-After` honoring
- Request coalescing (parallel `fetchSnapshot()` for the same URL → one fetch)
- `onEvent` logging hook for structured observability
- `docs/errors.md` enumerating every code with example `catch` blocks

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

[Unreleased]: https://github.com/DibbayajyotiRoy/AHTML/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/DibbayajyotiRoy/AHTML/compare/v0.4.0...v0.5.0
[0.1.0]: https://github.com/DibbayajyotiRoy/AHTML/releases/tag/v0.1.0

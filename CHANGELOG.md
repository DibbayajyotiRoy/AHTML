# Changelog

All notable changes to AHTML are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning
follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

Planned for v0.2:
- Signed snapshots via `did:web` and detached JWS over canonical JSON
- `@ahtmljs/agent/sign` verifier
- Streaming snapshots (NDJSON over chunked transfer)
- Diff subscriptions over SSE
- Hardened `format-compact` parser
- `@ahtmljs/vite`, `@ahtmljs/sveltekit` plugins

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

[Unreleased]: https://github.com/DibbayajyotiRoy/AHTML/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/DibbayajyotiRoy/AHTML/releases/tag/v0.1.0

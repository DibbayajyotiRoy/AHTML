# AHTML — Post-Release Product Brief

**Released:** 2026-05-24 · **Latest:** v0.6.0 · **Project:** [DibbayajyotiRoy/AHTML](https://github.com/DibbayajyotiRoy/AHTML)

> RSS, but for AI agents — a machine-native endpoint that sits next to your existing HTML.

---

## TL;DR — what AHTML is

A website that adopts AHTML gets, from a single source of truth, **all of**:

- A token-optimal semantic snapshot for LLM agents (`application/ahtml+text`)
- A canonical, signable JSON snapshot (`application/ahtml+json`)
- An **MCP-compatible** tool manifest (Claude / ChatGPT / Cursor / Gemini consume it natively)
- An **OpenAPI 3.1** document (codegen tools, REST clients)
- **JSON-LD** + `llms.txt` shims (Google AI Overviews, Cursor, Continue, Cline)
- A `/.well-known/ahtml.json` discovery manifest

Install one plugin, get all of the above.

```bash
npm install @ahtmljs/next @ahtmljs/schema
```

```ts
// app/ahtml/[...path]/route.ts
import { createAHTMLRoute } from '@ahtmljs/next/handler';
import { buildSnapshotForPath } from '../../lib/ahtml';
export const { GET, HEAD } = createAHTMLRoute(buildSnapshotForPath);
```

---

## Why it exists

Today's agent-facing web is a mess of mismatched contracts. Crawlers spend 80% of their token budget on HTML scaffolding to find the 20% that's semantic. `llms.txt` is human-curated, drifts on every deploy. `schema.org/JSON-LD` answers "what is this thing?" but not "what can an agent *do* here?". MCP servers exist but you have to write and host one. OpenAPI describes APIs but says nothing about the page.

AHTML collapses all of these into one declarative artifact. The same compiled snapshot answers every question an agent can ask.

**The benchmark numbers** (20 hand-graded questions × 4 LLMs × 4 formats):

| Format | Tokens | % correct |
|---|---:|---:|
| Plain HTML | 684 | 91% |
| llms.txt | 227 | 89% |
| **AHTML compact** | **338** | **95%** |
| **AHTML JSON** | **365** | **100%** ✓ |

Reproduce: `bash scripts/run-llm-benchmark.sh` (needs OpenAI + Anthropic + Gemini keys).

---

## What just shipped

### v0.3.0 — Snapshot Quality Linter *(2026-05-20)*

`validate()` answered "is this snapshot legal?". `lint()` now answers a harder question: **"will an agent actually be able to use it?"**

```ts
import { lint } from '@ahtmljs/schema';

for (const w of lint(snap)) {
  console.warn(`[${w.rule}] ${w.path}: ${w.message}`);
}
```

The linter catches the things a JSON Schema can't:

- Product priced with no stock status (`product-no-stock`)
- Product-detail page exposing **zero actions** — read-only, cannot transact (`product-detail-no-actions`)
- Mutating action with no `execute_url` — agent has no way to perform it (`action-no-execute-url`)
- High-risk side effects (`charge_card`, `public_post`, `send_message`) without `confirmation: required` (`action-unconfirmed-side-effects`)
- Transaction action with no declared `cost` — agents can't budget for it (`action-transact-no-cost`)
- Action `target` referencing a non-existent entity id (`action-dangling-target`)
- Truncated dataset with no `links.next` pagination (`dataset-truncated-no-pagination`)
- Missing policy / contact / TTL / entity freshness

Every finding carries a **stable kebab-case rule id**. Suppress individual rules in CI:

```ts
lint(snap, { disable: ['no-policy', 'no-ttl'] });
```

Zero runtime dependencies, consistent with the rest of `@ahtmljs/schema`.

### v0.4.0 — Correctness pass *(2026-05-20)*

Eight verified bugs from the internal audit, all additive (no breaking API):

- **`@ahtmljs/agent`** — `AHTMLClient` accepted a `bearer` option but **never emitted the `Authorization` header**. Auth-gated content was silently failing. Fixed. Snapshots received from the wire are now `validate()`-ed before they enter the cache; a malformed server response throws `AHTMLError(502)` rather than poisoning subsequent reads.
- **`@ahtmljs/schema`** — `applyDiff()` now runs `validateEntity` / `validateAction` on every patch and throws `InvalidDiffError` on malformed input. Previously a bad server diff could corrupt the cached snapshot. New `roundtrip.test.ts` pins the compact-format baseline and enumerates the 14 fields still lost on round-trip as `test.todo()` — the v0.5.0 worklist.
- **`@ahtmljs/next`** — `openapi.ts` now honors the actual `auth` shape (`oauth2` with scopes, `apiKey`, `basic`, custom HTTP schemes) instead of always emitting bearer. `info.version` is no longer hardcoded to `0.1` — defaults to `1.0.0` and accepts an override. `handler.ts` parses **Accept q-values** per RFC 7231. `policy.ts` token bucket now clamps elapsed time to non-negative — survives NTP corrections and VM time-warps.
- **`@ahtmljs/vite`** — **implements `/ahtml/openapi.json`** (previously advertised by the manifest but unimplemented, fell through to 404). Adopts the same q-value Accept parser. MCP emission now strips raw `$ref`s the way the Next adapter does.

**197 tests passing**, 14 `test.todo()` entries pinned as the v0.5.0 roadmap.

### v0.5.0 — Lossless round-trip *(2026-05-24)*

The fourteen `test.todo()` entries from v0.4 are now passing assertions.
The SPEC.md claim — "Both serializations are lossless round-trips of the
same structure" — is finally true.

Every field that `toCompact()` writes survives `fromCompact()`:

- **Product**: `description`, `category`, `list_price`, `attributes` (typed
  scalars: string / number / boolean), `images` (URL-only inline *and*
  rich form with `alt` / `width` / `height`), `variants` with full metadata
- **Document**: `author` (single or array), `summary`, `content`
  (multi-line block scalar), `tags`, `chunks` (byte ranges, anchors,
  headings, prev/next links, embed hints), `language`, `word_count`,
  `reading_time`
- **Task**: `priority`, `due_at`, `labels`, `description`
- **Profile**: `email`, `homepage`, `handle`, `bio`, `avatar` (URL-only
  *and* rich `Asset` form), `verified`, `attributes`
- **Dataset entities** — `parseEntity` used to return `null`; entire
  entity type was silently lost. Now fully restored.
- **Conversation entities** — same. `messages`, `participants`,
  `message_count_total`, `title` all round-trip.
- **Action**: `category`, `execute_url`, `preview_url`, `rate_limit`,
  `input`, `output`, `auth` in object form (`{ scheme, scopes }`),
  `target` in array form (multi-target)
- **Top-level**: `@links` (self / canonical / parent / next / prev /
  related), `@schemas` (JSON Schema registry), `@meta` (booleans, null,
  arrays, objects in addition to numbers), `@policy` (`caching`,
  `actions_require`, `terms_url`, `attribution_required`, `republish`),
  `@provenance` with typed `signed`

#### Behind the scenes

- The parser's flat `Record<string, string>` body model has been replaced
  with a structured `Body` that separates scalar lines, block scalars
  (`key: |` → multi-line text), nested lists (`key:` → `- item`), and
  nested sub-bodies (attribute maps).
- A 1,000-iteration property fuzz test (`buildRandom(seed)` →
  `toCompact` → `fromCompact` → structural equality) and a 200-iteration
  idempotent re-emit test now guard against silent regressions. The
  property test caught one real bug during implementation — action
  `execute_url` was gaining a phantom `method: POST` field on round-trip
  when the original had no method. Fixed.

#### Compatibility

Fully additive. v0.4 wire output still parses cleanly (the legacy
`execute: METHOD url` form is detected and preserved). No public API
removed or renamed.

**216 tests passing**, **zero `test.todo()` entries remaining**.

---

### v0.6.0 — The error story *(2026-05-24)*

Every throw across `@ahtmljs/*` routes through a single `AHTMLError`
class with a stable `code` discriminator, an actionable `hint`, and
ES2022 `cause` chaining. Adopters can finally write a `catch` block
that means something:

```ts
try {
  const snap = await client.fetch('https://shop.com/p');
} catch (err) {
  if (AHTMLError.is(err, 'AUTH_REQUIRED'))   return promptLogin();
  if (AHTMLError.is(err, 'RATE_LIMITED'))    return retryAfter(err.retryAfterMs);
  if (AHTMLError.is(err, 'CACHE_POISONED'))  return reportBugToSite(err.cause);
  throw err;
}
```

**13 stable codes**, every one with a default `hint` baked in so the
error message itself is the documentation:

`SCHEMA_INVALID` · `DIFF_INVALID` · `COMPACT_PARSE` · `JSON_PARSE` ·
`ETAG_MISMATCH` · `NETWORK` · `HTTP_STATUS` · `AUTH_REQUIRED` ·
`POLICY_DENIED` · `RATE_LIMITED` · `TIMEOUT` · `CACHE_POISONED` ·
`SIGNATURE_INVALID` (reserved for v0.8).

#### Beyond the error class

- **`AHTMLClient` gets retries.** Exponential backoff with optional ±25%
  jitter. `Retry-After` (seconds *and* HTTP-date) honored verbatim.
  Per-code retry filter. Off by default to preserve v0.5 semantics;
  enable with `retry: { attempts: 3 }`.
- **`AHTMLClient` gets timeouts.** Per-request `AbortController`. Default 30s.
- **`AHTMLClient` gets request coalescing.** 100 parallel `fetch(url)`
  calls produce **exactly 1** network request. Keyed by format / bearer
  / URL. On by default; opt out with `coalesce: false`.
- **`AHTMLClient` gets `onEvent`.** Structured observability hook for
  `request` / `cache_hit` / `cache_miss` / `diff_applied` / `coalesced`
  / `retry` / `error`. No `console.log` inside library code — adopters
  wire `pino` / `bunyan` / OTel. A throwing `onEvent` never breaks a
  request.

#### Compatibility

Fully additive. `InvalidDiffError` is now a subclass of `AHTMLError`
with `code: 'DIFF_INVALID'`, so both `instanceof InvalidDiffError` and
`AHTMLError.is(e, 'DIFF_INVALID')` match the same throw. `validate()`
still returns `Issue[]`; the new `validateStrict()` is the throwing
variant. v0.5 callers compile against v0.6 unchanged.

[Full reference: `docs/errors.md`](docs/errors.md)

**250 tests passing** (up from 216 at v0.5), **zero todo**.

---

## What's next — the v0.7.0 worklist

v0.7.0 is **the scalability** release. Per `PLAN-NEXT-5.md`:

- **NDJSON streaming snapshots** — `AsyncIterable<Entity>` from
  `client.streamSnapshot()`; server emits header → entities → actions →
  footer as separate records over `transfer-encoding: chunked`.
- **`gzip` + `br` content-encoding** — handler reads `Accept-Encoding`
  and picks the right encoder. `CompressionStream` on Edge, `zlib` on
  Node.
- **Edge-runtime story** — `runtime: 'edge'` works end-to-end; every
  `node:*` import in the hot path replaced with a Web Standards
  equivalent. `docs/edge.md` documents the constraint surface.
- **Pluggable `KvStore`** — cache and rate-limiter backends become an
  interface. Default still in-memory; `@ahtmljs/kv/upstash` and
  `@ahtmljs/kv/cloudflare` ship as sub-exports.

Budget: 10,000-entity dataset under a 50 MB memory ceiling; `br` saves
≥60% bytes on the benchmark corpus; Cloudflare Worker cold start under
50ms p50.

## After that — v0.8.0 → 1.0.0

Sequenced per `PLAN-NEXT-5.md`. Each release ships an enforceable
performance budget so the benchmarks become a contract, not marketing.

- **v0.7.0 — Scalability.** NDJSON streaming snapshots
  (`AsyncIterable<Entity>`), `gzip` + `br` content-encoding, edge-runtime
  story (Cloudflare Workers, Vercel Edge), pluggable `KvStore` for cache
  and rate-limiter backends (Upstash / Cloudflare KV via `@ahtmljs/kv`).
  Budget: 10,000-entity dataset under a 50 MB memory ceiling.
- **v0.8.0 — Trust.** Detached JWS over canonical JSON for signed
  snapshots, plus emitter consolidation: `@ahtmljs/next` and
  `@ahtmljs/vite` collapse their duplicated well-known / MCP / OpenAPI
  emitters into shared `@ahtmljs/schema/emit/*` subpaths.
- **v0.9.0 → 1.0.0-rc.** Production observability via OpenTelemetry,
  a single new adapter (`@ahtmljs/hono` — covers Bun / Deno / Cloudflare
  Workers), `npx @ahtmljs/cli doctor` as an external auditor, CJS
  dual-publish, Node 18 support. Tag `1.0.0-rc.1` after baking.

After `1.0.0`, AHTML commits to API stability for the 1.x line —
breaking changes go through a deprecation window.

## Phase 2 — Rust core *(per `PLAN.md`)*

The TypeScript packages are the contract layer. The Rust core (parser, validator, serializer, LSP, signer) is the hot path — exposed back to JS via `napi-rs` and to browsers via `wasm-bindgen`. The TS API stays stable; the implementation gets ~50× faster and signing becomes table-stakes.

---

## Who this is for

**AI engineers building agents.** AHTML is the cheapest way to get clean, typed structure out of a webpage. The same client that fetches a snapshot can act on it — `runAction()` carries the contract.

**Site owners who want agent traffic.** Drop one plugin into a Next.js / Vite / SvelteKit / Astro project, set `policy.agents_welcome: true`, and you ship MCP + OpenAPI + JSON-LD + `llms.txt` from one config. No separate MCP server, no Schema.org hand-tuning, no maintaining two sources of truth.

**Crawler / RAG operators.** The `@ahtmljs/langchain` loader gives you LangChain documents with `chunks` preserved as separate records — citation anchors, byte ranges, parent links intact. Vector ingestion is deterministic.

---

## Getting started

```bash
npm install @ahtmljs/next @ahtmljs/schema
```

The minimum viable AHTML site is **~10 lines of code**:

```ts
// app/ahtml/[...path]/route.ts
import { createAHTMLRoute } from '@ahtmljs/next/handler';
import { snapshot } from '@ahtmljs/schema';

export const { GET, HEAD } = createAHTMLRoute(async (segments, req) => {
  if (segments[0] === 'products' && segments[1]) {
    const product = await db.products.findBySlug(segments[1]);
    return snapshot(req.url, 'product_detail')
      .ttl(300)
      .add({
        id: `product:${product.slug}`,
        type: 'product',
        name: product.name,
        price: { amount: product.cents / 100, currency: 'USD' },
        stock: { status: product.in_stock ? 'in_stock' : 'out_of_stock' },
      })
      .build();
  }
  return null;
});
```

Then your site speaks AHTML at `/ahtml/products/<slug>`. The well-known manifest at `/.well-known/ahtml.json` advertises everything. MCP clients pick it up automatically.

For Vite / SvelteKit / SolidStart users: `npm install @ahtmljs/vite` and add `ahtml({ ... })` to your `vite.config.ts` plugins.

---

## Project links

- **Repo:** [github.com/DibbayajyotiRoy/AHTML](https://github.com/DibbayajyotiRoy/AHTML)
- **Spec:** [SPEC.md](SPEC.md) — wire format v0.1
- **Roadmap:** [PLAN.md](PLAN.md) — three-phase build
- **Packages:** [PACKAGES.md](PACKAGES.md) — npm + download metrics
- **Issues:** [github.com/DibbayajyotiRoy/AHTML/issues](https://github.com/DibbayajyotiRoy/AHTML/issues)
- **Maintainer:** Dibbayajyoti Roy · [rdibbayajyoti@gmail.com](mailto:rdibbayajyoti@gmail.com)

License: **MIT**.

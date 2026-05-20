# AHTML — Post-Release Product Brief

**Released:** 2026-05-20 · **Latest:** v0.4.0 · **Project:** [DibbayajyotiRoy/AHTML](https://github.com/DibbayajyotiRoy/AHTML)

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

---

## What's next — the v0.5.0 worklist

The audit produced a verified, prioritized backlog. v0.5.0 is the **lossless compact round-trip** release: every field that `toCompact()` writes must round-trip through `fromCompact()`. Right now 14 fields silently drop.

Locked in via `test.todo()` in [`roundtrip.test.ts`](packages/schema/src/__tests__/roundtrip.test.ts):

- Product `description / category / list_price / attributes / images / variants`
- Document `author / summary / content / tags / chunks / language / word_count`
- Task `priority / due_at / labels / description`
- Profile `email / homepage / handle / bio / avatar / verified / attributes`
- **Dataset entities** (currently `parseEntity` returns null — fully lost)
- **Conversation entities** (same)
- Action `category / execute_url / preview_url / rate_limit / input / output`
- Action `auth` in object form (`{ scheme, scopes }`)
- Action `target` in array form (multi-target actions)
- `links` block (self / canonical / parent / next / prev / related)
- `schemas` block (per-snapshot JSON Schema registry)
- `meta` block with non-numeric values
- Policy `caching / actions_require / terms_url / attribution_required / republish`

When v0.5.0 lands, the SPEC.md claim "Both serializations are lossless round-trips of the same structure" becomes true.

## After that — v1.0.0

- **Detached JWS over canonical JSON.** Signed snapshots, verifiable provenance — the v0.2 promise from `PLAN.md` becomes shippable infrastructure.
- **CJS dual-publish.** Removes the ESM-only constraint that excludes older Node / Electron / certain bundlers.
- **`gzip` / `br` content-encoding.** The "compact format is small" claim becomes "compact format is small *and* compressed."
- **Streaming response bodies.** Edge-runtime friendly for large datasets.
- **Architectural consolidation.** Today, `@ahtmljs/next` and `@ahtmljs/vite` each carry their own copies of the well-known manifest, MCP, and OpenAPI emitters. The plan is to extract the framework-neutral helpers into `@ahtmljs/schema` so there's one canonical implementation that every adapter shares.

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

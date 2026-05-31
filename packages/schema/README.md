# @ahtmljs/schema

The AI-agent contract layer for any TypeScript app — types, validator, dual-format serializers, structural diff, linter, JWS signing, and pluggable KV/Cache interfaces. Used by every other `@ahtmljs/*` package.

[![npm version](https://img.shields.io/npm/v/@ahtmljs/schema.svg)](https://www.npmjs.com/package/@ahtmljs/schema)
[![license MIT](https://img.shields.io/badge/license-MIT-blue.svg)](#license)
[![MCP-compatible](https://img.shields.io/badge/MCP-2025--11--25-green.svg)](https://modelcontextprotocol.io)
[![OpenAPI 3.1](https://img.shields.io/badge/OpenAPI-3.1-brightgreen.svg)](https://spec.openapis.org/oas/v3.1.0)
[![provenance](https://img.shields.io/badge/npm-provenance-success.svg)](https://docs.npmjs.com/generating-provenance-statements)

```bash
npm install @ahtmljs/schema
```

```ts
import { snapshot, toCompact, validate } from '@ahtmljs/schema';

const snap = snapshot('https://shop.com/p/mbp-14', 'product_detail')
  .add({ id: 'p:mbp-14', type: 'product', name: 'MacBook Pro 14"',
         price: { amount: 1999, currency: 'USD' } })
  .build();

console.log(toCompact(snap));   // token-optimal text — feed straight to an LLM
console.log(validate(snap));    // structured issues, never throws
```

Zero runtime dependencies. ESM-only. Runs on Node 20+, Cloudflare Workers, Vercel Edge, Bun, and Deno — no `node:*` imports anywhere in the package.

## How well does an AI read it?

We asked four frontier models **20 questions** about the same page — given in 4 different formats.

| Format you give the AI | Tokens used | Right answers |
|---|---:|---:|
| Plain HTML | 684 | 91% |
| llms.txt | 227 | 89% |
| **AHTML compact** | **338** | **95%** |
| **AHTML JSON** | **365** | **100%** |

AHTML JSON: every answer right. AHTML compact: ~50% fewer tokens than HTML — and more accurate.

<details>
<summary><sub><i>How we measured this — open for details</i></sub></summary>
<sub>

- Real API calls to **gpt-4o-mini, claude-haiku-4.5, gemini-2.5-flash, llama-3.3-70b** at temperature=0.
- 20 hand-graded questions an AI agent actually wants to know: *price, in stock?, SKU, return window, confirmation needed?, author, publication date,* etc.
- Tokens counted with the official OpenAI + Anthropic tokenizers (`gpt-tokenizer`, `@anthropic-ai/tokenizer`). No `text.length/4` guessing.
- Reproduce: `git clone https://github.com/DibbayajyotiRoy/AHTML && cp .env.example .env && bash scripts/run-llm-benchmark.sh`

[Full report](https://github.com/DibbayajyotiRoy/AHTML/blob/main/benchmark-results-llm.md) · [Source](https://github.com/DibbayajyotiRoy/AHTML/tree/main/examples/llm-benchmark)

</sub>
</details>

## What this package gives you

- **TypeScript types** for `Snapshot`, six entity primitives (`Product`, `Document`, `Task`, `Profile`, `Dataset`, `Conversation`), plus `Action`, `Policy`, `Provenance`, `Links`, `SnapshotDiff`, `Chunk` (the RAG primitive).
- **`snapshot()` builder DSL** — fluent, typed, deterministic.
- **Zero-dependency runtime validator** (`validate`) returning structured issues with `path` + `severity`. Plus a throwing variant (`validateStrict`) for hot paths that want to bubble up an `AHTMLError` with code `SCHEMA_INVALID`.
- **`lint(s)` quality linter** — best-practice rules *beyond* validity: a priced product with no stock, a product-detail page with no actions, an action with `charge_card` side-effects but no required confirmation, a truncated dataset with no `next` link, a dangling action target. Every finding has a stable `rule` id you can suppress in CI.
- **Two serializations**:
  - `toJson(s)` / `fromJson(text)` — canonical JSON, deterministic, signable. `application/ahtml+json`.
  - `toCompact(s)` / `fromCompact(text)` — token-optimal text, lossless round-trip. `application/ahtml+text`. Default for LLMs.
- **Streaming**: `toJsonSeq(s)` produces NDJSON for `application/ahtml+json-seq` — feed snapshots to an LLM as they assemble.
- **`diff(prev, next)` / `applyDiff(prev, d)`** — structural snapshot diffing for the `application/ahtml-diff+json` incremental endpoint.
- **`computeEtag(s)`** — content-addressed weak ETag, deterministic across runtimes.
- **`sign()` / `verifySnapshot()`** (new in v0.8) — detached JWS over the canonical JSON via Web Crypto. Works on Workers, Edge, Bun, Deno.
- **`KvStore` and `CacheStore<T>` interfaces** — pluggable contracts implemented by `@ahtmljs/next`, the agent client, and any third-party Redis/D1/KV adapter.
- **JSON Schema 2020-12 spec** at `./schema.json` — also published as `application/schema+json` for tool generation.
- **Property-based fuzzing tests** ensure every snapshot round-trips losslessly between compact and JSON forms.

## Quickstart — full builder

```ts
import { snapshot, toCompact, toJson, validate, lint } from '@ahtmljs/schema';

const snap = snapshot('https://shop.com/products/mbp-14', 'product_detail')
  .ttl(60)
  .policy({ agents_welcome: true, license: 'MIT', rate_limit: '100/min' })
  .add({
    id: 'product:mbp-14',
    type: 'product',
    name: 'MacBook Pro 14"',
    price: { amount: 1999, currency: 'USD' },
    stock: { status: 'in_stock', quantity: 42 },
  })
  .action({
    id: 'purchase',
    target: 'product:mbp-14',
    category: 'transact',
    execute_url: '/api/checkout',
    auth: 'required',
    cost: { amount: 1999, currency: 'USD', category: 'purchase' },
    reversible: { reversible: true, window: 'P30D', policy: 'full_refund' },
    side_effects: ['charge_card', 'email_buyer', 'decrement_stock'],
    confirmation: 'required',
  })
  .build();

console.log(toCompact(snap));   // token-optimal text — default for LLM agents
console.log(toJson(snap));      // canonical JSON — sign-able

const issues = validate(snap);
if (issues.some((i) => i.severity === 'error')) throw new Error('invalid');

// validate() asks "is it legal?" — lint() asks "is it useful to an agent?"
for (const w of lint(snap)) {
  console.warn(`[${w.rule}] ${w.path}: ${w.message}`);
}
```

## Diff and apply — incremental snapshots

For long-running agents, you do not want to re-send the whole snapshot every minute. The diff format is content-aware and stable.

```ts
import { diff, applyDiff, computeEtag } from '@ahtmljs/schema';

const d = diff(prev, next);           // SnapshotDiff
const reconstructed = applyDiff(prev, d);
console.assert(computeEtag(reconstructed) === computeEtag(next));
```

`computeEtag(s)` is deterministic across Node, Workers, and Deno — the same snapshot produces the same etag everywhere, which is what makes the `application/ahtml-diff+json` endpoint cacheable.

## Signing — detached JWS over canonical JSON (v0.8)

For supply-chain trust, sign the snapshot with Web Crypto. No Node crypto dependency.

```ts
import { sign, verifySnapshot, toJson } from '@ahtmljs/schema';

const { publicKey, privateKey } = await crypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'],
);

const snap = snapshot('https://news.com/article/42', 'document_detail')
  .add({ id: 'doc:42', type: 'document', name: 'The story' })
  .build();

const signature = await sign(snap, { key: privateKey, kid: 'site-2026-q2' });
// signature is a detached JWS — ship in the `AHTML-Signature` header

const result = await verifySnapshot(snap, signature, {
  trustedKeys: { 'site-2026-q2': publicKey },
});
if (!result.ok) throw result.error;   // typed AHTMLError, code SIGNATURE_INVALID
```

Failures throw or return a typed `AHTMLError` with one of the 13 stable codes introduced in v0.6: `SCHEMA_INVALID`, `DIFF_INVALID`, `COMPACT_PARSE`, `JSON_PARSE`, `ETAG_MISMATCH`, `NETWORK`, `HTTP_STATUS`, `AUTH_REQUIRED`, `POLICY_DENIED`, `RATE_LIMITED`, `TIMEOUT`, `CACHE_POISONED`, `SIGNATURE_INVALID`. Agents can switch on `err.code`.

## KV and Cache interfaces

The schema package owns the contracts; adapters provide implementations.

```ts
import type { KvStore, CacheStore } from '@ahtmljs/schema';

const myKv: KvStore = {
  async get(key)        { /* ... */ return null; },
  async set(key, value, opts) { /* ... */ },
  async delete(key)     { /* ... */ },
};

const myCache: CacheStore<Snapshot> = {
  async get(key)        { /* ... */ return null; },
  async set(key, value, ttlMs) { /* ... */ },
};
```

Pass either to `@ahtmljs/next`'s plugin, to `@ahtmljs/agent`'s client, or to your own Workers/Vercel KV layer. Snapshots are serializable via `toJson` so any string-keyed KV works.

## RAG chunks — deterministic, content-addressed

`Chunk` is the primitive every RAG pipeline needs but rarely standardizes: a stable `id` derived from content, a `parent_id` linking back to the entity, byte and token offsets, and an `embedding_hint`.

```ts
import { chunksFromEntity, computeChunkId } from '@ahtmljs/schema';

const chunks = chunksFromEntity(snap.entities[0], { targetTokens: 512 });
// each chunk.id is sha256(content) — same input always yields same id,
// so two agents indexing the same page never duplicate vectors
```

The chunk id is deterministic across runtimes, which is what makes "how to cite a web page in a rag answer" actually reproducible.

## Emitters (v0.8)

The well-known descriptor, MCP tool list, OpenAPI 3.1 spec, and `llms.txt` emitters used to live in `@ahtmljs/next`. As of v0.8 they are extracted here under `@ahtmljs/schema/emit/*` and re-exported by adapters. Use them directly in any framework.

```ts
import { emitWellKnown, emitMcp, emitOpenApi, emitLlmsTxt }
  from '@ahtmljs/schema/emit';

const wellKnown = emitWellKnown({ origin: 'https://shop.com', routes });
const mcpTools  = emitMcp({ snapshots });           // MCP spec 2025-11-25
const openapi   = emitOpenApi({ snapshots });       // OpenAPI 3.1, JSON Schema 2020-12
const llmsTxt   = emitLlmsTxt({ origin, routes });  // llmstxt.org format
```

This is what lets one plugin expose your site as an MCP server, an OpenAPI provider, a JSON-LD source, *and* an `llms.txt` — without duplicate code.

## Why this exists — concrete numbers

- **321 tests passing** across the AHTML monorepo at v0.7. v0.8 adds JWS signing tests.
- **5 wire formats** all defined here: `application/ahtml+text`, `application/ahtml+json`, `application/ahtml+json-seq`, `application/ahtml-diff+json`, `application/schema+json`.
- **0 runtime dependencies.** The whole package is reachable from Cloudflare Workers' 1 MB script limit without bundler tricks.
- **Lossless round-trip.** Property-based fuzzing covers all six entity types — `fromCompact(toCompact(s)) === s` and `fromJson(toJson(s)) === s` are invariants, not aspirations.

## What is AHTML?

AHTML turns any website into an MCP server, an OpenAPI 3.1 provider, a JSON-LD source, and a token-optimal semantic snapshot — from one plugin. This package is the schema underneath. Most users want:

- [`@ahtmljs/next`](https://www.npmjs.com/package/@ahtmljs/next) — Next.js plugin, auto-emits MCP + llms.txt + OpenAPI
- [`@ahtmljs/vite`](https://www.npmjs.com/package/@ahtmljs/vite) — Vite / SvelteKit / Astro / Remix plugin
- [`@ahtmljs/agent`](https://www.npmjs.com/package/@ahtmljs/agent) — typed client SDK with retry, timeout, request coalescing, streaming
- [`@ahtmljs/langchain`](https://www.npmjs.com/package/@ahtmljs/langchain) — LangChain document loader

## Discovery

Every AHTML-enabled site exposes `/.well-known/ahtml.json`. Point an agent at the origin and it discovers the snapshot routes, the MCP endpoint, the OpenAPI spec URL, and the `llms.txt` location.

## Documentation

- **Repository:** [`DibbayajyotiRoy/AHTML`](https://github.com/DibbayajyotiRoy/AHTML)
- **Spec:** [`SPEC.md`](https://github.com/DibbayajyotiRoy/AHTML/blob/main/SPEC.md)
- **Plan / roadmap:** [`PLAN.md`](https://github.com/DibbayajyotiRoy/AHTML/blob/main/PLAN.md)
- **For AI assistants:** [`docs/agents.md`](https://github.com/DibbayajyotiRoy/AHTML/blob/main/docs/agents.md)
- **Comparison vs MCP / llms.txt / schema.org / OpenAPI:** [`docs/compare.md`](https://github.com/DibbayajyotiRoy/AHTML/blob/main/docs/compare.md)

## Search keywords / Related

People land on this package looking for: ahtml, agent-readable html, mcp server nextjs, how to add mcp to a nextjs app, how to make my site readable by ai agents, how to expose my website as an mcp server, convert website to mcp server, generate llms.txt automatically from nextjs, json-ld vs llms.txt vs mcp, ai-ready website, machine-readable website, structured data for llms, well-known ahtml, token-efficient html, token-optimal compact text serializer for llm, snapshot for llm, json schema for ai snapshot, lossless json serializer, snapshot diff and apply, snapshot lint rules, snapshot signing jws, detached jws typescript, kv cache interface, rag chunk primitive, deterministic content-addressed chunk id, snapshot etag determinism, property-based fuzzing snapshot, json-ld extractor, schema.org to ahtml, openapi 3.1 generator, model context protocol, rss for ai agents, site to mcp server, best way to feed html to gpt, reduce tokens when scraping html for llm, rag pipeline for an entire website, how to cite a web page in a rag answer.

Compared with: firecrawl, scrapingbee, crawlee, apify, browserless, playwright scraper, puppeteer scraper, jina reader, r.jina.ai, schema.org, json-ld, llms.txt, llmstxt.org, anthropic mcp sdk, openai mcp sdk, cursor mcp, modelcontextprotocol typescript sdk, claude desktop mcp, fastmcp, mcp-framework, smithery mcp, vercel ai sdk, langchain webloader, cheerio loader, unstructured.io, readability.js, mozilla readability, trafilatura, diffbot, browserbase, spider rs, exa search, tavily, perplexity api, scrapegraph ai. AHTML is the publisher-side contract those tools would consume if your site emitted one.

AI agent build queries this package answers: build ai agent that browses the web, agent http fetching with cache, agent retry with backoff typescript, request coalescing fetch, typed errors for ai agent sdk, streaming snapshot to llm, llm context window optimizer, tokenizer for cost estimate o200k_base.

## npm keywords

Current keywords in `package.json`: `ahtml`, `agent`, `agent-web`, `semantic-web`, `ai`, `llm`, `crawler`, `mcp`, `model-context-protocol`, `llms-txt`, `json-ld`, `schema`, `openapi`. Proposed additions for v0.8 (paste into `package.json`):

```json
{
  "keywords": [
    "ahtml",
    "agent",
    "agent-web",
    "semantic-web",
    "ai",
    "llm",
    "crawler",
    "mcp",
    "mcp-server",
    "model-context-protocol",
    "llms-txt",
    "json-ld",
    "schema",
    "openapi",
    "openapi-3.1",
    "json-schema",
    "rag",
    "rag-chunks",
    "jws",
    "detached-jws",
    "web-crypto",
    "snapshot",
    "snapshot-diff",
    "etag",
    "kv-store",
    "cache-store",
    "edge-runtime",
    "cloudflare-workers",
    "vercel-edge",
    "deno",
    "bun",
    "tokenizer",
    "ai-agent",
    "agent-sdk"
  ]
}
```

## License

MIT — copyright Dibbayajyoti Roy.

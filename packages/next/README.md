# @ahtmljs/next

Drop into any Next.js app, get MCP + OpenAPI + JSON-LD + llms.txt + signed snapshots from one config.

[![npm version](https://img.shields.io/npm/v/@ahtmljs/next.svg)](https://www.npmjs.com/package/@ahtmljs/next)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/DibbayajyotiRoy/AHTML/blob/main/LICENSE)
[![MCP-compatible](https://img.shields.io/badge/MCP-2025--11--25-7e57c2.svg)](https://modelcontextprotocol.io)
[![OpenAPI 3.1](https://img.shields.io/badge/OpenAPI-3.1-6ba539.svg)](https://spec.openapis.org/oas/v3.1.0)
[![provenance](https://img.shields.io/badge/npm-provenance-26a98b.svg)](https://docs.npmjs.com/generating-provenance-statements)

The Next.js App Router plugin for **[AHTML](https://github.com/DibbayajyotiRoy/AHTML)** — agent-readable HTML for the AI agent web. One config emits an MCP server, an OpenAPI 3.1 spec, JSON-LD, llms.txt, a discovery manifest, and (v0.8) detached-JWS signed snapshots. Browsers still see the same HTML they always have.

```bash
npm install @ahtmljs/next @ahtmljs/schema
```

```ts
// app/ahtml/[[...path]]/route.ts
import { createAHTMLRoute } from '@ahtmljs/next/handler';
import { buildSnapshot } from '@/lib/ahtml';
export const { GET, HEAD } = createAHTMLRoute(buildSnapshot);
export const runtime = 'edge'; // optional — runs on Vercel Edge / Cloudflare Workers
```

## How well does an AI read it?

Same page, four formats, 20 hand-graded questions an AI agent actually wants to know (price, in-stock, SKU, return window, confirmation required, author, pub date).

| Format you give the AI    | Tokens used | Right answers |
| ------------------------- | ----------: | ------------: |
| Plain HTML                |         684 |           91% |
| llms.txt                  |         227 |           89% |
| **AHTML compact**         |     **338** |       **95%** |
| **AHTML JSON**            |     **365** |  **100%** ✓   |

AHTML compact uses ~50% fewer tokens than HTML and still scores higher. AHTML JSON: every answer right.

<details>
<summary><sub><i>How we measured this — open for details</i></sub></summary>
<sub>

- Real API calls to **gpt-4o-mini, claude-haiku-4.5, gemini-2.5-flash, llama-3.3-70b** at temperature=0.
- Tokens counted with the official OpenAI + Anthropic tokenizers (`gpt-tokenizer`, `@anthropic-ai/tokenizer`). No `text.length/4` guessing.
- Cost from real provider usage × public prices.
- Reproduce: `git clone https://github.com/DibbayajyotiRoy/AHTML && cp .env.example .env && bash scripts/run-llm-benchmark.sh`

[Full report](https://github.com/DibbayajyotiRoy/AHTML/blob/main/benchmark-results-llm.md) · [Source](https://github.com/DibbayajyotiRoy/AHTML/tree/main/examples/llm-benchmark)

</sub>
</details>

## Why this exists

Building an MCP server for an existing Next.js site usually means a parallel server, re-modeling your domain, and hand-rolling tool manifests. Generating `llms.txt` means a second pipeline. JSON-LD lives in `<Head>`. None of these talk to each other and none version your snapshots.

`@ahtmljs/next` is a single source of truth. You write one `buildSnapshot()` function; the plugin emits every agent-facing format from it.

- **One source, six endpoints** — snapshot, JSON, diff, MCP, OpenAPI, llms.txt, JSON-LD, `.well-known`
- **Token-efficient HTML** — compact wire format averages ~50% fewer tokens than raw HTML
- **Edge runtime** — no `node:*` imports; runs on Vercel Edge, Cloudflare Workers, Bun, Deno
- **Streaming** — `application/ahtml+json-seq` (NDJSON) for partial reads
- **Typed errors** — 13 stable `AHTMLError` codes; branch on `code`, not regex
- **Signed snapshots (v0.8)** — detached JWS so RAG pipelines can cite a page and prove it

## Quickstart — three files

### 1. Declare snapshots

```ts
// lib/ahtml.ts
import { snapshot } from '@ahtmljs/schema';

export async function buildSnapshot(segments: string[], req: Request) {
  if (segments[0] === 'products' && segments[1]) {
    const p = await db.product.findUnique({ where: { slug: segments[1] } });
    if (!p) return null;
    return snapshot(req.url, 'product_detail')
      .ttl(60)
      .add({
        id: `product:${p.slug}`,
        type: 'product',
        name: p.name,
        price: { amount: p.price, currency: 'USD' },
        stock: { status: p.qty > 0 ? 'in_stock' : 'out_of_stock', quantity: p.qty },
      })
      .action({
        id: 'purchase',
        target: `product:${p.slug}`,
        category: 'transact',
        execute_url: '/api/checkout',
        auth: 'required',
        cost: { amount: p.price, currency: 'USD', category: 'purchase' },
        reversible: { reversible: true, window: 'P30D', policy: 'full_refund' },
        side_effects: ['charge_card', 'email_buyer', 'decrement_stock'],
        confirmation: 'required',
      })
      .build();
  }
  return null;
}
```

### 2. Wire the route handler

```ts
// app/ahtml/[[...path]]/route.ts
import { createAHTMLRoute } from '@ahtmljs/next/handler';
import { buildSnapshot } from '@/lib/ahtml';

export const { GET, HEAD } = createAHTMLRoute(buildSnapshot);
export const runtime = 'edge'; // optional
```

### 3. Add discovery, llms.txt, MCP, OpenAPI

```ts
// app/.well-known/ahtml.json/route.ts
import { createWellKnownRoute } from '@ahtmljs/next/well-known';
export const { GET } = createWellKnownRoute();
```

```ts
// app/llms.txt/route.ts
import { createLlmsTxtRoute } from '@ahtmljs/next/llms-txt';
export const { GET } = createLlmsTxtRoute();
```

```ts
// app/ahtml/mcp.json/route.ts
import { createMcpRoute } from '@ahtmljs/next/mcp';
export const { GET } = createMcpRoute(buildSnapshot);
```

```ts
// app/ahtml/openapi.json/route.ts
import { createOpenApiRoute } from '@ahtmljs/next/openapi';
export const { GET } = createOpenApiRoute(buildSnapshot);
```

## What's now live on your site

| Endpoint                          | Format                            | Consumer                                       |
| --------------------------------- | --------------------------------- | ---------------------------------------------- |
| `/ahtml/<route>`                  | `application/ahtml+text` (compact)| LLM agents — Claude, ChatGPT, Gemini, Cursor   |
| `/ahtml/<route>?fmt=json`         | `application/ahtml+json`          | Programmatic clients, signing                  |
| `/ahtml/<route>?fmt=json-seq`     | `application/ahtml+json-seq`      | Streaming / NDJSON readers                     |
| `/ahtml/<route>?since=<etag>`     | `application/ahtml-diff+json`     | Incremental crawlers, RAG re-indexers          |
| `/ahtml/mcp.json`                 | MCP tool manifest                 | Claude Desktop, ChatGPT, Cursor, Copilot       |
| `/ahtml/openapi.json`             | OpenAPI 3.1                       | REST clients, codegen                          |
| `/.well-known/ahtml.json`         | Discovery manifest                | Any AHTML-aware agent                          |
| `/llms.txt`                       | Markdown (llmstxt.org convention) | IDE agents — Cursor, Continue, Cline           |

## v0.7 — streaming, compression, pluggable cache, edge runtime

The route handler negotiates `Accept-Encoding` (gzip / br) and emits NDJSON for clients that prefer streaming. Caches are now pluggable via `CacheStore<T>` and `KvStore` — point them at Redis, Upstash, Cloudflare KV, or your in-process LRU.

```ts
import { createAHTMLRoute } from '@ahtmljs/next/handler';
import { buildSnapshot } from '@/lib/ahtml';
import { upstashKv } from '@/lib/cache';

export const { GET, HEAD } = createAHTMLRoute(buildSnapshot, {
  cache: upstashKv,      // any CacheStore<Snapshot> / KvStore
  compress: ['br', 'gzip'],
  stream: true,          // emit json-seq when Accept includes it
});

export const runtime = 'edge';
```

ESM-only since 0.7. No `node:*` imports anywhere in the runtime.

## v0.8 — signed snapshots (detached JWS)

A RAG pipeline can now cite a page and prove the page said what it said.

```ts
import { sign, verifySnapshot } from '@ahtmljs/schema/sign';

// Server — sign on emit
const snap = await buildSnapshot(['products', 'kettle'], req);
const sig = await sign(snap, privateKey); // Web Crypto, EdDSA / ES256

// Agent — verify on consume
const ok = await verifySnapshot(snap, sig, { trustedKeys: [publicKey] });
if (!ok) throw new Error('SIGNATURE_INVALID');
```

The signature is **detached** — it travels in the `AHTML-Signature` header so the JSON body byte-for-byte matches what was hashed. Canonical-JSON serialization is handled internally by `@ahtmljs/schema/sign`.

Emitter consolidation: in 0.8 the well-known / MCP / OpenAPI / llms.txt emitters live in `@ahtmljs/schema/emit/*` and are re-exported by `@ahtmljs/next`, `@ahtmljs/vite`, and `@ahtmljs/langchain`. The public API of this package is unchanged.

## Typed errors

All thrown errors are instances of `AHTMLError` with one of 13 stable codes. Branch on `error.code`, not message strings.

```
SCHEMA_INVALID    DIFF_INVALID       COMPACT_PARSE      JSON_PARSE
ETAG_MISMATCH     NETWORK            HTTP_STATUS        AUTH_REQUIRED
POLICY_DENIED     RATE_LIMITED       TIMEOUT            CACHE_POISONED
SIGNATURE_INVALID
```

Combine with the agent SDK (`@ahtmljs/agent`) for retry-with-backoff, request coalescing, and per-call timeouts:

```ts
import { createAgent } from '@ahtmljs/agent';
const agent = createAgent({ retry: { max: 3 }, timeout: 5_000, coalesce: true });
const snap = await agent.fetchSnapshot('https://example.com/ahtml/products/kettle');
```

## Comparison

| You currently use         | What `@ahtmljs/next` gives you instead                          |
| ------------------------- | --------------------------------------------------------------- |
| Anthropic / OpenAI MCP SDK | Auto-generated MCP manifest from the same source as your page  |
| FastMCP / mcp-framework   | App-Router-native handlers; no parallel Python/Node MCP server  |
| Jina Reader / r.jina.ai   | Self-hosted; you control caching, signing, per-route policy     |
| Firecrawl / ScrapingBee   | The site emits its own clean snapshot; no scraper to maintain   |
| Readability / Trafilatura | Structured entities + actions, not a flattened text dump        |
| Raw `llms.txt`            | Generated from snapshots, stays in sync with the actual site    |
| Schema.org JSON-LD in `<Head>` | Same JSON-LD, plus diffs, signing, and MCP tools            |

## Compatibility

- **Node 20+**, ESM-only
- **Next.js 14+ / 15+** (App Router)
- **Edge runtime**: Vercel Edge, Cloudflare Workers, Bun, Deno
- **MCP** spec version 2025-11-25
- **OpenAPI** 3.1
- **JSON Schema** 2020-12
- **llms.txt** per llmstxt.org
- **321 tests** passing across the monorepo at v0.7.0; v0.8.0 adds JWS signing tests

## Documentation

- **Repository:** [`DibbayajyotiRoy/AHTML`](https://github.com/DibbayajyotiRoy/AHTML)
- **Spec:** [`SPEC.md`](https://github.com/DibbayajyotiRoy/AHTML/blob/main/SPEC.md)
- **Recipes:** [`docs/recipes.md`](https://github.com/DibbayajyotiRoy/AHTML/blob/main/docs/recipes.md)
- **For AI assistants:** [`docs/agents.md`](https://github.com/DibbayajyotiRoy/AHTML/blob/main/docs/agents.md)
- **Comparison vs MCP / llms.txt / schema.org / OpenAPI:** [`docs/compare.md`](https://github.com/DibbayajyotiRoy/AHTML/blob/main/docs/compare.md)

## Search keywords / Related

People land here from queries like: how to add MCP to a Next.js app, how to expose my website as an MCP server, convert website to MCP server, generate llms.txt automatically from Next.js, MCP server for an existing site, AI-ready website, agent-readable HTML, machine-readable website, JSON-LD vs llms.txt vs MCP, best way to feed HTML to GPT, reduce tokens when scraping HTML for LLM, RAG pipeline for an entire website, how to cite a web page in a RAG answer, build AI agent that browses the web, agent HTTP fetching with cache, agent retry with backoff TypeScript, request coalescing fetch, typed errors for AI agent SDK, streaming snapshot to LLM, LLM context window optimizer, tokenizer for cost estimate (o200k_base), Next.js edge runtime MCP, well-known URL Next.js, signed snapshot for LLM, snapshot for LLM, RSS for AI agents.

Related projects and standards: Model Context Protocol, Anthropic MCP SDK, OpenAI MCP SDK, modelcontextprotocol typescript sdk, Claude Desktop MCP, Cursor MCP, FastMCP, mcp-framework, Smithery MCP, Vercel AI SDK, LangChain WebLoader, Cheerio loader, Jina Reader (r.jina.ai), Firecrawl, ScrapingBee, Crawlee, Apify, Browserless, Playwright scraper, Puppeteer scraper, Unstructured.io, Mozilla Readability, Trafilatura, Diffbot, Browserbase, spider-rs, Exa, Tavily, Perplexity API, ScrapeGraphAI, llms.txt (llmstxt.org), schema.org JSON-LD, OpenAPI 3.1.

## License

MIT — Dibbayajyoti Roy ([@DibbayajyotiRoy](https://github.com/DibbayajyotiRoy)).

---

### Suggested npm keywords for `packages/next/package.json`

Current (15): `ahtml, nextjs, next, plugin, agent, agent-web, ai, llm, mcp, model-context-protocol, llms-txt, openapi, json-ld, semantic-web, crawler`. Suggested replacement:

```json
{
  "keywords": [
    "ahtml", "nextjs", "next", "next-app-router", "plugin",
    "agent", "agent-web", "ai", "ai-agent", "llm",
    "mcp", "mcp-server", "model-context-protocol", "llms-txt",
    "openapi", "openapi-3-1", "json-ld", "schema-org", "semantic-web",
    "crawler", "rag", "edge-runtime", "cloudflare-workers", "vercel-edge",
    "well-known", "jws", "signed-snapshot", "streaming", "token-efficient"
  ]
}
```

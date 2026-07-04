# @ahtmljs/vite

One Vite plugin that turns any Vite, SvelteKit, SolidStart, Astro, or Remix-on-Vite site into a fully agent-readable, MCP-compatible endpoint — no rewrite, no separate server.

[![npm version](https://img.shields.io/npm/v/@ahtmljs/vite.svg)](https://www.npmjs.com/package/@ahtmljs/vite)
[![license MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/DibbayajyotiRoy/AHTML/blob/main/LICENSE)
[![MCP compatible](https://img.shields.io/badge/MCP-2025--11--25-2ea44f.svg)](https://modelcontextprotocol.io)
[![OpenAPI 3.1](https://img.shields.io/badge/OpenAPI-3.1-6BA539.svg)](https://spec.openapis.org/oas/v3.1.0)
[![provenance](https://img.shields.io/badge/npm-provenance-26a269.svg)](https://docs.npmjs.com/generating-provenance-statements)

```bash
npm install @ahtmljs/vite @ahtmljs/schema
```

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { ahtml } from '@ahtmljs/vite';
import { snapshot } from '@ahtmljs/schema';

export default defineConfig({
  plugins: [
    ahtml({
      site: 'https://shop.com',
      async buildSnapshot(segments, req) {
        return snapshot(req.url, 'home').add({ id: 'home', type: 'page', name: 'Shop' }).build();
      },
    }),
  ],
});
```

## What this plugin does

Adds four endpoints to your Vite dev server and your built/SSR site:

- `/ahtml/<path>` — token-optimal AHTML snapshot (compact text, canonical JSON, NDJSON stream, or diff)
- `/.well-known/ahtml.json` — site manifest, used by AI agents to discover your routes
- `/llms.txt` — Jeremy Howard llms.txt convention shim, auto-generated from your routes
- `/ahtml/mcp.json` — Model Context Protocol tool manifest (MCP spec 2025-11-25)
- `/ahtml/openapi.json` — OpenAPI 3.1 description of the agent surface

A site running this plugin is simultaneously an MCP server, an OpenAPI service, a JSON-LD source, and an llms.txt-compatible site — all from one `buildSnapshot` function.

## How well does an AI read it?

20 hand-graded questions ("price?", "in stock?", "return window?", "SKU?", "auth required?") run against the same page in 4 formats, with real API calls to gpt-4o-mini, claude-haiku-4.5, gemini-2.5-flash, and llama-3.3-70b at temperature=0:

| Format you give the AI | Tokens used | Right answers |
|---|---:|---:|
| Plain HTML | 684 | 91% |
| llms.txt | 227 | 89% |
| **AHTML compact** | **338** | **95%** |
| **AHTML JSON** | **365** | **100%** |

AHTML JSON scored every answer right. AHTML compact used ~50% fewer tokens than raw HTML and was still more accurate.

<details>
<summary><sub><i>How we measured this</i></sub></summary>
<sub>

- Tokens counted with `gpt-tokenizer` (o200k_base) and `@anthropic-ai/tokenizer`, not `text.length/4`.
- Cost from real provider usage × public prices.
- Reproduce: `git clone https://github.com/DibbayajyotiRoy/AHTML && cp .env.example .env && bash scripts/run-llm-benchmark.sh`

[Full report](https://github.com/DibbayajyotiRoy/AHTML/blob/main/benchmark-results-llm.md) · [Source](https://github.com/DibbayajyotiRoy/AHTML/tree/main/examples/llm-benchmark)

</sub>
</details>

## Quickstart — full product page

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { ahtml } from '@ahtmljs/vite';
import { snapshot } from '@ahtmljs/schema';
import { db } from './src/lib/db';

export default defineConfig({
  plugins: [
    ahtml({
      site: 'https://shop.com',
      policy: { agents_welcome: true, license: 'MIT', rate_limit: '100/min' },
      routes: [
        { path: '/', page_type: 'home' },
        { path: '/products/mbp-14', page_type: 'product_detail' },
      ],
      async buildSnapshot(segments, req) {
        if (segments[0] === 'products' && segments[1]) {
          const p = await db.product(segments[1]);
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
      },
    }),
  ],
});
```

Then visit:

- `http://localhost:5173/ahtml/products/mbp-14` — compact text snapshot (default for LLMs)
- `http://localhost:5173/ahtml/products/mbp-14` with `Accept: application/ahtml+json` — canonical JSON, used for signing
- `http://localhost:5173/.well-known/ahtml.json` — site manifest
- `http://localhost:5173/llms.txt` — llms.txt convention shim
- `http://localhost:5173/ahtml/mcp.json` — MCP tool manifest
- `http://localhost:5173/ahtml/openapi.json` — OpenAPI 3.1 description

## Why this exists

Most "site to MCP server" tooling (Firecrawl, ScrapingBee, Crawlee, Apify, Browserless, Jina Reader, Playwright/Puppeteer scrapers, Diffbot, Trafilatura, readability.js) treats your site as adversarial — render it in a headless browser, then guess at the structure. That round-trip costs tokens and accuracy.

`@ahtmljs/vite` flips that. Your site already knows the price, the SKU, the return window, the auth requirement. This plugin lets you emit that as a typed snapshot from inside Vite, so any agent — Claude Desktop, Cursor, the Vercel AI SDK, LangChain, the Anthropic or OpenAI MCP SDK, fastmcp, smithery — gets the canonical data, not a re-parsed DOM.

Concrete wins:

- One source of truth: your `buildSnapshot` function. JSON-LD, MCP, OpenAPI, and llms.txt all derive from it.
- No headless browser: no Playwright, no Chromium, no scrape-and-pray.
- Token-efficient: AHTML compact uses ~50% fewer tokens than HTML on the benchmark page.
- Typed errors: 13 stable `AHTMLError` codes (see v0.6 changelog) so agents can branch on `SIGNATURE_INVALID` vs `RATE_LIMITED` vs `POLICY_DENIED` without string-matching.
- Edge-ready: no `node:*` imports. Runs on Cloudflare Workers, Vercel Edge, Bun, Deno.

## What works under each Vite framework

| Framework | Dev server | Build / SSR | Notes |
|---|---|---|---|
| Vanilla Vite | yes | yes | Static `buildSnapshot` results are emitted to `dist/ahtml/...` on `vite build` |
| SvelteKit | yes | yes | Works with `adapter-node`, `adapter-vercel`, `adapter-cloudflare`, `adapter-static` |
| SolidStart | yes | yes | Works in both `node` and `cloudflare-workers` presets |
| Astro | yes | yes | Use as a Vite plugin via `astro.config.mjs` → `vite.plugins`. A dedicated `@ahtmljs/astro` integration is in development. |
| Remix on Vite | yes | yes | Drop into `vite.config.ts`, same as SvelteKit |
| Nuxt (Vite mode) | partial | partial | Works for dev + node build; a `@ahtmljs/nuxt` module is on the roadmap |

The `buildSnapshot` signature is byte-identical to `@ahtmljs/next/handler`, so you can swap frameworks without rewriting your snapshot logic.

## Configuration

| Field | Type | Default | Description |
|---|---|---|---|
| `site` | `string` | required | Canonical public site URL |
| `buildSnapshot` | `(segments, req) => Promise<Snapshot \| null>` | required | Returns a `Snapshot` for a given path, or `null` for 404 |
| `policy` | `Policy` | `{ agents_welcome: true }` | Site-level rules — license, rate_limit, contact, etc. |
| `default_ttl` | `number` | `60` | Default TTL in seconds |
| `routes` | `Array<{path, page_type}>` | `[]` | Routes advertised in `/.well-known/ahtml.json` |
| `llms_contact` | `string` | `policy.contact` | Email shown in `/llms.txt` |
| `emit_mcp` | `boolean` | `true` | Auto-emit `/ahtml/mcp.json` |
| `emit_openapi` | `boolean` | `true` | Auto-emit `/ahtml/openapi.json` |
| `cache` | `CacheStore<Snapshot>` | in-memory | Pluggable cache — pass a KV store for edge (v0.7+) |
| `compress` | `'auto' \| 'gzip' \| 'br' \| 'none'` | `'auto'` | Negotiate gzip/br from `Accept-Encoding` (v0.7+) |
| `signingKey` | `CryptoKey` | none | If set, snapshots are signed with detached JWS via Web Crypto (v0.8+) |

## Signing snapshots (v0.8)

```ts
import { ahtml } from '@ahtmljs/vite';
import { generateSigningKey } from '@ahtmljs/schema';

const key = await generateSigningKey(); // EdDSA via Web Crypto

ahtml({
  site: 'https://shop.com',
  signingKey: key,
  async buildSnapshot(segments, req) { /* ... */ },
});
```

The response includes a detached JWS in the `X-AHTML-Signature` header. Clients verify with `verifySnapshot(snap, sig, { trustedKeys })` from `@ahtmljs/schema`. Wrong key, tampered body, or stale snapshot → typed `AHTMLError` with code `SIGNATURE_INVALID`.

## v0.8 — emitter consolidation

In v0.8 the well-known, MCP, OpenAPI, and llms.txt emitters were extracted from `@ahtmljs/next` into `@ahtmljs/schema/emit/*` and are now re-exported by every adapter. `@ahtmljs/vite` is a thin wrapper around those shared emitters — the wire output is byte-identical between `@ahtmljs/next` and `@ahtmljs/vite` for the same `Snapshot`.

If you imported emitters directly from `@ahtmljs/next` in a custom Vite middleware, update to:

```ts
import { emitWellKnown } from '@ahtmljs/schema/emit/well-known';
import { emitMcp } from '@ahtmljs/schema/emit/mcp';
import { emitOpenApi } from '@ahtmljs/schema/emit/openapi';
import { emitLlmsTxt } from '@ahtmljs/schema/emit/llms-txt';
```

The re-exports from `@ahtmljs/vite` continue to work unchanged.

## Compatibility

- Vite **5+** (peer dependency, marked optional so it works inside framework starters that own the Vite version)
- Node **20+** (ESM-only)
- MCP spec **2025-11-25**, OpenAPI **3.1**, JSON Schema **2020-12**, llms.txt
- 321 tests passing across the monorepo at v0.7.0; v0.8.0 adds JWS signing tests

For Next.js (App Router and Pages Router), use [`@ahtmljs/next`](https://www.npmjs.com/package/@ahtmljs/next) instead — same `buildSnapshot` contract.

## Search keywords / Related

People landing on this page typically search for one of these. If you searched for any of them, this plugin is what you want.

- vite mcp plugin, sveltekit mcp, solidstart mcp, astro mcp plugin, remix mcp vite, nuxt mcp
- vite plugin llms.txt, vite plugin json-ld, vite middleware ahtml, vite well-known endpoint
- sveltekit ai agent, astro ai agent integration, vite 5 plugin ai, vite plugin openapi
- how to add mcp to a sveltekit app, how to make my vite site readable by ai agents
- how to expose my website as an mcp server, convert website to mcp server
- generate llms.txt automatically from sveltekit, json-ld vs llms.txt vs mcp
- best way to feed html to gpt, reduce tokens when scraping html for llm
- rag pipeline for an entire website, how to cite a web page in a rag answer
- build ai agent that browses the web, agent http fetching with cache
- agent retry with backoff typescript, request coalescing fetch
- typed errors for ai agent sdk, streaming snapshot to llm
- llm context window optimizer, tokenizer for cost estimate o200k_base
- alternative to firecrawl for sveltekit, alternative to jina reader for own site
- alternative to crawlee for ai agents, structured data for llms instead of scraping
- machine-readable website, agent-readable html, ai-ready website, agent web
- model context protocol typescript, fastmcp alternative, smithery mcp alternative
- claude desktop mcp from website, cursor mcp from website, anthropic mcp sdk integration
- vercel ai sdk webloader replacement, langchain webloader replacement, cheerio loader replacement
- readability.js alternative for llms, trafilatura alternative, diffbot alternative
- browserbase alternative, spider rs alternative, exa search alternative, tavily alternative
- perplexity api alternative, scrapegraph ai alternative, unstructured.io alternative

## License

MIT — Dibbayajyoti Roy. See the main [AHTML repository](https://github.com/DibbayajyotiRoy/AHTML#readme) for full docs, the typed error taxonomy, and the wire format spec.

---

### Suggested npm keywords

Current keywords in `package.json`: `ahtml`, `vite`, `plugin`, `agent`, `agent-web`, `ai`, `llm`, `mcp`, `model-context-protocol`, `llms-txt`, `openapi`, `json-ld`, `semantic-web`, `sveltekit`, `solidstart`, `astro`.

Proposed additions for v0.8 (paste into `package.json`):

```json
{
  "keywords": [
    "ahtml",
    "vite",
    "vite-plugin",
    "plugin",
    "agent",
    "agent-web",
    "agent-readable-html",
    "ai",
    "ai-agent",
    "llm",
    "mcp",
    "mcp-server",
    "model-context-protocol",
    "llms-txt",
    "openapi",
    "openapi-3-1",
    "json-ld",
    "schema-org",
    "semantic-web",
    "structured-data",
    "well-known",
    "sveltekit",
    "solidstart",
    "astro",
    "remix",
    "nuxt",
    "edge",
    "cloudflare-workers",
    "vercel-edge",
    "bun",
    "deno",
    "jws",
    "signed-snapshot",
    "token-efficient",
    "rag",
    "scraper-alternative",
    "firecrawl-alternative",
    "jina-reader-alternative"
  ]
}
```

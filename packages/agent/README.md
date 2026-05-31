# @ahtmljs/agent

Typed HTTP client for AI agents that fetch AHTML-emitting sites — ETag cache, request coalescing, typed errors, retry with backoff, streaming snapshots, dry-run actions, and real tokenizer measurement.

[![npm version](https://img.shields.io/npm/v/@ahtmljs/agent.svg)](https://www.npmjs.com/package/@ahtmljs/agent)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/DibbayajyotiRoy/AHTML/blob/main/LICENSE)
[![MCP compatible](https://img.shields.io/badge/MCP-2025--11--25-purple.svg)](https://modelcontextprotocol.io)
[![OpenAPI 3.1](https://img.shields.io/badge/OpenAPI-3.1-green.svg)](https://spec.openapis.org/oas/v3.1.0)
[![provenance](https://img.shields.io/badge/npm-provenance-success.svg)](https://docs.npmjs.com/generating-provenance-statements)

```bash
npm install @ahtmljs/agent @ahtmljs/schema
# optional tokenizer peers
npm install gpt-tokenizer @anthropic-ai/tokenizer
```

```ts
import { AHTMLClient } from '@ahtmljs/agent';

const client = new AHTMLClient({ agent: 'MyAgent/1.0' });
const snap = await client.fetch('https://shop.example.com/ahtml/products/mbp-14');

console.log(snap.entities[0]);   // typed Product
console.log(snap.actions);       // typed action contracts
```

## How well does an AI read it?

We asked an AI **20 questions** about the same page in 4 formats:

| Format you give the AI | Tokens used | Right answers |
|---|---:|---:|
| Plain HTML | 684 | 91% |
| llms.txt | 227 | 89% |
| **AHTML compact** | **338** | **95%** |
| **AHTML JSON** | **365** | **100%** |

> AHTML JSON: every answer right. AHTML compact: ~50% fewer tokens than HTML — and still more accurate.

<details>
<summary><sub><i>How we measured this — open for details</i></sub></summary>
<sub>

- Real API calls to **gpt-4o-mini, claude-haiku-4.5, gemini-2.5-flash, llama-3.3-70b** at temperature=0.
- 20 hand-graded questions an AI agent actually wants to know: *price, in stock?, SKU, return window, confirmation needed?, author, publication date,* etc.
- Tokens counted with the official OpenAI + Anthropic tokenizers. No `text.length/4` guessing.
- Reproduce: `git clone https://github.com/DibbayajyotiRoy/AHTML && cp .env.example .env && bash scripts/run-llm-benchmark.sh`

[Full report](https://github.com/DibbayajyotiRoy/AHTML/blob/main/benchmark-results-llm.md) · [Source](https://github.com/DibbayajyotiRoy/AHTML/tree/main/examples/llm-benchmark)

</sub>
</details>

## Why this over rolling your own fetch loop

Most agent codebases reinvent the same primitives badly: fetch + a `Map` cache + a `setTimeout` retry + four `console.log`s. This package ships them once, correctly, against a typed snapshot wire format.

- **ETag caching** by URL. Second fetch sends `If-None-Match` automatically; on `304` the cached `Snapshot` is reused without re-parsing.
- **Diff path** — when the server publishes `?since=<etag>`, the client transparently fetches `application/ahtml-diff+json` and reconstructs the snapshot via `applyDiff`.
- **In-flight coalescing** — 50 parallel `client.fetch(url)` calls become one HTTP request and one parse.
- **Typed errors** — 13 stable `AHTMLError` codes with `hint`, `retryable`, `status`, and `retryAfterMs`. Branch on the code, never on the message.
- **Retry with backoff** — exponential, jittered, honoring `Retry-After` on `429`. Retries `NETWORK / TIMEOUT / RATE_LIMITED / 5xx HTTP_STATUS` by default.
- **Timeout** — `AbortController`-based per-request timeout (default 30s).
- **Streaming** — `streamSnapshot()` / `streamEntities()` / `streamActions()` return `AsyncIterable` over the NDJSON wire. Peak memory stays bounded by the per-entity working set.
- **Pluggable cache** — `CacheStore<CachedSnapshot>` swaps the default in-memory LRU for Redis, Upstash, Cloudflare KV, or your own.
- **Dry-run actions** — `runAction` hits `action.preview_url` first and refuses to commit when `confirmation: 'required'` without an explicit `confirm: true`.
- **Real tokenizers** — wraps `gpt-tokenizer` (OpenAI `o200k_base` / `cl100k_base`) and `@anthropic-ai/tokenizer` (Claude). No `text.length / 4`.

## Fetching a snapshot

```ts
const client = new AHTMLClient({
  agent: 'MyAgent/1.0',
  timeout: 15_000,
  retry: { attempts: 4, baseDelayMs: 200 },
  onEvent: (e) => myLogger.info(e),
});

// Default Accept is `application/ahtml+text` (compact, token-optimal).
const snap = await client.fetch('https://shop.example.com/ahtml/products/mbp-14');

// Canonical JSON (slightly larger, fully typed, used for signing).
const json = await client.fetch(url, { format: 'json' });
```

Subsequent fetches send `If-None-Match: <etag>` automatically. If the server has a `?since=<etag>` diff endpoint, the client uses it transparently — same shape on return, far less wire.

## Streaming snapshots (v0.7)

```ts
// Process entities as they arrive — never holds the full snapshot in memory.
for await (const entity of client.streamEntities('https://news.example.com/ahtml/feed')) {
  await indexer.upsert(entity);
}

// Or the full record stream (envelope, entities, actions, end).
for await (const rec of client.streamSnapshot(url)) {
  if (rec.kind === 'end') console.log('etag:', rec.etag);
}
```

Requires the server to advertise `application/ahtml+json-seq`. `@ahtmljs/next` enables it with `routeOpts.stream = true`.

## Typed errors (v0.6)

```ts
import { AHTMLError } from '@ahtmljs/agent';

try {
  await client.fetch(url);
} catch (err) {
  if (AHTMLError.is(err)) {
    switch (err.code) {
      case 'AUTH_REQUIRED':   return promptForBearer();
      case 'RATE_LIMITED':    return sleep(err.retryAfterMs ?? 60_000);
      case 'POLICY_DENIED':   return abortAndLog(err.hint);
      case 'CACHE_POISONED':  return reportServerBug(err.path, err.cause);
      case 'TIMEOUT':         return fallbackProvider();
      // SCHEMA_INVALID, DIFF_INVALID, COMPACT_PARSE, JSON_PARSE,
      // ETAG_MISMATCH, NETWORK, HTTP_STATUS, SIGNATURE_INVALID
    }
  }
  throw err;
}
```

Every code carries a `hint` string written for the agent author, not the end user.

## Retry, timeout, coalescing, stale-while-error

```ts
const client = new AHTMLClient({
  retry: {
    attempts: 5,
    baseDelayMs: 250,
    maxDelayMs: 10_000,
    respectRetryAfter: true,
    jitter: true,
    on: ['NETWORK', 'TIMEOUT', 'RATE_LIMITED', 'HTTP_STATUS'],
  },
  timeout: 20_000,
});

// 100 parallel fetches → 1 network request, 1 parse, 100 resolved promises.
await Promise.all(Array.from({ length: 100 }, () => client.fetch(url)));

// Survive origin outages by serving the last good snapshot.
await client.fetch(url, { allowStale: true });
```

Disable per-call with `{ retry: false }` or `{ coalesce: false }`.

## Running an action safely

```ts
import { runAction } from '@ahtmljs/agent';

const action = snap.actions.find((a) => a.id === 'purchase')!;

// 1. Dry-run — hits action.preview_url, returns intended changes.
const preview = await runAction(snap, action, { sku: 'MBP14', quantity: 1 }, {
  dryRun: true,
});
// → { status: 'dry_run',
//      would_charge: { amount: 1999, currency: 'USD' },
//      would_side_effects: ['charge_card', 'email_buyer', 'decrement_stock'] }

// 2. Commit, with explicit confirmation if the contract requires it.
const result = await runAction(snap, action, { sku: 'MBP14', quantity: 1 }, {
  confirm: true,                 // required because action.confirmation === 'required'
  bearer: process.env.OAUTH!,    // required because action.auth === 'required'
});
// → { status: 'executed', output: Receipt, http_status: 200 }
```

`runAction` refuses to fire an action whose `confirmation: 'required'` unless `{ confirm: true }` is passed — a built-in safety gate for hostile-agent regressions.

## Pluggable cache (v0.7)

```ts
import { AHTMLClient, type CachedSnapshot } from '@ahtmljs/agent';
import type { CacheStore } from '@ahtmljs/schema';
import { createClient } from 'redis';

const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();

const redisStore: CacheStore<CachedSnapshot> = {
  async get(k)    { const v = await redis.get(k); return v ? JSON.parse(v) : undefined; },
  async set(k, v) { await redis.set(k, JSON.stringify(v), { EX: 3600 }); },
  async delete(k) { await redis.del(k); },
  async clear()   { /* prefix-scan in production */ },
};

const client = new AHTMLClient({ cache: redisStore });
```

Adapters for Upstash and Cloudflare KV ship in `@ahtmljs/kv/upstash` and `@ahtmljs/kv/cloudflare`. The default is a bounded in-memory LRU (1000 entries).

## Verifying signed snapshots (v0.8)

`0.8.0` adds detached JWS signatures over the canonical JSON form, verified with Web Crypto:

```ts
import { verifySnapshot } from '@ahtmljs/schema';

const snap = await client.fetch(url, { format: 'json' });
const sig  = await fetch(url + '.sig').then((r) => r.text());

const ok = await verifySnapshot(snap, sig, {
  trustedKeys: [{ kid: 'shop-2026-q2', publicKeyJwk: PUBKEY_JWK }],
});
if (!ok) throw new Error('SIGNATURE_INVALID');
```

No `node:*` imports — runs on Cloudflare Workers, Vercel Edge, Bun, and Deno.

## Measuring token cost

```ts
import { countTokensGpt, countTokensClaude, measure } from '@ahtmljs/agent';

await countTokensGpt(text, 'o200k_base');   // OpenAI tiktoken (GPT-4o, o-series)
await countTokensGpt(text, 'cl100k_base');  // OpenAI tiktoken (GPT-4, 3.5)
await countTokensClaude(text);              // Anthropic official Claude tokenizer

await measure(text);
// → { bytes, bytes_gzip, tokens_openai_cl100k, tokens_openai_o200k, tokens_anthropic }
```

These wrap the **actual tokenizers** OpenAI and Anthropic use internally. Use it to gate context-window budgets, pick between providers, or report cost-per-request in your agent's traces.

## Observability

```ts
new AHTMLClient({
  onEvent: (e) => {
    // request | cache_hit | cache_miss | diff_applied | coalesced | retry | error
    metrics.counter(`ahtml.${e.type}`).inc({ url: e.url });
  },
});
```

Library code never calls `console.log`. The hook is wrapped in `try/catch` so a buggy logger can never break the fetch path.

## Runtime support

Node 20+, Bun, Deno, Cloudflare Workers, Vercel Edge. ESM-only. Zero `node:*` imports in the core path — only the optional `measure()` gzip step uses `node:zlib` and silently skips when absent.

## Where this sits

`@ahtmljs/agent` is the client half of [AHTML](https://github.com/DibbayajyotiRoy/AHTML) — a small standard that turns any website into an MCP server, an OpenAPI 3.1 provider, a JSON-LD source, an `llms.txt` publisher, and a token-optimal semantic snapshot endpoint from one Next.js or Vite plugin. If you currently use `cheerio` + `readability` + a homegrown crawler to feed pages to GPT or Claude, this replaces all of it — and the site you're crawling only had to publish AHTML once.

## Search keywords / Related

People search for things like:

- ahtml client, ahtml fetcher, ai agent http client typescript
- how to add mcp to a nextjs app, how to make my site readable by ai agents, how to expose my website as an mcp server, convert website to mcp server
- generate llms.txt automatically from nextjs, json-ld vs llms.txt vs mcp, best way to feed html to gpt, reduce tokens when scraping html for llm, rag pipeline for an entire website, how to cite a web page in a rag answer
- etag caching fetcher, retry with backoff sdk, request coalescing typescript, typed ahtml error, ahtml streaming snapshots, ahtml on event hook, dry run action client
- tokenizer adapter openai anthropic, tiktoken o200k_base node, agent token cost meter, llm context window optimizer, ai sdk safety gate, hostile agent regression suite

Often considered alongside: firecrawl, scrapingbee, crawlee, apify, browserless, playwright scraper, puppeteer scraper, jina reader / r.jina.ai, schema.org, json-ld, llms.txt / llmstxt.org, anthropic mcp sdk, openai mcp sdk, cursor mcp, modelcontextprotocol typescript sdk, claude desktop mcp, fastmcp, mcp-framework, smithery mcp, vercel ai sdk, langchain webloader, cheerio loader, unstructured.io, readability.js, mozilla readability, trafilatura, diffbot, browserbase, spider rs, exa search, tavily, perplexity api, scrapegraph ai.

## Documentation

- **Repository:** [`DibbayajyotiRoy/AHTML`](https://github.com/DibbayajyotiRoy/AHTML)
- **Spec:** [`SPEC.md`](https://github.com/DibbayajyotiRoy/AHTML/blob/main/SPEC.md)
- **For AI assistants:** [`docs/agents.md`](https://github.com/DibbayajyotiRoy/AHTML/blob/main/docs/agents.md)
- **Recipes (dry-run, diff crawling, streaming, signed snapshots):** [`docs/recipes.md`](https://github.com/DibbayajyotiRoy/AHTML/blob/main/docs/recipes.md)

## License

MIT (c) Dibbayajyoti Roy

---

### npm keywords — paste into `packages/agent/package.json`

Current `keywords`: `ahtml`, `agent`, `agent-web`, `ai`, `llm`, `client`, `sdk`, `tokenizer`, `tiktoken`, `mcp`, `model-context-protocol`, `crawler`.

Proposed expansion:

```json
{
  "keywords": [
    "ahtml", "agent", "agent-web", "ai", "ai-agent", "llm",
    "client", "sdk", "fetch", "http-client",
    "etag-cache", "request-coalescing", "retry-backoff",
    "streaming", "ndjson", "typed-errors",
    "tokenizer", "tiktoken", "o200k-base", "cl100k-base",
    "anthropic-tokenizer", "claude-tokenizer",
    "mcp", "mcp-client", "model-context-protocol",
    "openapi", "json-ld", "llms-txt",
    "crawler", "scraper", "rag",
    "agent-readable-html", "ai-ready-website",
    "edge-runtime", "cloudflare-workers", "vercel-edge", "bun", "deno"
  ]
}
```

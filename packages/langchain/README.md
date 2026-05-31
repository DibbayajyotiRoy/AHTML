# @ahtmljs/langchain

> Deterministic, chunk-preserving ingestion of any AHTML-emitting site into a vector DB — a LangChain.js document loader for [AHTML](https://github.com/DibbayajyotiRoy/AHTML).

[![npm version](https://img.shields.io/npm/v/@ahtmljs/langchain.svg)](https://www.npmjs.com/package/@ahtmljs/langchain)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![MCP compatible](https://img.shields.io/badge/MCP-2025--11--25-blue.svg)](https://modelcontextprotocol.io)
[![OpenAPI 3.1](https://img.shields.io/badge/OpenAPI-3.1-6BA539.svg)](https://spec.openapis.org/oas/v3.1.0)
[![Provenance](https://img.shields.io/badge/npm-provenance-success)](https://docs.npmjs.com/generating-provenance-statements)

Pulls any AHTML route into your RAG pipeline as LangChain `Document`s with **byte-range chunks, citation anchors, parent links, ETags, and license metadata** preserved end-to-end. No DOM scraping, no Cheerio heuristics, no Playwright headless overhead.

```bash
npm install @ahtmljs/langchain @ahtmljs/agent @ahtmljs/schema @langchain/core
```

```ts
import { AHTMLLoader } from '@ahtmljs/langchain';
import { Chroma } from '@langchain/community/vectorstores/chroma';
import { OpenAIEmbeddings } from '@langchain/openai';

const loader = new AHTMLLoader('https://docs.acmecloud.com');
const docs = await loader.load();

await Chroma.fromDocuments(docs, new OpenAIEmbeddings(), {
  collectionName: 'acmecloud-docs',
});
```

That single `.load()` call walks the site's typed snapshot, splits each long-form `document` entity into its publisher-defined chunks, and hands LangChain a flat array of `Document`s where every record knows its `entity_id`, `chunk_anchor`, and `byte_range`.

## Why a LangChain JS URL loader for AHTML, not another web loader

LangChain ships several HTML loaders — `CheerioWebBaseLoader`, `PlaywrightWebBaseLoader`, `RecursiveUrlLoader`. They all do the same thing: fetch HTML, walk DOM, run a text-splitter, hope the chunks make sense. That works until:

- the page is a SPA and the text never reaches the DOM,
- a redesign breaks every CSS selector you keyed against,
- you can't cite an answer because chunk boundaries don't map to anchors,
- you re-embed the whole site on every refresh because there's no ETag,
- you're spending tokens on `<nav>`, cookie banners, and footer noise.

AHTML solves this at the source: the site itself publishes a typed, content-addressed snapshot at `/.well-known/ahtml.json`. The loader is then a thin mapping, not a scraper.

| | `CheerioWebBaseLoader` / `RecursiveUrlLoader` | `AHTMLLoader` |
|---|---|---|
| Source format | DOM scrape | typed semantic snapshot |
| Tokens to embed | full HTML + nav + footer | only the agent-readable content |
| Chunk boundaries | `RecursiveCharacterTextSplitter` heuristics | publisher-defined, byte-addressed |
| Citation | brittle CSS selectors / line numbers | first-class `chunk_anchor` |
| Cache invalidation | crawl every time | `etag` + content-addressed `entity_id` |
| Auth | manual cookies / headers | `bearer` honors AHTML `auth: required` |
| JS-rendered SPAs | needs Playwright | works (server emits the snapshot) |
| Stability across redesigns | breaks on DOM churn | snapshot schema is the contract |

For the RAG-vs-Firecrawl / RAG-vs-Jina-Reader question: those tools are general-purpose "give me the readable text of any URL." AHTML is the opposite — the **publisher** opts in, so you get the schema contract, not a best-effort extraction.

## How well does an LLM actually read it

Same page, four serialization formats, 20 hand-graded retrieval questions across `gpt-4o-mini`, `claude-haiku-4.5`, `gemini-2.5-flash`, `llama-3.3-70b` at temperature=0:

| Format you give the model | Tokens used | Right answers |
|---|---:|---:|
| Plain HTML | 684 | 91% |
| llms.txt | 227 | 89% |
| **AHTML compact** | **338** | **95%** |
| **AHTML JSON** | **365** | **100%** |

AHTML compact: ~50% fewer tokens than HTML, higher accuracy. AHTML JSON: every answer correct. Tokens counted with the official `gpt-tokenizer` and `@anthropic-ai/tokenizer` — no `text.length/4` guessing. [Full report](https://github.com/DibbayajyotiRoy/AHTML/blob/main/benchmark-results-llm.md).

## Building a citation-grounded RAG pipeline

The whole point of preserving `chunk_anchor` and `byte_range` is so your answer can cite a URL fragment that actually resolves in the user's browser.

```ts
import { AHTMLLoader } from '@ahtmljs/langchain';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { OpenAIEmbeddings, ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';

// 1. Ingest. One call, every entity, every chunk.
const docs = await new AHTMLLoader([
  'https://docs.acmecloud.com',
  'https://docs.acmecloud.com/api/auth',
  'https://docs.acmecloud.com/api/billing',
]).load();

const store = await MemoryVectorStore.fromDocuments(docs, new OpenAIEmbeddings());

// 2. Retrieve.
const retriever = store.asRetriever({ k: 4 });

// 3. Cite. The metadata is already there — just project it.
const prompt = ChatPromptTemplate.fromTemplate(`
Answer using only the sources below. After each claim, cite as [source].

{context}

Question: {question}
`);

const format = (hits) =>
  hits.map((d) =>
    `[${d.metadata.source}${d.metadata.chunk_anchor ?? ''}] ${d.pageContent}`
  ).join('\n\n');

const chain = prompt.pipe(new ChatOpenAI({ model: 'gpt-4o-mini' })).pipe(new StringOutputParser());

const answer = await chain.invoke({
  context: format(await retriever.invoke('how do bearer tokens expire?')),
  question: 'how do bearer tokens expire?',
});
```

The retrieved citation looks like `https://docs.acmecloud.com/api/auth#bearer-tokens` — a real link, not a paragraph index.

## API

### `new AHTMLLoader(url | url[], options?)`

```ts
interface AHTMLLoaderOptions {
  fetch?: typeof fetch;       // custom fetch (proxy, test double)
  agent?: string;             // User-Agent string for the AHTML server's analytics
  bearer?: string;            // for entities marked auth: required
  includeParent?: boolean;    // emit a parent record alongside chunks (default: true)
  filterType?: 'product' | 'document' | 'task' | 'profile' | 'dataset' | 'conversation';
}
```

### `.load(): Promise<LangChainDocument[]>`

Fetches each URL, walks every entity in the snapshot, returns a flat array of `Document`s.

For each `document` entity with `chunks`:
- one parent record (full content + document-level metadata),
- one record per chunk with `pageContent` sliced from the parent's `byte_range`, plus `chunk_id`, `chunk_anchor`, `chunk_prev`, `chunk_next`, and the original `tokens` / `embed_hint`.

For `product` / `task` / `profile` / `dataset` / `conversation` entities, one record per entity with a flat text projection in `pageContent` and the structured fields in `metadata`.

## Metadata schema on every Document

| Field | Source | Use |
|---|---|---|
| `source` | snapshot URL | display + citation |
| `entity_id` | content-addressed id | dedupe across re-ingestions |
| `entity_type` | `product` / `document` / `task` / `profile` / `dataset` / `conversation` | filtered retrieval |
| `page_type` | snapshot's `page_type` | route-aware ranking |
| `fetched_at`, `etag` | snapshot envelope | incremental re-embedding |
| `license` | `snapshot.policy.license` | legal pipelines, opt-in corpora |
| `title`, `author`, `published_at`, `language`, `tags`, `canonical_url`, `word_count` | document entities | filters + citation |
| `chunk_id`, `chunk_anchor`, `chunk_prev`, `chunk_next`, `byte_range`, `tokens`, `embed_hint` | document `chunks[]` | citation + chunk-graph traversal |

## Incremental re-ingestion with ETags

Re-embed only what changed:

```ts
import { AHTMLLoader } from '@ahtmljs/langchain';

const known = new Map<string, string>(); // entity_id -> etag, loaded from your store

const docs = await new AHTMLLoader('https://docs.acmecloud.com').load();
const fresh = docs.filter((d) => {
  const id = d.metadata.entity_id as string;
  const etag = d.metadata.etag as string;
  if (known.get(id) === etag) return false;
  known.set(id, etag);
  return true;
});

await vectorStore.addDocuments(fresh);
```

For full diff-based delta sync at the wire level, point your client at the snapshot's `application/ahtml-diff+json` endpoint — see [`@ahtmljs/agent`](https://www.npmjs.com/package/@ahtmljs/agent).

## Auth-gated content

```ts
const loader = new AHTMLLoader('https://internal.acme.com/runbooks', {
  bearer: process.env.ACME_TOKEN,
  agent: 'acme-rag/1.0',
});
```

Entities marked `auth: required` are served only when the bearer is valid; otherwise the loader skips them rather than embedding a 401 body.

## Runtime support

ESM-only, Node 20+. The underlying `@ahtmljs/agent` client has zero `node:*` imports, so the loader runs in Cloudflare Workers, Vercel Edge, Bun, and Deno too — useful for serverless ingestion jobs and edge RAG.

## Compatibility

- `@langchain/core` >= 0.3 (peer dependency, optional — falls back to a structural `LangChainDocument` if not installed)
- MCP spec 2025-11-25
- OpenAPI 3.1, JSON Schema 2020-12
- `llms.txt` convention

## Search keywords / Related

People searching for these land here:

- langchain js document loader url, langchain ahtml loader, ahtml langchain
- langchain web loader with citations, langchain rag from website
- langchain document chunks metadata, langchain js url to embeddings
- langchain web scraper alternative, rag pipeline langchain url loader
- langchain core 0.3 loader, preserve citation anchors langchain, byte range chunks langchain
- how to cite a web page in a rag answer, rag pipeline for an entire website
- best way to feed html to gpt, reduce tokens when scraping html for llm
- agent http fetching with cache, agent retry with backoff typescript, request coalescing fetch
- typed errors for ai agent sdk, streaming snapshot to llm, llm context window optimizer
- snapshot for llm, token-efficient html, machine-readable website, agent-readable html
- json-ld vs llms.txt vs mcp, json-ld for ai, structured data for llms, llms.txt generator
- how to add mcp to a nextjs app, convert website to mcp server, site to mcp server
- alternatives to firecrawl, scrapingbee, crawlee, apify, browserless, jina reader, r.jina.ai
- alternatives to readability.js, trafilatura, diffbot, unstructured.io, browserbase, spider-rs
- alternatives to playwright scraper, puppeteer scraper, cheerio loader, scrapegraph ai
- exa search, tavily, perplexity api integration with langchain

## License

MIT. Author: **Dibbayajyoti Roy** ([github.com/DibbayajyotiRoy](https://github.com/DibbayajyotiRoy)). See the main [AHTML repository](https://github.com/DibbayajyotiRoy/AHTML#readme) for the full project.

---

### npm keywords (suggested for `package.json`)

Current keywords in `package.json`: `ahtml`, `langchain`, `langchain-loader`, `document-loader`, `rag`, `agent`, `agent-web`, `ai`, `llm`, `vector-db`, `embeddings`.

Proposed extended set — paste into `keywords` to maximize npm/GitHub discoverability:

```json
"keywords": [
  "ahtml",
  "langchain",
  "langchain-js",
  "langchain-loader",
  "langchain-document-loader",
  "langchain-web-loader",
  "document-loader",
  "url-loader",
  "web-loader",
  "rag",
  "rag-pipeline",
  "retrieval-augmented-generation",
  "citation",
  "citations",
  "chunking",
  "byte-range",
  "vector-db",
  "vector-store",
  "embeddings",
  "agent",
  "agent-web",
  "ai-agent",
  "ai",
  "llm",
  "llms-txt",
  "mcp",
  "model-context-protocol",
  "openapi",
  "json-ld",
  "structured-data",
  "machine-readable",
  "scraping-alternative",
  "firecrawl-alternative",
  "jina-reader-alternative",
  "cheerio-alternative",
  "playwright-alternative",
  "edge-runtime",
  "cloudflare-workers",
  "vercel-edge",
  "bun",
  "deno"
]
```

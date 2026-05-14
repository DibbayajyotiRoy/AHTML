# @ahtmljs/langchain

LangChain.js document loader for **[AHTML](https://github.com/DibbayajyotiRoy/AHTML)**.

Pull any AHTML-emitting site directly into your RAG pipeline. Returns
LangChain `Document`s with chunk boundaries, citation anchors, and
metadata preserved.

```bash
npm install @ahtmljs/langchain @ahtmljs/agent @ahtmljs/schema
```

## 📊 How well does an AI read it?

We asked an AI **20 questions** about the same page — given in 4 different formats:

| Format you give the AI | Tokens used | Right answers |
|---|---:|---:|
| Plain HTML | 684 | 91% |
| llms.txt | 227 | 89% |
| **AHTML compact** | **338** | **95%** |
| **AHTML JSON** | **365** | **100%** ✓ |

> **AHTML JSON: every answer right.** AHTML compact: ~50% fewer tokens than HTML — and still more accurate. RAG pipelines ingest snapshots straight via this loader.

<details>
<summary><sub><i>How we measured this — open for details</i></sub></summary>
<sub>

- Real API calls to **gpt-4o-mini, claude-haiku-4.5, gemini-2.5-flash, llama-3.3-70b** at temperature=0.
- 20 hand-graded questions an AI agent actually wants to know: *price, in stock?, SKU, return window, confirmation needed?, author, publication date,* etc.
- Tokens counted with the official OpenAI + Anthropic tokenizers (`gpt-tokenizer`, `@anthropic-ai/tokenizer`). No `text.length/4` guessing.
- Cost from real provider usage × public prices.
- Reproduce: `git clone https://github.com/DibbayajyotiRoy/AHTML && cp .env.example .env && bash scripts/run-llm-benchmark.sh`

[Full report](https://github.com/DibbayajyotiRoy/AHTML/blob/main/benchmark-results-llm.md) · [Source](https://github.com/DibbayajyotiRoy/AHTML/tree/main/examples/llm-benchmark)

</sub>
</details>

## Quickstart

```ts
import { AHTMLLoader } from '@ahtmljs/langchain';
import { Chroma } from '@langchain/community/vectorstores/chroma';
import { OpenAIEmbeddings } from '@langchain/openai';

const loader = new AHTMLLoader('https://docs.acmecloud.com');
const docs = await loader.load();

await Chroma.fromDocuments(docs, new OpenAIEmbeddings(), { collectionName: 'acmecloud-docs' });
```

That's it. The site's AHTML route serves typed entities; the loader maps
each one to a `LangChainDocument`. For long-form `document` entities,
each `chunks[]` entry becomes its own record with `chunk_anchor`
preserved for citation-grounded answers.

## Why this is better than HTML scraping loaders

| | HTML loader (`@langchain/community/document_loaders/web/html`) | `AHTMLLoader` |
|---|---|---|
| Source format | DOM scrape (Cheerio / Playwright) | typed semantic snapshot |
| Tokens to embed | full HTML noise | only the agent-readable content |
| Chunk boundaries | heuristic (paragraphs, separators) | publisher-defined, content-addressed |
| Citation anchors | brittle CSS selectors | first-class `chunk_anchor` |
| Stability | DOM churn breaks pipelines | etag-stable, content-addressed ids |
| Auth | manual cookies | passes `bearer` to AHTML's `auth: required` |

## API

### `new AHTMLLoader(url | url[], options?)`

```ts
interface AHTMLLoaderOptions {
  fetch?: typeof fetch;       // custom fetch (e.g. for testing or proxies)
  agent?: string;             // User-Agent string
  bearer?: string;            // for auth: required content
  includeParent?: boolean;    // include parent doc as a record (default: true)
  filterType?: 'product' | 'document' | 'task' | 'profile' | 'dataset' | 'conversation';
}
```

### `.load(): Promise<LangChainDocument[]>`

Fetches each URL, walks each entity, returns a flat array of `Document`s.

For `document` entities with `chunks`:
- Parent doc record (full content)
- One record per chunk with `pageContent` = the chunk's byte range and
  `metadata.chunk_anchor` for in-context citations

## Metadata preserved on every record

| Field | Source |
|---|---|
| `source` | snapshot URL |
| `entity_id` | the entity's stable id |
| `entity_type` | `product` / `document` / `task` / `profile` / `dataset` / `conversation` |
| `page_type` | snapshot's `page_type` |
| `fetched_at` | timestamp |
| `etag` | ETag for cache invalidation |
| `license` | `snapshot.policy.license` for legal pipelines |
| `title`, `author`, `published_at` (documents) | the typed fields |
| `chunk_id`, `chunk_anchor`, `byte_range` (chunks) | from `Document.chunks[]` |

## Citation example

A common RAG pattern: ground the answer in a source URL + anchor.

```ts
const docs = await new AHTMLLoader('https://docs.acmecloud.com/api/auth').load();
const chunk = docs.find((d) => d.metadata.chunk_anchor === '#bearer-tokens');

// In your prompt:
// "Source: {{source}}{{chunk_anchor}}\n{{pageContent}}"
// → "Source: https://docs.acmecloud.com/api/auth#bearer-tokens\n..."
```

## License

MIT. See the main [AHTML repository](https://github.com/DibbayajyotiRoy/AHTML#readme).

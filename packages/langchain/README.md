# @ahtmljs/langchain

LangChain.js document loader for **[AHTML](https://github.com/DibbayajyotiRoy/AHTML)**.

Pull any AHTML-emitting site directly into your RAG pipeline. Returns
LangChain `Document`s with chunk boundaries, citation anchors, and
metadata preserved.

```bash
npm install @ahtmljs/langchain @ahtmljs/agent @ahtmljs/schema
```

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

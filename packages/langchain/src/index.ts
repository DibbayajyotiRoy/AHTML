/**
 * @ahtmljs/langchain — LangChain.js document loader for AHTML.
 *
 * Fetch any AHTML-emitting site, get back LangChain-compatible `Document`s
 * with `Document.chunks` preserved as separate Document records (one per
 * chunk) — citation anchors, byte ranges, and parent links intact.
 *
 *   import { AHTMLLoader } from '@ahtmljs/langchain';
 *
 *   const loader = new AHTMLLoader('https://docs.acmecloud.com');
 *   const docs = await loader.load();
 *
 *   // Pipe to your vector DB:
 *   await vectorStore.addDocuments(docs);
 *
 * Why this exists: LangChain has plenty of HTML loaders, but they all
 * scrape DOM. With AHTML, the site emits the structured form directly —
 * the loader is ~30 lines and ingestion is deterministic.
 *
 * Compatible with both LangChain Document shape and a standalone shape
 * (when @langchain/core isn't installed, the loader returns plain
 * `LangChainDocument` objects with the same fields).
 */

import { AHTMLClient } from '@ahtmljs/agent';
import type { Snapshot, Document as AHTMLDocument, Chunk } from '@ahtmljs/schema';

/** Minimal Document shape compatible with @langchain/core's Document. */
export interface LangChainDocument {
  pageContent: string;
  metadata: Record<string, unknown>;
}

export interface AHTMLLoaderOptions {
  /** Custom fetch implementation (testing). */
  fetch?: typeof fetch;
  /** Identity header for the AHTML server's analytics. */
  agent?: string;
  /** Bearer token for auth-gated content. */
  bearer?: string;
  /** Include the parent Document (not just chunks) as a separate record. Default: true. */
  includeParent?: boolean;
  /** Filter to a specific entity type (default: all). */
  filterType?: 'product' | 'document' | 'task' | 'profile' | 'dataset' | 'conversation';
}

export class AHTMLLoader {
  private client: AHTMLClient;

  constructor(
    private urls: string | string[],
    private opts: AHTMLLoaderOptions = {},
  ) {
    this.client = new AHTMLClient({ fetch: opts.fetch, agent: opts.agent ?? 'AHTMLLoader/0.1' });
  }

  async load(): Promise<LangChainDocument[]> {
    const list = Array.isArray(this.urls) ? this.urls : [this.urls];
    const out: LangChainDocument[] = [];
    for (const url of list) {
      const snap = await this.client.fetch(url, { format: 'json', bearer: this.opts.bearer });
      for (const entity of snap.entities) {
        if (this.opts.filterType && entity.type !== this.opts.filterType) continue;
        out.push(...entityToDocuments(entity, snap, this.opts.includeParent ?? true));
      }
    }
    return out;
  }

  /** Variant: fetch one URL synchronously after the client has cached it. */
  async loadOne(url: string): Promise<LangChainDocument[]> {
    return new AHTMLLoader(url, this.opts).load();
  }
}

function entityToDocuments(entity: Snapshot['entities'][number], snap: Snapshot, includeParent: boolean): LangChainDocument[] {
  const baseMetadata: Record<string, unknown> = {
    source: snap.url,
    entity_id: entity.id,
    entity_type: entity.type,
    page_type: snap.page_type,
    fetched_at: snap.fetched_at,
    etag: snap.etag,
    license: snap.policy?.license,
  };

  // Documents: split into chunks if available; else one record with the full content.
  if (entity.type === 'document') {
    const doc = entity as AHTMLDocument;
    const records: LangChainDocument[] = [];
    if (includeParent) {
      records.push({
        pageContent: doc.content ?? doc.summary ?? doc.title,
        metadata: {
          ...baseMetadata,
          title: doc.title,
          author: doc.author,
          published_at: doc.published_at,
          modified_at: doc.modified_at,
          language: doc.language,
          tags: doc.tags,
          canonical_url: doc.canonical_url,
          word_count: doc.word_count,
        },
      });
    }
    if (doc.chunks && doc.content) {
      for (const chunk of doc.chunks) {
        records.push(chunkToDocument(chunk, doc, baseMetadata));
      }
    }
    return records;
  }

  // Other entities: one record per entity, content = a flattened text representation
  return [{
    pageContent: entityToText(entity),
    metadata: { ...baseMetadata, ...entityMetadata(entity) },
  }];
}

function chunkToDocument(chunk: Chunk, doc: AHTMLDocument, baseMetadata: Record<string, unknown>): LangChainDocument {
  const [start, end] = chunk.byte_range;
  const pageContent = (doc.content ?? '').slice(start, end);
  return {
    pageContent,
    metadata: {
      ...baseMetadata,
      chunk_id: chunk.id,
      chunk_parent: chunk.parent,
      chunk_heading: chunk.heading,
      chunk_anchor: chunk.anchor,
      chunk_prev: chunk.prev,
      chunk_next: chunk.next,
      byte_range: chunk.byte_range,
      tokens: chunk.tokens,
      embed_hint: chunk.embed_hint,
      title: doc.title,
      author: doc.author,
      canonical_url: doc.canonical_url,
    },
  };
}

function entityToText(entity: Snapshot['entities'][number]): string {
  switch (entity.type) {
    case 'product':
      return [
        entity.name,
        entity.brand ? `Brand: ${entity.brand}` : '',
        entity.description ?? '',
        entity.price ? `Price: ${entity.price.amount} ${entity.price.currency}` : '',
        entity.stock ? `Stock: ${entity.stock.status}` : '',
      ].filter(Boolean).join('\n');
    case 'task':
      return `${entity.title}${entity.description ? '\n' + entity.description : ''}`;
    case 'profile':
      return `${entity.name}${entity.bio ? '\n' + entity.bio : ''}`;
    case 'dataset':
      return `${entity.name}${entity.description ? '\n' + entity.description : ''}`;
    case 'conversation':
      return entity.messages.map((m) => `[${m.author}] ${m.content}`).join('\n');
    default:
      return JSON.stringify(entity);
  }
}

function entityMetadata(entity: Snapshot['entities'][number]): Record<string, unknown> {
  // Strip pageContent-bound fields and return everything else as metadata
  const obj = entity as unknown as Record<string, unknown>;
  const clone: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'description' || k === 'content' || k === 'bio') continue;
    clone[k] = v;
  }
  return clone;
}

export type { Snapshot, Document, Chunk } from '@ahtmljs/schema';

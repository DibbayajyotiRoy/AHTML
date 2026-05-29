/**
 * Streaming snapshot serialization — the v0.7.0 release theme.
 *
 * The non-streaming `toJson()` / `toCompact()` paths fully buffer the
 * entire snapshot in memory before responding. That's fine for a typical
 * product detail page (a handful of entities, ~5 KB). It breaks down for
 * a dataset snapshot with 10,000 entities — the server allocates the
 * whole thing, the client allocates the whole thing again, and a 50 MB
 * payload sits in memory twice.
 *
 * The streaming format is line-delimited JSON ("NDJSON"). The first line
 * is the envelope without `entities` / `actions`. Each entity then
 * follows on its own line tagged with `kind: 'entity'`; each action on
 * its own line tagged `kind: 'action'`. A final `kind: 'end'` line is a
 * sentinel so the consumer can tell a graceful close from a network cut.
 *
 *   {"kind":"envelope","ahtml":"0.1","url":"…","page_type":"dataset", …}
 *   {"kind":"entity","entity":{ …Product… }}
 *   {"kind":"entity","entity":{ …Product… }}
 *   …
 *   {"kind":"action","action":{ … }}
 *   {"kind":"end","etag":"W/\"abc\""}
 *
 * Content type: `application/ahtml+json-seq`. The server writes records
 * to a `ReadableStream` so the response can start before the snapshot is
 * fully materialized; the client iterates an `AsyncIterable` so it can
 * begin processing the first entities while later ones are still on the
 * wire. End-to-end peak memory stays bounded by the per-entity working
 * set rather than the full snapshot.
 *
 * Compression is orthogonal — wrap either the buffered or streaming body
 * in `CompressionStream('gzip' | 'br')` and the wire stays small in both
 * shapes.
 */

import type { Snapshot, Entity, Action } from './types.js';
import { AHTMLError, DEFAULT_HINTS } from './errors.js';

export type StreamRecord =
  | { kind: 'envelope'; envelope: Omit<Snapshot, 'entities' | 'actions'> }
  | { kind: 'entity'; entity: Entity }
  | { kind: 'action'; action: Action }
  | { kind: 'end'; etag?: string };

export const STREAM_CONTENT_TYPE = 'application/ahtml+json-seq';

/**
 * Async-iterable serializer. Yields one NDJSON line per record (including
 * the trailing `\n`). Use when you're building a `ReadableStream` from a
 * source that's itself async (a database cursor, a paginated upstream
 * fetch).
 */
export async function* toStream(
  source: Snapshot | AsyncIterable<StreamRecord>,
): AsyncIterable<string> {
  if (isAsyncIterable(source)) {
    for await (const r of source) yield encodeRecord(r);
    return;
  }
  const snap = source;
  const { entities, actions, ...envelope } = snap;
  yield encodeRecord({ kind: 'envelope', envelope });
  for (const e of entities) yield encodeRecord({ kind: 'entity', entity: e });
  for (const a of actions) yield encodeRecord({ kind: 'action', action: a });
  yield encodeRecord({ kind: 'end', etag: snap.etag });
}

/**
 * Build a `ReadableStream<Uint8Array>` that emits the snapshot as NDJSON.
 * Suitable for direct use as a `Response` body in any Web-Standards
 * runtime (Node 20+, Edge, Cloudflare Workers, Bun, Deno).
 */
export function toStreamResponse(
  source: Snapshot | AsyncIterable<StreamRecord>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const iter = toStream(source)[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await iter.next();
      if (done) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(value));
    },
  });
}

/**
 * Inverse of `toStream`. Yields `StreamRecord`s as they arrive — the
 * consumer can `for await` and start work before the response ends.
 *
 * Accepts anything iterable of bytes or strings: a `Response.body`, a
 * `ReadableStream`, an `AsyncIterable<Uint8Array | string>`, or a single
 * pre-buffered string for tests.
 */
export async function* parseStream(
  source: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array | string> | string | null,
): AsyncIterable<StreamRecord> {
  if (source == null) {
    throw new AHTMLError({
      code: 'COMPACT_PARSE',
      message: 'parseStream() got a null source',
      hint: DEFAULT_HINTS.COMPACT_PARSE,
    });
  }
  if (typeof source === 'string') {
    for (const line of source.split('\n')) {
      if (line.trim() === '') continue;
      yield decodeRecord(line);
    }
    return;
  }
  const decoder = new TextDecoder();
  let buf = '';
  const chunks =
    source instanceof ReadableStream
      ? readableStreamToAsyncIterable(source)
      : (source as AsyncIterable<Uint8Array | string>);
  for await (const chunk of chunks) {
    buf += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
    let nl = buf.indexOf('\n');
    while (nl >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (line.trim() !== '') yield decodeRecord(line);
      nl = buf.indexOf('\n');
    }
  }
  // Flush decoder + any trailing partial line.
  const tail = buf + decoder.decode();
  if (tail.trim() !== '') yield decodeRecord(tail);
}

/**
 * Convenience wrapper: parse the stream, assemble a full `Snapshot`, and
 * return it. Useful when you wanted streaming for the server-side memory
 * win but the client can afford to materialize the whole snapshot.
 */
export async function fromStream(
  source: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array | string> | string | null,
): Promise<Snapshot> {
  let envelope: Omit<Snapshot, 'entities' | 'actions'> | null = null;
  const entities: Entity[] = [];
  const actions: Action[] = [];
  for await (const r of parseStream(source)) {
    switch (r.kind) {
      case 'envelope': envelope = r.envelope; break;
      case 'entity':   entities.push(r.entity); break;
      case 'action':   actions.push(r.action); break;
      case 'end':
        if (envelope && r.etag && !envelope.etag) envelope.etag = r.etag;
        break;
    }
  }
  if (!envelope) {
    throw new AHTMLError({
      code: 'COMPACT_PARSE',
      message: 'stream ended without an envelope record',
      hint: DEFAULT_HINTS.COMPACT_PARSE,
    });
  }
  return { ...envelope, entities, actions };
}

// =====================================================================
// helpers
// =====================================================================

function encodeRecord(r: StreamRecord): string {
  return JSON.stringify(r) + '\n';
}

function decodeRecord(line: string): StreamRecord {
  try {
    return JSON.parse(line) as StreamRecord;
  } catch (err) {
    throw new AHTMLError({
      code: 'JSON_PARSE',
      message: `failed to parse NDJSON record: ${(err as Error).message}`,
      hint: DEFAULT_HINTS.JSON_PARSE,
      cause: err,
    });
  }
}

function isAsyncIterable(v: unknown): v is AsyncIterable<StreamRecord> {
  return !!v && typeof v === 'object' && Symbol.asyncIterator in (v as object);
}

async function* readableStreamToAsyncIterable(
  stream: ReadableStream<Uint8Array>,
): AsyncIterable<Uint8Array> {
  // Node 20+ exposes Symbol.asyncIterator on ReadableStream natively; for
  // runtimes that don't, fall back to reader.read().
  const asAsync = stream as unknown as AsyncIterable<Uint8Array>;
  if (typeof (asAsync as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === 'function') {
    yield* asAsync;
    return;
  }
  const reader = stream.getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      if (value) yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

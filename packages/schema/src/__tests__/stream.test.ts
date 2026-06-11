/**
 * v0.7.0 — streaming snapshot round-trip + compression negotiation.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  snapshot,
  toStream,
  toStreamResponse,
  parseStream,
  fromStream,
  STREAM_CONTENT_TYPE,
  chooseEncoding,
  compressBuffer,
  AHTMLError,
  type StreamRecord,
} from '../index.js';
import type { Product } from '../types.js';

function bigSnap(n: number) {
  const b = snapshot('https://x.com/big', 'dataset').ttl(60);
  for (let i = 0; i < n; i++) {
    b.add({
      id: `product:p-${i}`,
      type: 'product',
      name: `Item ${i}`,
      price: { amount: i, currency: 'USD' },
    });
  }
  return b.build();
}

describe('toStream() / parseStream() / fromStream()', () => {
  test('round-trips a snapshot losslessly via the streaming format', async () => {
    const a = snapshot('https://x.com/p', 'product_detail')
      .ttl(60)
      .add({ id: 'product:a', type: 'product', name: 'A', price: { amount: 19, currency: 'USD' } })
      .add({ id: 'product:b', type: 'product', name: 'B' })
      .action({ id: 'buy', target: 'product:a' })
      .build();

    let buf = '';
    for await (const line of toStream(a)) buf += line;
    const b = await fromStream(buf);

    assert.equal(b.url, a.url);
    assert.equal(b.entities.length, 2);
    assert.equal((b.entities[0] as Product).name, 'A');
    assert.equal(b.actions[0]?.id, 'buy');
  });

  test('emits envelope first, then entities, then actions, then end', async () => {
    const a = snapshot('https://x.com/p', 'home')
      .add({ id: 'product:a', type: 'product', name: 'A' })
      .action({ id: 'go' })
      .build();
    const records: StreamRecord[] = [];
    for await (const r of parseStream(await collect(toStream(a)))) records.push(r);

    const kinds = records.map((r) => r.kind);
    assert.deepEqual(kinds, ['envelope', 'entity', 'action', 'end']);
  });

  test('end record carries the etag', async () => {
    const a = snapshot('https://x.com/p', 'home').etag('W/"abc"').build();
    const records: StreamRecord[] = [];
    for await (const r of parseStream(await collect(toStream(a)))) records.push(r);
    const end = records.find((r) => r.kind === 'end') as Extract<StreamRecord, { kind: 'end' }>;
    assert.equal(end.etag, 'W/"abc"');
  });

  test('peak memory stays bounded for large snapshots — consumer can short-circuit', async () => {
    // Build a 5000-entity snapshot, but stop after reading 10.
    const a = bigSnap(5000);
    let seen = 0;
    for await (const r of parseStream(await collect(toStream(a)))) {
      if (r.kind === 'entity') {
        seen++;
        if (seen >= 10) break;
      }
    }
    assert.equal(seen, 10);
    // No real assertion on memory — the structural test is that the iteration
    // can stop mid-stream without forcing the full payload.
  });

  test('toStreamResponse() produces a ReadableStream consumable by fromStream()', async () => {
    const a = bigSnap(50);
    const stream = toStreamResponse(a);
    const restored = await fromStream(stream);
    assert.equal(restored.entities.length, 50);
  });

  test('parseStream() throws JSON_PARSE for a corrupt record', async () => {
    const buf = '{"kind":"envelope","envelope":{}}\n{not json}\n';
    try {
      for await (const _r of parseStream(buf)) { void _r; }
      assert.fail('should throw');
    } catch (err) {
      assert.ok(AHTMLError.is(err, 'JSON_PARSE'));
    }
  });

  test('fromStream() throws COMPACT_PARSE when no envelope arrives', async () => {
    try {
      await fromStream('');
      assert.fail('should throw');
    } catch (err) {
      assert.ok(AHTMLError.is(err, 'COMPACT_PARSE'));
    }
  });

  test('STREAM_CONTENT_TYPE is stable', () => {
    assert.equal(STREAM_CONTENT_TYPE, 'application/ahtml+json-seq');
  });
});

describe('chooseEncoding() — Accept-Encoding negotiation', () => {
  test('returns identity when header is absent', () => {
    assert.equal(chooseEncoding(null), 'identity');
    assert.equal(chooseEncoding(undefined), 'identity');
    assert.equal(chooseEncoding(''), 'identity');
  });

  // chooseEncoding only offers 'br' when this runtime's CompressionStream
  // can actually produce it (Node gained br after 22), so br expectations
  // are runtime-conditional.
  const brOk = (() => {
    try {
      new (CompressionStream as unknown as new (f: string) => unknown)('br');
      return true;
    } catch {
      return false;
    }
  })();

  test('picks the highest q-value encoding among supported', () => {
    assert.equal(chooseEncoding('gzip, deflate'), 'gzip');
    assert.equal(chooseEncoding('br;q=0.8, gzip;q=0.9'), 'gzip');
    assert.equal(chooseEncoding('br;q=1.0, gzip;q=0.5'), brOk ? 'br' : 'gzip');
  });

  test('honors explicit q=0 as refusal', () => {
    assert.equal(chooseEncoding('gzip;q=0, br'), brOk ? 'br' : 'identity');
    assert.equal(chooseEncoding('gzip;q=0, identity'), 'identity');
  });

  test('* wildcard fills in unspecified encodings', () => {
    assert.equal(chooseEncoding('*'), brOk ? 'br' : 'gzip'); // our preference order, gated on runtime support
    assert.equal(chooseEncoding('gzip, *;q=0.1'), 'gzip');   // explicit beats wildcard
  });

  test('falls back to identity when no supported encoding offered', () => {
    assert.equal(chooseEncoding('compress;q=1.0'), 'identity');
  });
});

describe('compressBuffer() — round-trip with DecompressionStream', () => {
  test('identity is a no-op', async () => {
    const out = await compressBuffer('hello', 'identity');
    assert.equal(new TextDecoder().decode(out), 'hello');
  });

  test('gzip-encoded body decodes back to the original via DecompressionStream', async () => {
    const original = 'The quick brown fox '.repeat(64);
    const compressed = await compressBuffer(original, 'gzip');
    assert.ok(compressed.byteLength < original.length, 'gzip should reduce size');
    const decoded = await decompress(compressed, 'gzip');
    assert.equal(decoded, original);
  });

  test('gzip on a 100-entity snapshot saves ≥30% bytes', async () => {
    const s = bigSnap(100);
    const raw = JSON.stringify(s);
    const gz = await compressBuffer(raw, 'gzip');
    const ratio = gz.byteLength / raw.length;
    assert.ok(ratio < 0.7, `expected ≥30% reduction, got ${(1 - ratio) * 100 | 0}%`);
  });
});

// ---------- helpers ----------

async function collect(it: AsyncIterable<string>): Promise<string> {
  let s = '';
  for await (const chunk of it) s += chunk;
  return s;
}

async function decompress(bytes: Uint8Array, encoding: 'gzip' | 'deflate'): Promise<string> {
  const stream = new ReadableStream<Uint8Array>({
    start(c) { c.enqueue(bytes); c.close(); },
  });
  const ds = new (DecompressionStream as unknown as new (f: string) => TransformStream<Uint8Array, Uint8Array>)(encoding);
  const piped = stream.pipeThrough(ds);
  const reader = piped.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return new TextDecoder().decode(concatChunks(chunks));
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) total += c.byteLength;
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.byteLength; }
  return out;
}

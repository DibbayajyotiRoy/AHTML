/**
 * v0.7.0 — streaming snapshots + pluggable cache.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { AHTMLClient, AHTMLError } from '../index.js';
import {
  snapshot,
  toCompact,
  toStreamResponse,
  InMemoryCacheStore,
  STREAM_CONTENT_TYPE,
  type CacheStore,
} from '@ahtmljs/schema';
import type { CachedSnapshot } from '../client.js';

function snap(url: string) {
  return snapshot(url, 'home').build();
}

function snapWith(url: string, n: number) {
  const b = snapshot(url, 'dataset');
  for (let i = 0; i < n; i++) {
    b.add({ id: `product:p-${i}`, type: 'product', name: `Item ${i}` });
  }
  return b.build();
}

describe('AHTMLClient v0.7 — streaming', () => {
  test('streamSnapshot() yields envelope → entity* → action* → end', async () => {
    const s = snapshot('https://x.com/p', 'product_detail')
      .add({ id: 'product:a', type: 'product', name: 'A' })
      .action({ id: 'buy', target: 'product:a' })
      .build();
    const body = toStreamResponse(s);
    const client = new AHTMLClient({
      fetch: async () => new Response(body, {
        status: 200,
        headers: { 'content-type': STREAM_CONTENT_TYPE },
      }),
    });
    const kinds: string[] = [];
    for await (const r of client.streamSnapshot('https://x.com/p', { retry: false })) {
      kinds.push(r.kind);
    }
    assert.deepEqual(kinds, ['envelope', 'entity', 'action', 'end']);
  });

  test('streamEntities() yields only entities and can short-circuit', async () => {
    const s = snapWith('https://x.com/big', 500);
    const body = toStreamResponse(s);
    const client = new AHTMLClient({
      fetch: async () => new Response(body, {
        status: 200,
        headers: { 'content-type': STREAM_CONTENT_TYPE },
      }),
    });
    let n = 0;
    for await (const e of client.streamEntities('https://x.com/big', { retry: false })) {
      assert.equal(e.type, 'product');
      n++;
      if (n >= 5) break;
    }
    assert.equal(n, 5);
  });

  test('streamSnapshot() rejects non-stream responses with a hint', async () => {
    const client = new AHTMLClient({
      fetch: async () => new Response(toCompact(snap('https://x.com/p')), {
        status: 200,
        headers: { 'content-type': 'application/ahtml+text' },
      }),
    });
    try {
      for await (const _r of client.streamSnapshot('https://x.com/p', { retry: false })) { void _r; }
      assert.fail('should throw');
    } catch (err) {
      assert.ok(AHTMLError.is(err, 'HTTP_STATUS'));
      assert.match((err as AHTMLError).hint!, /stream/i);
    }
  });

  test('streamSnapshot() surfaces 4xx as a typed error', async () => {
    const client = new AHTMLClient({
      fetch: async () => new Response('', { status: 403 }),
    });
    try {
      for await (const _r of client.streamSnapshot('https://x.com/p', { retry: false })) { void _r; }
      assert.fail();
    } catch (err) {
      assert.ok(AHTMLError.is(err, 'POLICY_DENIED'));
    }
  });
});

describe('AHTMLClient v0.7 — pluggable cache', () => {
  test('default cache is in-memory and behaves like v0.6', async () => {
    let calls = 0;
    const client = new AHTMLClient({
      fetch: async () => {
        calls++;
        return new Response(toCompact(snapshot('https://x.com/p', 'home').ttl(3600).build()), {
          status: 200,
          headers: { 'content-type': 'application/ahtml+text' },
        });
      },
    });
    await client.fetch('https://x.com/p', { retry: false });
    await client.fetch('https://x.com/p', { retry: false });
    assert.equal(calls, 1, 'fresh cache should not re-fetch');
  });

  test('an injected CacheStore<CachedSnapshot> is used in place of the default', async () => {
    let getCalls = 0;
    let setCalls = 0;
    const store: CacheStore<CachedSnapshot> = {
      get(k) { getCalls++; return undefined; },
      set(_k, _v) { setCalls++; },
      delete() { /* noop */ },
      clear() { /* noop */ },
    };
    const client = new AHTMLClient({
      cache: store,
      fetch: async () => new Response(toCompact(snap('https://x.com/p')), {
        status: 200,
        headers: { 'content-type': 'application/ahtml+text' },
      }),
    });
    await client.fetch('https://x.com/p', { retry: false });
    await client.fetch('https://x.com/p', { retry: false });
    assert.ok(getCalls >= 2, `get called at least twice (was ${getCalls})`);
    assert.ok(setCalls >= 2, `set called at least twice (was ${setCalls})`);
  });

  test('async CacheStore is awaited correctly', async () => {
    const backing = new Map<string, CachedSnapshot>();
    const store: CacheStore<CachedSnapshot> = {
      async get(k) { return backing.get(k); },
      async set(k, v) { backing.set(k, v); },
      async delete(k) { backing.delete(k); },
      async clear() { backing.clear(); },
    };
    let calls = 0;
    const client = new AHTMLClient({
      cache: store,
      fetch: async () => {
        calls++;
        return new Response(toCompact(snapshot('https://x.com/p', 'home').ttl(3600).build()), {
          status: 200,
          headers: { 'content-type': 'application/ahtml+text' },
        });
      },
    });
    await client.fetch('https://x.com/p', { retry: false });
    await client.fetch('https://x.com/p', { retry: false });
    assert.equal(calls, 1, 'async cache hit should not re-fetch');
    assert.equal(backing.size, 1);
  });

  test('InMemoryCacheStore from @ahtmljs/schema is the default implementation', () => {
    // Test that the export is reachable; clients passing it explicitly should work.
    const store = new InMemoryCacheStore<CachedSnapshot>(10);
    const client = new AHTMLClient({ cache: store });
    void client; // construction shouldn't throw
    assert.ok(store);
  });
});

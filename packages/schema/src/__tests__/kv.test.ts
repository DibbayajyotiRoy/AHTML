/**
 * v0.7.0 — pluggable KV / cache backends.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryCacheStore, InMemoryKvStore } from '../index.js';

describe('InMemoryCacheStore', () => {
  test('basic get/set/delete/clear', () => {
    const c = new InMemoryCacheStore<number>();
    assert.equal(c.get('a'), undefined);
    c.set('a', 1);
    assert.equal(c.get('a'), 1);
    c.set('a', 2);
    assert.equal(c.get('a'), 2);
    c.delete('a');
    assert.equal(c.get('a'), undefined);
    c.set('a', 3); c.set('b', 4);
    c.clear();
    assert.equal(c.get('a'), undefined);
    assert.equal(c.get('b'), undefined);
  });

  test('TTL expires entries lazily on read', async () => {
    const c = new InMemoryCacheStore<string>();
    c.set('a', 'x', 30);
    assert.equal(c.get('a'), 'x');
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(c.get('a'), undefined, 'expired entry returns undefined');
  });

  test('maxEntries enforces LRU-style insertion-order eviction', () => {
    const c = new InMemoryCacheStore<number>(3);
    c.set('a', 1); c.set('b', 2); c.set('c', 3);
    c.set('d', 4); // evicts 'a'
    assert.equal(c.get('a'), undefined);
    assert.equal(c.get('b'), 2);
    assert.equal(c.get('c'), 3);
    assert.equal(c.get('d'), 4);
  });

  test('re-setting a key bumps its recency', () => {
    const c = new InMemoryCacheStore<number>(3);
    c.set('a', 1); c.set('b', 2); c.set('c', 3);
    c.set('a', 11); // refresh 'a' — now 'b' is oldest
    c.set('d', 4); // should evict 'b'
    assert.equal(c.get('b'), undefined);
    assert.equal(c.get('a'), 11);
  });

  test('size() reports current count', () => {
    const c = new InMemoryCacheStore<number>();
    assert.equal(c.size(), 0);
    c.set('a', 1); c.set('b', 2);
    assert.equal(c.size(), 2);
  });
});

describe('InMemoryKvStore', () => {
  test('basic async get/set/delete', async () => {
    const k = new InMemoryKvStore();
    assert.equal(await k.get('a'), null);
    await k.set('a', 'hello');
    assert.equal(await k.get('a'), 'hello');
    await k.delete('a');
    assert.equal(await k.get('a'), null);
  });

  test('TTL expires entries', async () => {
    const k = new InMemoryKvStore();
    await k.set('a', 'x', 30);
    assert.equal(await k.get('a'), 'x');
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(await k.get('a'), null);
  });

  test('incr atomically increments and persists', async () => {
    const k = new InMemoryKvStore();
    assert.equal(await k.incr('hits'), 1);
    assert.equal(await k.incr('hits'), 2);
    assert.equal(await k.incr('hits'), 3);
    assert.equal(await k.get('hits'), '3');
  });

  test('incr with ttlMs starts the expiration window on first call', async () => {
    const k = new InMemoryKvStore();
    await k.incr('rl', 50);
    await k.incr('rl');
    // The TTL applies to the key; subsequent incrs preserve it.
    await new Promise((r) => setTimeout(r, 70));
    assert.equal(await k.get('rl'), null);
  });
});

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryKvStore, InMemoryCacheStore, RateLimiter } from '../index.js';
import { UpstashKvStore, UpstashCacheStore } from '../upstash.js';
import { CloudflareKvStore, CloudflareCacheStore } from '../cloudflare.js';

// ─── Fakes ──────────────────────────────────────────────────────────────────
// Minimal in-memory doubles for the two remote backends. They record every
// call so the adapter's TTL translation (ttlMs → px / expirationTtl) and its
// incr semantics can be asserted without a live Redis or Workers runtime.

type Call = [string, ...unknown[]];

class FakeUpstash {
  store = new Map<string, string>();
  calls: Call[] = [];
  async get(key: string) { this.calls.push(['get', key]); return this.store.has(key) ? this.store.get(key)! : null; }
  async set(key: string, value: string, opts?: { ex?: number; px?: number }) { this.calls.push(['set', key, value, opts]); this.store.set(key, value); }
  async del(key: string) { this.calls.push(['del', key]); this.store.delete(key); }
  async incr(key: string) { this.calls.push(['incr', key]); const n = (parseInt(this.store.get(key) ?? '0', 10)) + 1; this.store.set(key, String(n)); return n; }
  async expire(key: string, seconds: number) { this.calls.push(['expire', key, seconds]); }
  count(name: string) { return this.calls.filter((c) => c[0] === name).length; }
}

class FakeKVNamespace {
  store = new Map<string, string>();
  calls: Call[] = [];
  async get(key: string, opts?: { type?: 'text' }) { this.calls.push(['get', key, opts]); return this.store.has(key) ? this.store.get(key)! : null; }
  async put(key: string, value: string, opts?: { expirationTtl?: number }) { this.calls.push(['put', key, value, opts]); this.store.set(key, value); }
  async delete(key: string) { this.calls.push(['delete', key]); this.store.delete(key); }
  lastPutOpts() { const put = [...this.calls].reverse().find((c) => c[0] === 'put'); return put?.[3] as { expirationTtl?: number } | undefined; }
}

// ─── index re-exports ────────────────────────────────────────────────────────

describe('@ahtmljs/kv index', () => {
  test('re-exports the in-memory backends and the rate limiter', () => {
    assert.equal(typeof InMemoryKvStore, 'function');
    assert.equal(typeof InMemoryCacheStore, 'function');
    assert.equal(typeof RateLimiter, 'function');
  });
});

// ─── Upstash KvStore ─────────────────────────────────────────────────────────

describe('UpstashKvStore', () => {
  test('get returns the stored value, or null when missing', async () => {
    const r = new FakeUpstash();
    const kv = new UpstashKvStore(r);
    assert.equal(await kv.get('missing'), null);
    r.store.set('present', 'hi');
    assert.equal(await kv.get('present'), 'hi');
  });

  test('set with a ttl passes px (milliseconds); set without ttl passes no opts', async () => {
    const r = new FakeUpstash();
    const kv = new UpstashKvStore(r);
    await kv.set('a', '1', 5000);
    await kv.set('b', '2');
    const setA = r.calls.find((c) => c[0] === 'set' && c[1] === 'a')!;
    const setB = r.calls.find((c) => c[0] === 'set' && c[1] === 'b')!;
    assert.deepEqual(setA[3], { px: 5000 });
    assert.equal(setB[3], undefined);
  });

  test('incr sets an expiry only on the first increment', async () => {
    const r = new FakeUpstash();
    const kv = new UpstashKvStore(r);
    assert.equal(await kv.incr('c', 60_000), 1);
    assert.equal(await kv.incr('c', 60_000), 2);
    assert.equal(await kv.incr('c', 60_000), 3);
    // expire is called exactly once — on the transition 0 → 1 (n === 1),
    // with the ttl converted from ms to whole seconds.
    const expireCalls = r.calls.filter((c) => c[0] === 'expire');
    assert.equal(expireCalls.length, 1);
    assert.deepEqual(expireCalls[0], ['expire', 'c', 60]);
  });

  test('delete forwards to del', async () => {
    const r = new FakeUpstash();
    const kv = new UpstashKvStore(r);
    r.store.set('x', 'y');
    await kv.delete('x');
    assert.equal(r.store.has('x'), false);
    assert.equal(r.count('del'), 1);
  });
});

// ─── Upstash CacheStore ──────────────────────────────────────────────────────

describe('UpstashCacheStore', () => {
  test('round-trips a JSON value under the default prefix', async () => {
    const r = new FakeUpstash();
    const cache = new UpstashCacheStore<{ n: number }>(r);
    await cache.set('k', { n: 7 });
    assert.ok(r.store.has('ahtml:cache:k'), 'stored under the ahtml:cache: prefix');
    assert.deepEqual(await cache.get('k'), { n: 7 });
  });

  test('get returns undefined for a missing key and for corrupt JSON', async () => {
    const r = new FakeUpstash();
    const cache = new UpstashCacheStore<{ n: number }>(r);
    assert.equal(await cache.get('nope'), undefined);
    r.store.set('ahtml:cache:bad', '{not json');
    assert.equal(await cache.get('bad'), undefined);
  });

  test('honors a custom prefix and passes px on ttl', async () => {
    const r = new FakeUpstash();
    const cache = new UpstashCacheStore<number>(r, 'snap:');
    await cache.set('k', 1, 3000);
    const set = r.calls.find((c) => c[0] === 'set')!;
    assert.equal(set[1], 'snap:k');
    assert.deepEqual(set[3], { px: 3000 });
  });
});

// ─── Cloudflare KvStore ──────────────────────────────────────────────────────

describe('CloudflareKvStore', () => {
  test('get requests the text type and returns null when missing', async () => {
    const ns = new FakeKVNamespace();
    const kv = new CloudflareKvStore(ns);
    assert.equal(await kv.get('missing'), null);
    const get = ns.calls.find((c) => c[0] === 'get')!;
    assert.deepEqual(get[2], { type: 'text' });
  });

  test('set converts ttlMs to whole-second expirationTtl; omits opts without ttl', async () => {
    const ns = new FakeKVNamespace();
    const kv = new CloudflareKvStore(ns);
    await kv.set('a', '1', 1500); // 1.5s → ceil → 2s
    assert.deepEqual(ns.lastPutOpts(), { expirationTtl: 2 });
    await kv.set('b', '2');
    assert.equal(ns.lastPutOpts(), undefined);
  });

  test('incr is a read-modify-write that returns the new count', async () => {
    const ns = new FakeKVNamespace();
    const kv = new CloudflareKvStore(ns);
    assert.equal(await kv.incr('c'), 1);
    assert.equal(await kv.incr('c'), 2);
    assert.equal(ns.store.get('c'), '2');
  });

  test('delete forwards to the namespace', async () => {
    const ns = new FakeKVNamespace();
    const kv = new CloudflareKvStore(ns);
    ns.store.set('x', 'y');
    await kv.delete('x');
    assert.equal(ns.store.has('x'), false);
  });
});

// ─── Cloudflare CacheStore ───────────────────────────────────────────────────

describe('CloudflareCacheStore', () => {
  test('round-trips a JSON value under the prefix and converts ttl', async () => {
    const ns = new FakeKVNamespace();
    const cache = new CloudflareCacheStore<{ ok: boolean }>(ns);
    await cache.set('k', { ok: true }, 10_000);
    assert.ok(ns.store.has('ahtml:cache:k'));
    assert.deepEqual(ns.lastPutOpts(), { expirationTtl: 10 });
    assert.deepEqual(await cache.get('k'), { ok: true });
  });

  test('get returns undefined for missing and corrupt entries', async () => {
    const ns = new FakeKVNamespace();
    const cache = new CloudflareCacheStore<number>(ns);
    assert.equal(await cache.get('nope'), undefined);
    ns.store.set('ahtml:cache:bad', 'oops');
    assert.equal(await cache.get('bad'), undefined);
  });
});

// ─── RateLimiter (over the in-memory KvStore) ────────────────────────────────

describe('RateLimiter', () => {
  test('allows up to the limit then blocks, counting down remaining', async () => {
    const limiter = new RateLimiter(new InMemoryKvStore(), { limit: 3, windowMs: 60_000 });
    const r1 = await limiter.check('agent:A');
    const r2 = await limiter.check('agent:A');
    const r3 = await limiter.check('agent:A');
    const r4 = await limiter.check('agent:A');
    assert.deepEqual([r1.allowed, r2.allowed, r3.allowed, r4.allowed], [true, true, true, false]);
    assert.deepEqual([r1.remaining, r2.remaining, r3.remaining, r4.remaining], [2, 1, 0, 0]);
    assert.equal(r1.limit, 3);
    assert.ok(r1.resetAt > Date.now() - 1000, 'resetAt is a forward-looking timestamp');
  });

  test('tracks identifiers independently', async () => {
    const limiter = new RateLimiter(new InMemoryKvStore(), { limit: 1, windowMs: 60_000 });
    assert.equal((await limiter.check('agent:A')).allowed, true);
    assert.equal((await limiter.check('agent:B')).allowed, true, 'B has its own bucket');
    assert.equal((await limiter.check('agent:A')).allowed, false);
  });

  test('enforce throws once the limit is exceeded, attaching the result', async () => {
    const limiter = new RateLimiter(new InMemoryKvStore(), { limit: 1, windowMs: 60_000 });
    const ok = await limiter.enforce('agent:A');
    assert.equal(ok.allowed, true);
    await assert.rejects(
      () => limiter.enforce('agent:A'),
      (err: Error & { rateLimit?: { allowed: boolean } }) => {
        assert.match(err.message, /Rate limit exceeded/);
        assert.equal(err.rateLimit?.allowed, false);
        return true;
      },
    );
  });

  test('a custom prefix does not collide with the default bucket', async () => {
    const kv = new InMemoryKvStore();
    const a = new RateLimiter(kv, { limit: 1, windowMs: 60_000 });
    const b = new RateLimiter(kv, { limit: 1, windowMs: 60_000, prefix: 'other:' });
    assert.equal((await a.check('id')).allowed, true);
    assert.equal((await b.check('id')).allowed, true, 'different prefix → different key');
    assert.equal((await a.check('id')).allowed, false);
  });
});

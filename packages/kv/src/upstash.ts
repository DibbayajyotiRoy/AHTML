/**
 * Upstash Redis backend for @ahtmljs/kv.
 *
 * Install the peer dep: npm i @upstash/redis
 *
 * Usage:
 *   import { UpstashKvStore } from '@ahtmljs/kv/upstash';
 *   import { Redis } from '@upstash/redis';
 *   const redis = new Redis({ url: '...', token: '...' });
 *   const kv = new UpstashKvStore(redis);
 *   const client = new AHTMLClient({ cache: new UpstashCacheStore(redis) });
 */

import type { KvStore, CacheStore } from '@ahtmljs/schema';

/** Minimal subset of the @upstash/redis API we use. */
interface UpstashRedis {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, opts?: { ex?: number; px?: number }): Promise<unknown>;
  del(key: string): Promise<unknown>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
}

/** KvStore backed by Upstash Redis. Works in Node.js, Cloudflare Workers, and Deno. */
export class UpstashKvStore implements KvStore {
  constructor(private redis: UpstashRedis) {}

  async get(key: string): Promise<string | null> {
    const v = await this.redis.get(key);
    return v ?? null;
  }

  async set(key: string, value: string, ttlMs?: number): Promise<void> {
    if (ttlMs && ttlMs > 0) {
      await this.redis.set(key, value, { px: ttlMs });
    } else {
      await this.redis.set(key, value);
    }
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async incr(key: string, ttlMs?: number): Promise<number> {
    const n = await this.redis.incr(key);
    if (ttlMs && ttlMs > 0 && n === 1) {
      // Set TTL only on first increment so it expires automatically.
      await this.redis.expire(key, Math.ceil(ttlMs / 1000));
    }
    return n;
  }
}

/**
 * CacheStore<T> backed by Upstash Redis.
 * Serializes values as JSON strings. Suitable for AHTMLClient snapshot cache.
 */
export class UpstashCacheStore<T> implements CacheStore<T> {
  constructor(
    private redis: UpstashRedis,
    private prefix = 'ahtml:cache:',
  ) {}

  async get(key: string): Promise<T | undefined> {
    const raw = await this.redis.get(this.prefix + key);
    if (raw == null) return undefined;
    try { return JSON.parse(raw) as T; } catch { return undefined; }
  }

  async set(key: string, value: T, ttlMs?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttlMs && ttlMs > 0) {
      await this.redis.set(this.prefix + key, serialized, { px: ttlMs });
    } else {
      await this.redis.set(this.prefix + key, serialized);
    }
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(this.prefix + key);
  }

  async clear(): Promise<void> {
    // Upstash doesn't support SCAN in all tiers; leave as no-op with a note.
    // Use a Redis SCAN + DEL if you need a full clear (requires direct redis access).
  }
}

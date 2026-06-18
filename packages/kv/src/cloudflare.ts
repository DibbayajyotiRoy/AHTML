/**
 * Cloudflare KV binding adapter for @ahtmljs/kv.
 *
 * Usage in a Cloudflare Worker:
 *   import { CloudflareKvStore } from '@ahtmljs/kv/cloudflare';
 *   // Env binding: MY_KV is a KVNamespace from wrangler.toml
 *   const kv = new CloudflareKvStore(env.MY_KV);
 *   const client = new AHTMLClient({ cache: new CloudflareCacheStore(env.MY_KV) });
 */

import type { KvStore, CacheStore } from '@ahtmljs/schema';

/**
 * Minimal interface matching Cloudflare's KVNamespace.
 * Written as a local interface so callers don't need @cloudflare/workers-types
 * to compile (the actual runtime binding satisfies it structurally).
 */
interface KVNamespace {
  get(key: string, opts?: { type?: 'text' }): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

/** KvStore backed by a Cloudflare KV namespace binding. */
export class CloudflareKvStore implements KvStore {
  constructor(private kv: KVNamespace) {}

  get(key: string): Promise<string | null> {
    return this.kv.get(key, { type: 'text' });
  }

  async set(key: string, value: string, ttlMs?: number): Promise<void> {
    const expirationTtl = ttlMs && ttlMs > 0 ? Math.ceil(ttlMs / 1000) : undefined;
    await this.kv.put(key, value, expirationTtl !== undefined ? { expirationTtl } : undefined);
  }

  delete(key: string): Promise<void> {
    return this.kv.delete(key);
  }

  async incr(key: string, ttlMs?: number): Promise<number> {
    // Cloudflare KV is eventually consistent and doesn't have atomic incr.
    // Use a simple read-modify-write. For accurate rate limiting across
    // replicas, use UpstashKvStore + Durable Objects instead.
    const cur = await this.kv.get(key, { type: 'text' });
    const next = (cur ? parseInt(cur, 10) : 0) + 1;
    await this.set(key, String(next), ttlMs);
    return next;
  }
}

/**
 * CacheStore<T> backed by Cloudflare KV.
 * Serializes values as JSON strings.
 */
export class CloudflareCacheStore<T> implements CacheStore<T> {
  constructor(
    private kv: KVNamespace,
    private prefix = 'ahtml:cache:',
  ) {}

  async get(key: string): Promise<T | undefined> {
    const raw = await this.kv.get(this.prefix + key, { type: 'text' });
    if (raw == null) return undefined;
    try { return JSON.parse(raw) as T; } catch { return undefined; }
  }

  async set(key: string, value: T, ttlMs?: number): Promise<void> {
    const expirationTtl = ttlMs && ttlMs > 0 ? Math.ceil(ttlMs / 1000) : undefined;
    const serialized = JSON.stringify(value);
    await this.kv.put(this.prefix + key, serialized, expirationTtl !== undefined ? { expirationTtl } : undefined);
  }

  async delete(key: string): Promise<void> {
    await this.kv.delete(this.prefix + key);
  }

  async clear(): Promise<void> {
    // Cloudflare KV doesn't support prefix-based bulk delete via the binding API.
  }
}

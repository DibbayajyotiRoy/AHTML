/**
 * Pluggable key/value backends — the v0.7.0 release theme.
 *
 * Every cache and rate-limiter inside `@ahtmljs/*` is keyed against one
 * of these two interfaces:
 *
 * - `KvStore` — string-valued; the canonical shape for Redis / Upstash /
 *   Cloudflare KV / Workers KV. Use this for cross-process rate
 *   limiting, request idempotency keys, or anywhere you'd otherwise
 *   reach for `redis.set/get`.
 * - `CacheStore<T>` — object-valued; the shape the `AHTMLClient` snapshot
 *   cache and the route-handler diff cache use internally. Implementations
 *   may be sync (the in-memory default) or async (Redis-backed).
 *
 * Default in-memory adapters are exported so adopters can drop them into
 * tests, demos, or single-process deployments without writing glue. Real
 * backends (Upstash, Cloudflare KV, Workers KV) ship in a separate
 * `@ahtmljs/kv` package planned for v0.7.x — but the interface is stable
 * starting in v0.7.0, and that's what you implement against.
 */

/**
 * The interface a string-valued KV backend implements. Every method is
 * async so the same code path serves both in-memory and remote backends.
 * `ttlMs` is a hint — backends that don't support per-key TTL may ignore
 * it, and adopters should rely on `delete()` or eviction for guarantees.
 */
export interface KvStore {
  /** Read a value. Resolves to `null` (not `undefined`) when missing. */
  get(key: string): Promise<string | null>;
  /** Write a value. `ttlMs` is an optional expiration hint. */
  set(key: string, value: string, ttlMs?: number): Promise<void>;
  /** Remove a value. No-op when absent. */
  delete(key: string): Promise<void>;
  /**
   * Atomically increment a counter and return the new value. Used for
   * token-bucket / leaky-bucket rate limiters across replicas. `ttlMs` is
   * applied on the first increment so counters expire automatically.
   */
  incr(key: string, ttlMs?: number): Promise<number>;
}

/**
 * The interface an object-valued cache implements. The `AHTMLClient`
 * snapshot cache uses this — it stores parsed `Snapshot`s, not their
 * serialized form, so deserializing per-read isn't on the hot path.
 *
 * Methods may return sync values; the client awaits them either way.
 */
export interface CacheStore<T> {
  get(key: string): T | undefined | Promise<T | undefined>;
  set(key: string, value: T, ttlMs?: number): void | Promise<void>;
  delete(key: string): void | Promise<void>;
  clear(): void | Promise<void>;
  /** Snapshot of currently-cached keys. Optional — best-effort. */
  keys?(): Iterable<string> | Promise<Iterable<string>>;
}

interface Entry<T> {
  value: T;
  expiresAt: number;
}

/**
 * The default, in-memory `CacheStore<T>` adapter — a `Map` with per-entry
 * TTL and a lazy expiration pass on read. Backwards-compatible with the
 * v0.6 `AHTMLClient` cache (a plain `Map`).
 *
 * Bounded by `maxEntries` (default 1000) using LRU-style eviction: when
 * the cap is hit, the oldest insertion is dropped. Set to `Infinity` to
 * disable the cap.
 */
export class InMemoryCacheStore<T> implements CacheStore<T> {
  private map = new Map<string, Entry<T>>();
  constructor(private maxEntries: number = 1000) {}

  get(key: string): T | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (e.expiresAt && e.expiresAt < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return e.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    // Map preserves insertion order — re-set should re-order to "newest"
    // so eviction always drops the genuinely-oldest entry.
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, {
      value,
      expiresAt: ttlMs && ttlMs > 0 ? Date.now() + ttlMs : 0,
    });
    if (this.map.size > this.maxEntries) {
      const firstKey = this.map.keys().next().value;
      if (firstKey !== undefined) this.map.delete(firstKey);
    }
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  keys(): Iterable<string> {
    return this.map.keys();
  }

  /** Current entry count (post-expiration). For tests / metrics. */
  size(): number {
    return this.map.size;
  }
}

/**
 * The default, in-memory `KvStore` adapter — a `Map<string, string>`
 * with per-key TTL and atomic incr semantics inside the single process.
 *
 * For multi-replica deployments swap this for `@ahtmljs/kv/upstash` or
 * `@ahtmljs/kv/cloudflare` — both forthcoming in v0.7.x. The interface
 * here is what they implement.
 */
export class InMemoryKvStore implements KvStore {
  private map = new Map<string, Entry<string>>();

  async get(key: string): Promise<string | null> {
    const e = this.map.get(key);
    if (!e) return null;
    if (e.expiresAt && e.expiresAt < Date.now()) {
      this.map.delete(key);
      return null;
    }
    return e.value;
  }

  async set(key: string, value: string, ttlMs?: number): Promise<void> {
    this.map.set(key, { value, expiresAt: ttlMs && ttlMs > 0 ? Date.now() + ttlMs : 0 });
  }

  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }

  async incr(key: string, ttlMs?: number): Promise<number> {
    const cur = await this.get(key);
    const next = (cur ? parseInt(cur, 10) : 0) + 1;
    // Preserve existing expiration if the key already exists and no new TTL given
    const existing = this.map.get(key);
    const expiresAt =
      ttlMs && ttlMs > 0
        ? Date.now() + ttlMs
        : existing?.expiresAt ?? 0;
    this.map.set(key, { value: String(next), expiresAt });
    return next;
  }
}

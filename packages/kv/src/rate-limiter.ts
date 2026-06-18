/**
 * Token-bucket rate limiter built on KvStore.incr().
 * Works with any KvStore backend (memory, Upstash, Cloudflare KV).
 *
 * Usage:
 *   const limiter = new RateLimiter(kvStore, { limit: 100, windowMs: 60_000 });
 *   const result = await limiter.check('agent:ClaudeBot');
 *   if (!result.allowed) throw new Error('Rate limited');
 */

import type { KvStore } from '@ahtmljs/schema';

export interface RateLimitOptions {
  /** Max requests per window. */
  limit: number;
  /** Window size in milliseconds. */
  windowMs: number;
  /** Key prefix. Default: 'ahtml:rl:'. */
  prefix?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // Unix ms
  limit: number;
}

export class RateLimiter {
  private prefix: string;

  constructor(
    private kv: KvStore,
    private opts: RateLimitOptions,
  ) {
    this.prefix = opts.prefix ?? 'ahtml:rl:';
  }

  async check(identifier: string): Promise<RateLimitResult> {
    const key = this.prefix + identifier;
    const windowMs = this.opts.windowMs;
    const limit = this.opts.limit;

    const count = await this.kv.incr(key, windowMs);
    const allowed = count <= limit;
    const remaining = Math.max(0, limit - count);
    // resetAt is approximate — exact TTL would require a separate GET
    const resetAt = Date.now() + windowMs;

    return { allowed, remaining, resetAt, limit };
  }

  /** Convenience: throws an Error if the rate limit is exceeded. */
  async enforce(identifier: string, message = 'Rate limit exceeded'): Promise<RateLimitResult> {
    const result = await this.check(identifier);
    if (!result.allowed) throw Object.assign(new Error(message), { rateLimit: result });
    return result;
  }
}

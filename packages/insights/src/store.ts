/**
 * KV-backed event storage — T5.2.
 *
 * Every recorded event is persisted behind the `@ahtmljs/kv` `KvStore`
 * abstraction, so the exact same recorder runs unchanged on the in-memory
 * backend (tests, single-process deploys), Cloudflare KV (edge), and
 * Upstash Redis (multi-replica). The store touches ONLY the four `KvStore`
 * primitives (`get` / `set` / `delete` / `incr`) so it never depends on a
 * backend-specific listing/scan API that some tiers don't expose.
 *
 * Layout (all string values, per the `KvStore` contract):
 *
 *   insights:<site>:seq         → monotonically-increasing event counter
 *   insights:<site>:evt:<n>     → JSON of the n-th sanitized InsightEvent
 *
 * Append is O(1): one atomic `incr` for the sequence number, one `set` for
 * the event body. Export walks `1..seq` with `get` — off the hot path, only
 * paid at report time. Because every write goes through {@link sanitizeEvent},
 * the stored bytes can never contain anything outside the six allowed fields
 * (the privacy guarantee, T5.3, is enforced here as well as at the edge).
 */

import type { KvStore } from '@ahtmljs/kv';
import { sanitizeEvent, type InsightEvent } from './events.js';

export interface InsightStoreOptions {
  /**
   * Per-event expiration hint in milliseconds. Passed straight through to
   * the backend's `set(ttlMs)`. Omit for unbounded retention (the default).
   * The sequence counter is never expired, so `export()` stays correct even
   * after old event bodies age out (missing bodies are simply skipped).
   */
  ttlMs?: number;
  /** Key namespace prefix (default `insights`). */
  namespace?: string;
}

/**
 * An append-only event log keyed by `site`, backed by any `@ahtmljs/kv`
 * `KvStore`. One instance per publisher site.
 */
export class InsightStore {
  private readonly kv: KvStore;
  private readonly prefix: string;
  private readonly seqKey: string;
  private readonly ttlMs?: number;

  constructor(kv: KvStore, site: string, opts: InsightStoreOptions = {}) {
    this.kv = kv;
    const ns = opts.namespace ?? 'insights';
    // Encode the site so a `:` or `/` in the identifier can't collide with
    // the key structure.
    this.prefix = `${ns}:${encodeURIComponent(site)}:`;
    this.seqKey = `${this.prefix}seq`;
    if (opts.ttlMs != null) this.ttlMs = opts.ttlMs;
  }

  private evtKey(n: number): string {
    return `${this.prefix}evt:${n}`;
  }

  /**
   * Sanitize and append an event. Returns the stored (sanitized) event so
   * callers can assert on exactly what was persisted. Never stores the
   * caller's object directly — {@link sanitizeEvent} rebuilds it field by
   * field.
   */
  async record(event: InsightEvent): Promise<InsightEvent> {
    const clean = sanitizeEvent(event);
    const seq = await this.kv.incr(this.seqKey);
    await this.kv.set(this.evtKey(seq), JSON.stringify(clean), this.ttlMs);
    return clean;
  }

  /** Total number of events ever appended for this site. */
  async count(): Promise<number> {
    const raw = await this.kv.get(this.seqKey);
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  /**
   * Read every stored event, oldest first. Bodies that have aged out under
   * a TTL (or were deleted) are skipped. This is the export the CLI report
   * and the HTML dashboard consume offline.
   */
  async export(): Promise<InsightEvent[]> {
    const n = await this.count();
    const out: InsightEvent[] = [];
    for (let i = 1; i <= n; i++) {
      const raw = await this.kv.get(this.evtKey(i));
      if (raw == null) continue;
      try {
        out.push(JSON.parse(raw) as InsightEvent);
      } catch {
        // A corrupt entry is dropped rather than aborting the whole export.
      }
    }
    return out;
  }

  /** Delete every event and reset the counter. Best-effort. */
  async clear(): Promise<void> {
    const n = await this.count();
    for (let i = 1; i <= n; i++) {
      await this.kv.delete(this.evtKey(i));
    }
    await this.kv.delete(this.seqKey);
  }
}

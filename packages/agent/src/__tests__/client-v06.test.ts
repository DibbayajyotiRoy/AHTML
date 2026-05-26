/**
 * v0.6.0 — typed errors, retry, timeout, coalescing, onEvent.
 *
 * These tests use a synthetic `fetch` override so we never touch the network
 * and the retry/timing behavior is deterministic.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { AHTMLClient, AHTMLError, type ClientEvent } from '../index.js';
import { snapshot, toCompact } from '@ahtmljs/schema';

function snap(url: string): string {
  return toCompact(snapshot(url, 'home').build());
}

function ok(body: string, ct = 'application/ahtml+text', headers: Record<string, string> = {}): Response {
  return new Response(body, { status: 200, headers: { 'content-type': ct, ...headers } });
}

function status(s: number, body = '', headers: Record<string, string> = {}): Response {
  return new Response(body, { status: s, headers });
}

describe('AHTMLClient v0.6 — typed errors', () => {
  test('401 → AHTMLError(AUTH_REQUIRED) with hint', async () => {
    const c = new AHTMLClient({ fetch: async () => status(401, 'no token') });
    try {
      await c.fetch('https://x.com/p', { retry: false });
      assert.fail('expected throw');
    } catch (err) {
      assert.ok(AHTMLError.is(err, 'AUTH_REQUIRED'));
      const e = err as AHTMLError;
      assert.equal(e.status, 401);
      assert.match(e.hint!, /bearer/i);
    }
  });

  test('403 → POLICY_DENIED', async () => {
    const c = new AHTMLClient({ fetch: async () => status(403) });
    try {
      await c.fetch('https://x.com/p', { retry: false });
      assert.fail();
    } catch (err) {
      assert.ok(AHTMLError.is(err, 'POLICY_DENIED'));
    }
  });

  test('500 → HTTP_STATUS, retryable', async () => {
    const c = new AHTMLClient({ fetch: async () => status(500) });
    try {
      await c.fetch('https://x.com/p', { retry: false });
      assert.fail();
    } catch (err) {
      assert.ok(AHTMLError.is(err, 'HTTP_STATUS'));
      assert.equal((err as AHTMLError).status, 500);
      assert.equal((err as AHTMLError).retryable, true);
    }
  });

  test('429 → RATE_LIMITED with retryAfterMs parsed from Retry-After (seconds)', async () => {
    const c = new AHTMLClient({ fetch: async () => status(429, '', { 'retry-after': '12' }) });
    try {
      await c.fetch('https://x.com/p', { retry: false });
      assert.fail();
    } catch (err) {
      assert.ok(AHTMLError.is(err, 'RATE_LIMITED'));
      assert.equal((err as AHTMLError).retryAfterMs, 12_000);
    }
  });

  test('network failure → AHTMLError(NETWORK) with cause', async () => {
    const c = new AHTMLClient({ fetch: async () => { throw new TypeError('ENOTFOUND'); } });
    try {
      await c.fetch('https://x.com/p', { retry: false });
      assert.fail();
    } catch (err) {
      assert.ok(AHTMLError.is(err, 'NETWORK'));
      assert.ok((err as AHTMLError).cause instanceof TypeError);
    }
  });

  test('server returns a structurally-invalid snapshot → CACHE_POISONED, cache untouched', async () => {
    let calls = 0;
    const c = new AHTMLClient({
      fetch: async () => {
        calls++;
        // missing url/fetched_at — validate() will flag both as errors
        return ok('@ahtml 0.1\n@page_type home\n', 'application/ahtml+text');
      },
    });
    try {
      await c.fetch('https://x.com/p', { retry: false });
      assert.fail();
    } catch (err) {
      assert.ok(AHTMLError.is(err, 'CACHE_POISONED'));
    }
    // Next call must NOT serve cached garbage — issue another fetch.
    try {
      await c.fetch('https://x.com/p', { retry: false });
    } catch { /* ignore */ }
    assert.equal(calls, 2, 'second call should re-fetch, not serve poisoned cache');
  });
});

describe('AHTMLClient v0.6 — retry policy', () => {
  test('500 → 500 → 200 succeeds with retry on by default(3 attempts)', async () => {
    let n = 0;
    const c = new AHTMLClient({
      fetch: async () => {
        n++;
        if (n < 3) return status(500);
        return ok(snap('https://x.com/p'));
      },
    });
    const s = await c.fetch('https://x.com/p', {
      retry: { attempts: 3, baseDelayMs: 1, jitter: false, on: ['HTTP_STATUS'] },
    });
    assert.equal(s.url, 'https://x.com/p');
    assert.equal(n, 3, 'three attempts total');
  });

  test('retry honors Retry-After header (seconds form) verbatim', async () => {
    let n = 0;
    const timestamps: number[] = [];
    const c = new AHTMLClient({
      fetch: async () => {
        n++;
        timestamps.push(Date.now());
        if (n === 1) return status(429, '', { 'retry-after': '1' });
        return ok(snap('https://x.com/p'));
      },
    });
    const t0 = Date.now();
    await c.fetch('https://x.com/p', {
      retry: { attempts: 3, baseDelayMs: 1, jitter: false, respectRetryAfter: true, on: ['RATE_LIMITED'] },
    });
    const elapsed = Date.now() - t0;
    assert.ok(elapsed >= 900, `expected ≥ 900ms (Retry-After: 1), got ${elapsed}ms`);
  });

  test('429 without Retry-After falls back to exponential backoff', async () => {
    let n = 0;
    const c = new AHTMLClient({
      fetch: async () => {
        n++;
        if (n < 2) return status(429); // no retry-after header
        return ok(snap('https://x.com/p'));
      },
    });
    const t0 = Date.now();
    await c.fetch('https://x.com/p', {
      retry: { attempts: 3, baseDelayMs: 50, jitter: false, on: ['RATE_LIMITED'] },
    });
    const elapsed = Date.now() - t0;
    assert.ok(elapsed >= 40, `expected ≥ 40ms backoff, got ${elapsed}ms`);
  });

  test('retry: false disables retries entirely', async () => {
    let n = 0;
    const c = new AHTMLClient({
      fetch: async () => { n++; return status(503); },
    });
    try {
      await c.fetch('https://x.com/p', { retry: false });
      assert.fail();
    } catch { /* expected */ }
    assert.equal(n, 1, 'exactly one attempt with retry disabled');
  });

  test('non-retryable code (AUTH_REQUIRED) does not retry even when configured to', async () => {
    let n = 0;
    const c = new AHTMLClient({
      fetch: async () => { n++; return status(401); },
    });
    try {
      await c.fetch('https://x.com/p', {
        retry: { attempts: 5, baseDelayMs: 1, jitter: false, on: ['HTTP_STATUS', 'RATE_LIMITED'] },
      });
      assert.fail();
    } catch { /* expected */ }
    assert.equal(n, 1, '401 is not in retry.on so it terminates immediately');
  });
});

describe('AHTMLClient v0.6 — timeout', () => {
  test('request that never resolves aborts after timeout and throws TIMEOUT', async () => {
    const c = new AHTMLClient({
      timeout: 30,
      fetch: (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = init?.signal;
          signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    });
    try {
      await c.fetch('https://x.com/p', { retry: false });
      assert.fail();
    } catch (err) {
      assert.ok(AHTMLError.is(err, 'TIMEOUT'));
      assert.match((err as AHTMLError).message, /30ms/);
    }
  });
});

describe('AHTMLClient v0.6 — request coalescing', () => {
  test('100 parallel fetch(url) calls produce exactly 1 network request', async () => {
    let calls = 0;
    let resolveFetch: (v: Response) => void;
    const pending = new Promise<Response>((r) => { resolveFetch = r; });
    const c = new AHTMLClient({
      fetch: async () => {
        calls++;
        return pending;
      },
    });

    const ps = Array.from({ length: 100 }, () => c.fetch('https://x.com/p', { retry: false }));
    // Resolve the single in-flight fetch with a valid snapshot.
    resolveFetch!(ok(snap('https://x.com/p')));
    const results = await Promise.all(ps);
    assert.equal(calls, 1, 'coalesced to one network call');
    // All callers receive the same snapshot.
    assert.equal(new Set(results).size, 1);
  });

  test('coalesce: false opts out — each call is its own request', async () => {
    let calls = 0;
    const c = new AHTMLClient({
      fetch: async () => {
        calls++;
        return ok(snap('https://x.com/p'));
      },
    });
    await Promise.all([
      c.fetch('https://x.com/p', { retry: false, coalesce: false, noCache: true }),
      c.fetch('https://x.com/p', { retry: false, coalesce: false, noCache: true }),
    ]);
    assert.equal(calls, 2);
  });
});

describe('AHTMLClient v0.6 — onEvent observability hook', () => {
  test('emits request / cache_miss on first fetch, cache_hit on second within TTL', async () => {
    const events: ClientEvent[] = [];
    const c = new AHTMLClient({
      onEvent: (e) => events.push(e),
      fetch: async () => ok(toCompact(snapshot('https://x.com/p', 'home').ttl(3600).build())),
    });
    await c.fetch('https://x.com/p', { retry: false });
    await c.fetch('https://x.com/p', { retry: false });
    const types = events.map((e) => e.type);
    assert.ok(types.includes('request'));
    assert.ok(types.includes('cache_miss'));
    assert.ok(types.includes('cache_hit'));
  });

  test('emits coalesced event when a parallel call reuses an in-flight promise', async () => {
    const events: ClientEvent[] = [];
    let resolveFetch: (v: Response) => void;
    const pending = new Promise<Response>((r) => { resolveFetch = r; });
    const c = new AHTMLClient({
      onEvent: (e) => events.push(e),
      fetch: async () => pending,
    });
    const a = c.fetch('https://x.com/p', { retry: false });
    const b = c.fetch('https://x.com/p', { retry: false });
    resolveFetch!(ok(snap('https://x.com/p')));
    await Promise.all([a, b]);
    assert.ok(events.some((e) => e.type === 'coalesced'));
  });

  test('emits retry event with attempt, delayMs, code', async () => {
    const events: ClientEvent[] = [];
    let n = 0;
    const c = new AHTMLClient({
      onEvent: (e) => events.push(e),
      fetch: async () => {
        n++;
        if (n === 1) return status(503);
        return ok(snap('https://x.com/p'));
      },
    });
    await c.fetch('https://x.com/p', {
      retry: { attempts: 3, baseDelayMs: 1, jitter: false, on: ['HTTP_STATUS'] },
    });
    const retry = events.find((e) => e.type === 'retry');
    assert.ok(retry, 'retry event was emitted');
    assert.equal((retry as { code: string }).code, 'HTTP_STATUS');
  });

  test('a throwing onEvent does not break the request', async () => {
    const c = new AHTMLClient({
      onEvent: () => { throw new Error('logger blew up'); },
      fetch: async () => ok(snap('https://x.com/p')),
    });
    const s = await c.fetch('https://x.com/p', { retry: false });
    assert.equal(s.url, 'https://x.com/p');
  });
});

describe('AHTMLClient v0.6 — back-compat with v0.5 callers', () => {
  test('the no-options form still works (defaults retain v0.5 behavior)', async () => {
    const c = new AHTMLClient({
      fetch: async () => ok(snap('https://x.com/p')),
    });
    const s = await c.fetch('https://x.com/p');
    assert.equal(s.url, 'https://x.com/p');
  });
});

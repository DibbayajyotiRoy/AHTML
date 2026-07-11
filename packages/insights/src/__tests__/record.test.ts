/**
 * T5.2 / T5.5 — event recording across every KV backend.
 *
 * The SAME recording assertions run against all three `@ahtmljs/kv`
 * backends — in-memory, Cloudflare KV (mock namespace), and Upstash Redis
 * (mock client) — parameterized exactly the way `packages/kv/src/__tests__`
 * fakes the two remote backends. If the recorder ever reaches for a
 * backend-specific API, one of these three columns goes red.
 *
 * Covers snapshot fetches (ok / not_modified / format negotiation), the
 * Next `withInsights` wrapper, the Hono middleware, and the x402 flow's
 * three distinct outcomes (invoked / refused / paid).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryKvStore, type KvStore } from '@ahtmljs/kv';
import { UpstashKvStore } from '@ahtmljs/kv/upstash';
import { CloudflareKvStore } from '@ahtmljs/kv/cloudflare';
import { buildX402Response, type Action } from '@ahtmljs/schema';

import { createInsights } from '../recorder.js';
import { summarize } from '../report.js';

/* ─── backend fakes (mirrors packages/kv/src/__tests__/kv.test.ts) ─────────── */

class FakeUpstash {
  store = new Map<string, string>();
  async get(key: string) { return this.store.has(key) ? this.store.get(key)! : null; }
  async set(key: string, value: string, _opts?: { ex?: number; px?: number }) { this.store.set(key, value); }
  async del(key: string) { this.store.delete(key); }
  async incr(key: string) { const n = parseInt(this.store.get(key) ?? '0', 10) + 1; this.store.set(key, String(n)); return n; }
  async expire(_key: string, _seconds: number) { /* no-op */ }
}

class FakeKVNamespace {
  store = new Map<string, string>();
  async get(key: string, _opts?: { type?: 'text' }) { return this.store.has(key) ? this.store.get(key)! : null; }
  async put(key: string, value: string, _opts?: { expirationTtl?: number }) { this.store.set(key, value); }
  async delete(key: string) { this.store.delete(key); }
}

const BACKENDS: Array<{ name: string; make: () => KvStore }> = [
  { name: 'memory', make: () => new InMemoryKvStore() },
  { name: 'cloudflare-mock', make: () => new CloudflareKvStore(new FakeKVNamespace()) },
  { name: 'upstash-mock', make: () => new UpstashKvStore(new FakeUpstash()) },
];

/* ─── fixtures ─────────────────────────────────────────────────────────────── */

const SITE = 'https://shop.example.com';
const BOT_UA = 'Mozilla/5.0 (compatible; ClaudeBot/1.0)';

function snapshotFetch(path: string, ct: string, status = 200): [Request, Response] {
  const req = new Request(`${SITE}${path}`, { method: 'GET', headers: { 'user-agent': BOT_UA } });
  const res = status === 304
    ? new Response(null, { status: 304 })
    : new Response('body', { status, headers: { 'content-type': ct } });
  return [req, res];
}

const PRICED_ACTION: Action = {
  id: 'buy_now',
  method: 'POST',
  execute_url: '/api/checkout',
  cost: { amount: 49.99, currency: 'USD', category: 'purchase' },
} as Action;

/* ─── the shared suite ─────────────────────────────────────────────────────── */

for (const backend of BACKENDS) {
  describe(`recording on ${backend.name} KV`, () => {
    test('records snapshot fetches with negotiated format and outcome', async () => {
      const kv = backend.make();
      const ins = createInsights({ kv, site: SITE });

      await ins.record(...snapshotFetch('/ahtml/store/products/a', 'application/ahtml+json'));
      await ins.record(...snapshotFetch('/ahtml/store/products/b', 'text/markdown; charset=utf-8'));
      await ins.record(...snapshotFetch('/ahtml/store/products/a', 'application/ahtml+text'));
      await ins.record(...snapshotFetch('/ahtml/store/products/a', '', 304));

      const events = await ins.export();
      assert.equal(events.length, 4);

      const s = summarize(events);
      assert.equal(s.byOutcome.ok, 3);
      assert.equal(s.byOutcome.not_modified, 1);
      assert.equal(s.byFormat.json, 1);
      assert.equal(s.byFormat.markdown, 1);
      assert.equal(s.byFormat.compact, 1);
      // Every request is the ClaudeBot UA → declared_bot, stored as the token.
      assert.equal(s.byKind.declared_bot, 4);
      assert.equal(events[0]!.agent.id, 'ClaudeBot');
      // Busiest path is /a (hit 3x).
      assert.equal(s.topPaths[0]!.path, '/ahtml/store/products/a');
      assert.equal(s.topPaths[0]!.count, 3);
    });

    test('never stores query strings — only the pathname', async () => {
      const kv = backend.make();
      const ins = createInsights({ kv, site: SITE });
      const req = new Request(`${SITE}/ahtml/search?q=secret-term&token=abc`, { method: 'GET' });
      await ins.record(req, new Response('x', { status: 200, headers: { 'content-type': 'application/ahtml+json' } }));
      const events = await ins.export();
      assert.equal(events[0]!.path, '/ahtml/search');
    });

    test('withInsights (Next wrapper) records each handled request', async () => {
      const kv = backend.make();
      const ins = createInsights({ kv, site: SITE });
      const handler = ins.withInsights(async (_req: Request) =>
        new Response('{}', { status: 200, headers: { 'content-type': 'application/ahtml+json' } }),
      );
      const res = await handler(new Request(`${SITE}/ahtml/home`, { method: 'GET' }));
      assert.equal(res.status, 200);
      assert.equal(await ins.store.count(), 1);
      const events = await ins.export();
      assert.equal(events[0]!.outcome, 'ok');
      assert.equal(events[0]!.format, 'json');
    });

    test('honoMiddleware records after next() resolves', async () => {
      const kv = backend.make();
      const ins = createInsights({ kv, site: SITE });
      const mw = ins.honoMiddleware();
      const raw = new Request(`${SITE}/ahtml/home`, { method: 'GET' });
      const c: { req: { raw: Request }; res?: Response } = { req: { raw } };
      await mw(c, async () => {
        c.res = new Response('x', { status: 200, headers: { 'content-type': 'text/markdown' } });
      });
      const events = await ins.export();
      assert.equal(events.length, 1);
      assert.equal(events[0]!.format, 'markdown');
      assert.equal(events[0]!.outcome, 'ok');
    });

    test('x402 flow counts invoked / refused / paid distinctly (T5.5)', async () => {
      const kv = backend.make();
      const ins = createInsights({ kv, site: SITE });

      // 1. A free action invoked successfully.
      await ins.record(
        new Request(`${SITE}/api/cart`, { method: 'POST' }),
        new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
      );

      // 2. A priced action invoked WITHOUT payment → real x402 402 → refused.
      const refuse = buildX402Response(PRICED_ACTION);
      assert.equal(refuse.status, 402);
      await ins.record(new Request(`${SITE}/api/checkout`, { method: 'POST' }), refuse);

      // 3. The agent pays and retries with X-Payment → 200 → paid.
      await ins.record(
        new Request(`${SITE}/api/checkout`, { method: 'POST', headers: { 'x-payment': 'eyJwYWlkIjp0cnVlfQ' } }),
        new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
      );

      const s = summarize(await ins.export());
      assert.equal(s.actions.invoked, 1, 'invoked counted once');
      assert.equal(s.actions.refused, 1, 'refused (402) counted once');
      assert.equal(s.actions.paid, 1, 'paid (x-payment + 2xx) counted once');
      // The three outcomes are genuinely distinct.
      assert.equal(s.byOutcome.invoked + s.byOutcome.refused + s.byOutcome.paid, 3);
    });

    test('denied and error outcomes are derived from status', async () => {
      const kv = backend.make();
      const ins = createInsights({ kv, site: SITE });
      await ins.record(
        new Request(`${SITE}/ahtml/home`, { method: 'GET' }),
        new Response('no', { status: 403 }),
      );
      await ins.record(
        new Request(`${SITE}/ahtml/home`, { method: 'GET' }),
        new Response('boom', { status: 500 }),
      );
      const s = summarize(await ins.export());
      assert.equal(s.byOutcome.denied, 1);
      assert.equal(s.byOutcome.error, 1);
    });

    test('an explicit outcome override wins over status derivation', async () => {
      const kv = backend.make();
      const ins = createInsights({ kv, site: SITE });
      // A 200 that the safety gate actually refused — status alone can't show it.
      await ins.record(
        new Request(`${SITE}/api/delete`, { method: 'POST' }),
        new Response('{}', { status: 200 }),
        { outcome: 'refused' },
      );
      const s = summarize(await ins.export());
      assert.equal(s.actions.refused, 1);
      assert.equal(s.actions.invoked, 0);
    });
  });
}

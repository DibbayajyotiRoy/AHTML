/**
 * T5.3 — privacy guarantee.
 *
 * Inject unique canary strings into a request's body, query string, a cookie
 * header, and a custom header (plus the User-Agent), record it through the
 * middleware, then JSON.stringify the ENTIRE stored KV state and assert not a
 * single canary substring survives. Only method, path, agent identity,
 * format, timestamp, and outcome may ever be stored.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import type { KvStore } from '@ahtmljs/kv';
import { createInsights } from '../recorder.js';

const SITE = 'https://shop.example.com';

const CANARIES = {
  body: 'CANARY_BODY_9f3a1c2b',
  query: 'CANARY_QUERY_7b2e4d5a',
  cookie: 'CANARY_COOKIE_1a8f6c0d',
  header: 'CANARY_HEADER_5d0b9e4f',
  ua: 'CANARY_UA_3c7f2a11',
  card: '4111111111111111', // a card-shaped secret in the body
};

/**
 * A full KvStore that keeps its own map AND a complete write history, so a
 * single JSON.stringify captures the entire stored state — every key, every
 * value, and every value ever written (even if later overwritten/deleted).
 */
class CapturingKv implements KvStore {
  private m = new Map<string, string>();
  writes: Array<{ op: string; key: string; value?: string }> = [];
  async get(key: string): Promise<string | null> { return this.m.has(key) ? this.m.get(key)! : null; }
  async set(key: string, value: string): Promise<void> { this.writes.push({ op: 'set', key, value }); this.m.set(key, value); }
  async delete(key: string): Promise<void> { this.writes.push({ op: 'delete', key }); this.m.delete(key); }
  async incr(key: string): Promise<number> {
    const n = parseInt(this.m.get(key) ?? '0', 10) + 1;
    this.writes.push({ op: 'incr', key, value: String(n) });
    this.m.set(key, String(n));
    return n;
  }
  entireState(): string {
    return JSON.stringify({ entries: [...this.m.entries()], writes: this.writes });
  }
}

function poisonedRequest(method: string): Request {
  const init: RequestInit = {
    method,
    headers: {
      'content-type': 'application/json',
      cookie: `session=${CANARIES.cookie}; theme=dark`,
      'x-secret-header': CANARIES.header,
      authorization: `Bearer ${CANARIES.header}`,
      'user-agent': `Mozilla/5.0 (X11) ${CANARIES.ua}`,
    },
  };
  if (method !== 'GET' && method !== 'HEAD') {
    init.body = JSON.stringify({ note: CANARIES.body, card: CANARIES.card });
  }
  return new Request(`${SITE}/ahtml/checkout?token=${CANARIES.query}&card=${CANARIES.card}`, init);
}

function assertNoCanaries(blob: string, where: string): void {
  for (const [name, value] of Object.entries(CANARIES)) {
    assert.ok(!blob.includes(value), `${where} leaked the ${name} canary: ${value}`);
  }
}

describe('privacy guarantee (T5.3)', () => {
  test('no canary from body/query/cookie/header survives in the KV state (Next wrapper)', async () => {
    const kv = new CapturingKv();
    const ins = createInsights({ kv, site: SITE });

    const handler = ins.withInsights(async (_req: Request) =>
      new Response('{}', { status: 200, headers: { 'content-type': 'application/ahtml+json' } }),
    );
    await handler(poisonedRequest('POST'));

    assertNoCanaries(kv.entireState(), 'the entire KV state');

    // And the reconstructed events carry only the allowed fields.
    const events = await ins.export();
    assert.equal(events.length, 1);
    const e = events[0]!;
    assert.deepEqual(Object.keys(e).sort(), ['agent', 'format', 'method', 'outcome', 'path', 'ts']);
    assert.equal(e.path, '/ahtml/checkout'); // query stripped
    assertNoCanaries(JSON.stringify(events), 'the exported events');
  });

  test('no canary survives through the Hono middleware either', async () => {
    const kv = new CapturingKv();
    const ins = createInsights({ kv, site: SITE });
    const mw = ins.honoMiddleware();

    const raw = poisonedRequest('GET');
    const c: { req: { raw: Request }; res?: Response } = { req: { raw } };
    await mw(c, async () => {
      c.res = new Response('x', { status: 200, headers: { 'content-type': 'text/markdown' } });
    });

    assertNoCanaries(kv.entireState(), 'the entire KV state (hono)');
    const events = await ins.export();
    assert.equal(events[0]!.path, '/ahtml/checkout');
    assert.equal(events[0]!.agent.kind, 'human'); // unknown UA → human, UA not stored
  });

  test('a verified agent stores its proven identity but nothing else from the request', async () => {
    const kv = new CapturingKv();
    const ins = createInsights({ kv, site: SITE });
    // Manually stamp a verified classification so we do not need a live key here;
    // the point is that even WITH an identity, no request PII leaks.
    await ins.record(
      poisonedRequest('POST'),
      new Response('{}', { status: 200, headers: { 'content-type': 'application/ahtml+json' } }),
      { classification: { kind: 'verified_agent', identity: { id: 'did:web:trusted-bot.example.com' } } },
    );
    const state = kv.entireState();
    assertNoCanaries(state, 'verified-agent KV state');
    assert.ok(state.includes('did:web:trusted-bot.example.com'), 'the proven identity IS stored');
  });
});

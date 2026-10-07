import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot } from '@ahtmljs/schema';
import { createA2ARoute } from '../a2a.js';
import { withAHTML } from '../index.js';

const URL_ = 'https://shop.com/ahtml/a2a';
const snap = () =>
  snapshot('https://shop.com/', 'home')
    .action({ id: 'subscribe', category: 'create' })
    .action({ id: 'buy', category: 'transact', cost: { amount: 9, currency: 'USD', category: 'purchase' } })
    .build();

const post = (route: ReturnType<typeof createA2ARoute>, params: unknown) =>
  route.POST(
    new Request(URL_, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'message/send', params }),
    }),
  );

describe('createA2ARoute', () => {
  test('GET serves the agent card, POST speaks JSON-RPC', async () => {
    const calls: string[] = [];
    const route = createA2ARoute(() => snap(), { url: URL_, invoke: async (id) => (calls.push(id), 1) });
    const card = (await (await route.GET(new Request('https://shop.com/.well-known/agent-card.json'))).json()) as any;
    assert.deepEqual(card.skills.map((s: any) => s.id), ['read_snapshot', 'subscribe', 'buy']);
    const ok = (await (await post(route, { message: { parts: [{ kind: 'data', data: { skill: 'subscribe' } }] } })).json()) as any;
    assert.equal(ok.result.status.state, 'completed');
    const gated = (await (await post(route, { message: { parts: [{ kind: 'data', data: { skill: 'buy' } }] } })).json()) as any;
    assert.equal(gated.result.status.state, 'input-required');
    assert.deepEqual(calls, ['subscribe']);
  });

  test('agents_welcome:false returns 403', async () => {
    withAHTML({}, { site: 'https://shop.com', policy: { agents_welcome: false } });
    try {
      const route = createA2ARoute(() => snap(), { url: URL_ });
      assert.equal((await route.GET(new Request(URL_))).status, 403);
    } finally {
      withAHTML({}, { site: 'https://shop.com', policy: { agents_welcome: true } });
    }
  });
});

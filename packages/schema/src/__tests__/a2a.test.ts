import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot } from '../snapshot.js';
import { buildWellKnown } from '../emit/well-known.js';
import { toA2AAgentCard } from '../emit/a2a.js';
import { createA2AHandler } from '../http/a2a.js';

const URL_ = 'https://shop.example.com/a2a';

const snap = () =>
  snapshot('https://shop.example.com/p/mbp', 'product_detail')
    .add({ id: 'product:mbp', type: 'product', name: 'MacBook' })
    .action({
      id: 'add_to_cart',
      label: 'Add to cart',
      category: 'update',
      input: { type: 'object', properties: { sku: { type: 'string' }, qty: { type: 'number' } } },
      reversible: { reversible: true, window: 'PT1H' },
    })
    .action({
      id: 'purchase',
      label: 'Buy now',
      category: 'transact',
      cost: { amount: 1999, currency: 'USD', category: 'purchase' },
      reversible: { reversible: true, window: 'P30D', policy: 'full_refund' },
      side_effects: ['charge_card'],
      confirmation: 'required',
    })
    .action({ id: 'delete_account', label: 'Delete account', category: 'delete', reversible: { reversible: false } })
    .build();

function setup(withInvoke = true) {
  const calls: Array<[string, unknown]> = [];
  const handler = createA2AHandler(() => snap(), {
    url: URL_,
    ...(withInvoke
      ? {
          invoke: async (id: string, input: unknown) => {
            calls.push([id, input]);
            return { ok: true, id };
          },
        }
      : {}),
  });
  return { handler, calls };
}

let n = 0;
async function rpc(
  handler: (r: Request) => Promise<Response>,
  method: string,
  params: unknown,
  headers: Record<string, string> = {},
) {
  const res = await handler(
    new Request(URL_, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++n, method, params }),
    }),
  );
  return (await res.json()) as any;
}

const data = (skill: string, input?: unknown) => ({
  message: { messageId: 'm1', role: 'user', parts: [{ kind: 'data', data: { skill, input } }] },
});

describe('toA2AAgentCard', () => {
  const card = toA2AAgentCard(snap(), { url: URL_ });

  test('has every required AgentCard field (v1.0 + v0.3)', () => {
    for (const k of ['name', 'description', 'version', 'supportedInterfaces', 'capabilities', 'defaultInputModes', 'defaultOutputModes', 'skills']) {
      assert.ok(k in card, `missing ${k}`);
    }
    // v0.3 required connection fields, kept for pre-1.0 clients
    assert.equal(card.protocolVersion, '0.3.0');
    assert.equal(card.url, URL_);
    assert.equal(card.preferredTransport, 'JSONRPC');
    assert.deepEqual(
      card.supportedInterfaces.map((i) => [i.url, i.protocolBinding, i.protocolVersion]),
      [[URL_, 'JSONRPC', '1.0'], [URL_, 'JSONRPC', '0.3']],
    );
  });

  test('legacy:false is a pure 1.0 card', () => {
    const c = toA2AAgentCard(snap(), { url: URL_, legacy: false });
    assert.equal(c.supportedInterfaces.length, 1);
    assert.ok(!('protocolVersion' in c) && !('url' in c) && !('preferredTransport' in c));
  });

  test('one skill per action plus read_snapshot; skills have required fields', () => {
    assert.deepEqual(card.skills.map((s) => s.id), ['read_snapshot', 'add_to_cart', 'purchase', 'delete_account']);
    for (const s of card.skills) {
      assert.ok(s.id && s.name && s.description);
      assert.ok(Array.isArray(s.tags) && s.tags.length > 0);
    }
    const buy = card.skills.find((s) => s.id === 'purchase')!;
    assert.ok(buy.tags.includes('requires-confirmation'));
    assert.match(buy.description, /metadata\.confirm=true/);
    assert.ok(!card.skills.find((s) => s.id === 'add_to_cart')!.tags.includes('requires-confirmation'));
    assert.deepEqual(JSON.parse(card.skills.find((s) => s.id === 'add_to_cart')!.examples![0]!), {
      skill: 'add_to_cart',
      input: { sku: '', qty: 0 },
    });
  });

  test('version/provider options', () => {
    const c = toA2AAgentCard(snap(), { url: URL_, version: '2.3.4', provider: { organization: 'Acme', url: 'https://acme.test' } });
    assert.equal(c.version, '2.3.4');
    assert.deepEqual(c.provider, { organization: 'Acme', url: 'https://acme.test' });
  });

  test('well-known advertises the card only when emit_a2a is set', () => {
    assert.equal(buildWellKnown({ site: 'https://x.com' }).endpoints.a2a, undefined);
    assert.equal(
      buildWellKnown({ site: 'https://x.com/', emit_a2a: true }).endpoints.a2a,
      'https://x.com/.well-known/agent-card.json',
    );
  });
});

describe('createA2AHandler', () => {
  test('GET serves the agent card as JSON', async () => {
    const { handler } = setup();
    const res = await handler(new Request(URL_));
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type')!, /application\/json/);
    const card = (await res.json()) as any;
    assert.equal(card.skills.length, 4);
  });

  test('other HTTP methods are 405', async () => {
    const { handler } = setup();
    assert.equal((await handler(new Request(URL_, { method: 'DELETE' }))).status, 405);
  });

  test('message/send with a text part returns the snapshot (0.3 shape)', async () => {
    const { handler } = setup();
    const r = await rpc(handler, 'message/send', {
      message: { messageId: 'm', role: 'user', parts: [{ kind: 'text', text: 'what is here?' }] },
    });
    assert.equal(r.result.kind, 'task');
    assert.equal(r.result.status.state, 'completed');
    assert.equal(r.result.status.message.role, 'agent');
    const part = r.result.artifacts[0].parts[0];
    assert.equal(part.kind, 'text');
    assert.match(part.text, /MacBook/);
  });

  test('SendMessage returns the 1.0 shape ({task}, TASK_STATE_*, no kind)', async () => {
    const { handler } = setup();
    const r = await rpc(handler, 'SendMessage', {
      message: { messageId: 'm', role: 'ROLE_USER', parts: [{ text: 'hi' }] },
    });
    const task = r.result.task;
    assert.equal(task.status.state, 'TASK_STATE_COMPLETED');
    assert.equal(task.status.message.role, 'ROLE_AGENT');
    assert.equal('kind' in task, false);
    assert.equal(task.artifacts[0].parts[0].mediaType, 'text/plain');
    assert.match(task.artifacts[0].parts[0].text, /MacBook/);
  });

  test('read_snapshot honours input.format=markdown', async () => {
    const { handler } = setup();
    const r = await rpc(handler, 'message/send', data('read_snapshot', { format: 'markdown' }));
    assert.match(r.result.artifacts[0].parts[0].text, /^#/m);
  });

  test('safe action executes through invoke', async () => {
    const { handler, calls } = setup();
    const r = await rpc(handler, 'message/send', data('add_to_cart', { sku: 'mbp', qty: 1 }));
    assert.deepEqual(calls, [['add_to_cart', { sku: 'mbp', qty: 1 }]]);
    assert.equal(r.result.status.state, 'completed');
    assert.deepEqual(r.result.artifacts[0].parts[0].data, { skill: 'add_to_cart', result: { ok: true, id: 'add_to_cart' } });
  });

  test('priced action: input-required with simulation, invoke NOT called', async () => {
    const { handler, calls } = setup();
    const r = await rpc(handler, 'message/send', data('purchase', { sku: 'mbp' }));
    assert.equal(calls.length, 0);
    assert.equal(r.result.status.state, 'input-required');
    const sim = r.result.artifacts[0].parts[0].data;
    assert.equal(sim.simulated, true);
    assert.equal(sim.action_id, 'purchase');
    assert.deepEqual(sim.would_charge, { amount: 1999, currency: 'USD' });
    assert.deepEqual(sim.reversal, { reversible: true, window: 'P30D', policy: 'full_refund' });
    assert.ok(sim.would_execute.requires.includes('priced'));
    assert.match(r.result.status.message.parts[0].text, /confirm=true/);
  });

  test('irreversible action is gated too', async () => {
    const { handler, calls } = setup();
    const r = await rpc(handler, 'SendMessage', data('delete_account'));
    assert.equal(calls.length, 0);
    assert.equal(r.result.task.status.state, 'TASK_STATE_INPUT_REQUIRED');
  });

  test('confirm=true (params.metadata) executes the priced action', async () => {
    const { handler, calls } = setup();
    const r = await rpc(handler, 'message/send', { ...data('purchase', { sku: 'mbp' }), metadata: { confirm: true } });
    assert.deepEqual(calls, [['purchase', { sku: 'mbp' }]]);
    assert.equal(r.result.status.state, 'completed');
  });

  test('confirm=true (message.metadata) also counts; truthy strings do not', async () => {
    const { handler, calls } = setup();
    const withMsgMeta = data('purchase');
    (withMsgMeta.message as any).metadata = { confirm: true };
    assert.equal((await rpc(handler, 'message/send', withMsgMeta)).result.status.state, 'completed');
    assert.equal(calls.length, 1);
    const r = await rpc(handler, 'message/send', { ...data('purchase'), metadata: { confirm: 'true' } });
    assert.equal(r.result.status.state, 'input-required');
    assert.equal(calls.length, 1);
  });

  test('input-required task can be continued with confirm (same task id)', async () => {
    const { handler, calls } = setup();
    const first = await rpc(handler, 'message/send', data('purchase', { sku: 'mbp' }));
    const second = await rpc(handler, 'message/send', {
      message: { ...data('purchase', { sku: 'mbp' }).message, taskId: first.result.id },
      metadata: { confirm: true },
    });
    assert.equal(second.result.id, first.result.id);
    assert.equal(second.result.contextId, first.result.contextId);
    assert.equal(second.result.status.state, 'completed');
    assert.equal(calls.length, 1);
    // completed task can't be restarted
    const third = await rpc(handler, 'message/send', {
      message: { ...data('purchase').message, taskId: first.result.id },
      metadata: { confirm: true },
    });
    assert.equal(third.error.code, -32602);
    assert.equal(calls.length, 1);
  });

  test('without invoke nothing ever executes, even with confirm', async () => {
    const { handler } = setup(false);
    const safe = await rpc(handler, 'message/send', data('add_to_cart', {}));
    assert.equal(safe.result.status.state, 'rejected');
    assert.equal(safe.result.artifacts[0].parts[0].data.simulated, true);
    const priced = await rpc(handler, 'message/send', { ...data('purchase'), metadata: { confirm: true } });
    assert.equal(priced.result.status.state, 'rejected');
    assert.equal(priced.result.artifacts[0].parts[0].data.simulated, true);
    const unconfirmed = await rpc(handler, 'message/send', data('purchase'));
    assert.equal(unconfirmed.result.status.state, 'input-required');
    assert.match(unconfirmed.result.status.message.parts[0].text, /no executor/);
  });

  test('invoke failure becomes a failed task, not a JSON-RPC error', async () => {
    const handler = createA2AHandler(() => snap(), {
      url: URL_,
      invoke: async () => {
        throw new Error('stock exhausted');
      },
    });
    const r = await rpc(handler, 'message/send', data('add_to_cart', {}));
    assert.equal(r.result.status.state, 'failed');
    assert.match(r.result.status.message.parts[0].text, /stock exhausted/);
  });

  test('tasks/get and GetTask return the stored task; unknown id is -32001', async () => {
    const { handler } = setup();
    const sent = await rpc(handler, 'message/send', data('purchase'));
    const got = await rpc(handler, 'tasks/get', { id: sent.result.id });
    assert.equal(got.result.id, sent.result.id);
    assert.equal(got.result.status.state, 'input-required');
    const got1 = await rpc(handler, 'GetTask', { id: sent.result.id });
    assert.equal(got1.result.status.state, 'TASK_STATE_INPUT_REQUIRED');
    assert.equal((await rpc(handler, 'tasks/get', { id: 'nope' })).error.code, -32001);
    assert.equal((await rpc(handler, 'tasks/get', {})).error.code, -32602);
  });

  describe('JSON-RPC errors', () => {
    test('-32700 parse error', async () => {
      const { handler } = setup();
      const res = await handler(new Request(URL_, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{nope' }));
      const r = (await res.json()) as any;
      assert.equal(r.error.code, -32700);
      assert.equal(r.id, null);
    });

    test('-32600 invalid request (not JSON-RPC 2.0 / no method / no id)', async () => {
      const { handler } = setup();
      for (const body of [{ hello: 1 }, { jsonrpc: '1.0', id: 1, method: 'x' }, { jsonrpc: '2.0', id: 1 }, { jsonrpc: '2.0', method: 'message/send' }, [1]]) {
        const res = await handler(new Request(URL_, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
        assert.equal(((await res.json()) as any).error.code, -32600, JSON.stringify(body));
      }
    });

    test('non-JSON content type is rejected (415, -32600)', async () => {
      const { handler } = setup();
      const res = await handler(new Request(URL_, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' }));
      assert.equal(res.status, 415);
      assert.equal(((await res.json()) as any).error.code, -32600);
    });

    test('-32601 method not found (incl. unsupported A2A methods)', async () => {
      const { handler } = setup();
      for (const m of ['nope', 'message/stream', 'SendStreamingMessage', 'tasks/cancel']) {
        assert.equal((await rpc(handler, m, {})).error.code, -32601, m);
      }
    });

    test('-32602 invalid params', async () => {
      const { handler } = setup();
      for (const params of [
        undefined,
        { message: { parts: [] } },
        { message: { parts: [{ kind: 'data', data: { input: {} } }] } },
        { message: { parts: [{ kind: 'data', data: { skill: 'add_to_cart', input: 'str' } }] } },
        data('no_such_skill'),
      ]) {
        const r = await rpc(handler, 'message/send', params);
        assert.equal(r.error.code, -32602, JSON.stringify(params));
      }
    });

    test('-32005 for parts that are neither text nor data', async () => {
      const { handler } = setup();
      const r = await rpc(handler, 'SendMessage', { message: { parts: [{ url: 'https://x/y.png', mediaType: 'image/png' }] } });
      assert.equal(r.error.code, -32005);
    });

    test('-32009 for an unsupported A2A-Version header; 1.0.1 is accepted', async () => {
      const { handler } = setup();
      const p = { message: { parts: [{ text: 'hi' }] } };
      assert.equal((await rpc(handler, 'SendMessage', p, { 'a2a-version': '2.0' })).error.code, -32009);
      assert.equal((await rpc(handler, 'SendMessage', p, { 'a2a-version': '1.0.1' })).result.task.status.state, 'TASK_STATE_COMPLETED');
      assert.equal((await rpc(handler, 'message/send', p, { 'a2a-version': '0.3' })).result.kind, 'task');
    });

    test('-32603 internal error without leaking the cause', async () => {
      const handler = createA2AHandler(() => { throw new Error('secret db password'); }, { url: URL_ });
      const r = await rpc(handler, 'message/send', { message: { parts: [{ text: 'x' }] } });
      assert.equal(r.error.code, -32603);
      assert.doesNotMatch(JSON.stringify(r), /secret/);
    });
  });
});

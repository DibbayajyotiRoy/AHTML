import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { snapshot } from '@ahtmljs/schema';
import { mountAHTML, type AHTMLHonoConfig, type HonoAppLike, type HonoHandler } from '../index.js';

const SITE = 'https://shop.example.com';

const build = (extra: Partial<AHTMLHonoConfig> = {}): AHTMLHonoConfig => ({
  site: SITE,
  policy: { agents_welcome: true },
  routes: [
    { path: '/', page_type: 'home' },
    { path: '/p/demo', page_type: 'product_detail' },
  ],
  async snapshotBuilder(segments, req) {
    const b = snapshot(req.url, segments[0] === 'p' ? 'product_detail' : 'home');
    if (segments[0] === 'p') {
      b.add({ id: 'product:demo', type: 'product', name: 'Demo' }).action({
        id: 'buy',
        category: 'transact',
        cost: { amount: 5, currency: 'USD', category: 'purchase' },
        confirmation: 'required',
      });
    } else {
      b.action({ id: 'subscribe', category: 'create' });
    }
    return b.build();
  },
  ...extra,
});

const send = (app: Hono, params: unknown, method = 'message/send') =>
  app.request(`${SITE}/ahtml/a2a`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });

describe('@ahtmljs/hono A2A bridge', () => {
  test('serves /.well-known/agent-card.json with actions from every route', async () => {
    const app = new Hono();
    mountAHTML(app, build());
    const res = await app.request(`${SITE}/.well-known/agent-card.json`);
    assert.equal(res.status, 200);
    const card = (await res.json()) as any;
    assert.deepEqual(card.skills.map((s: any) => s.id), ['read_snapshot', 'subscribe', 'buy']);
    assert.equal(card.url, `${SITE}/ahtml/a2a`);
    assert.equal(card.supportedInterfaces[0].url, `${SITE}/ahtml/a2a`);
    assert.equal(card.version, '1.0.0');
  });

  test('POST /ahtml/a2a is not shadowed by the /ahtml/* wildcard; read_snapshot works', async () => {
    const app = new Hono();
    mountAHTML(app, build());
    const res = await send(app, { message: { messageId: 'm', role: 'user', parts: [{ kind: 'text', text: 'hi' }] } });
    assert.equal(res.status, 200);
    const r = (await res.json()) as any;
    assert.equal(r.result.status.state, 'completed');
    assert.match(r.result.artifacts[0].parts[0].text, /subscribe/);
  });

  test('default is dry-run only: nothing executes without a2aInvoke', async () => {
    const app = new Hono();
    mountAHTML(app, build());
    const r = (await (await send(app, { message: { parts: [{ kind: 'data', data: { skill: 'buy' } }] }, metadata: { confirm: true } })).json()) as any;
    assert.equal(r.result.status.state, 'rejected');
    assert.equal(r.result.artifacts[0].parts[0].data.simulated, true);
  });

  test('a2aInvoke: safe runs, priced needs confirm', async () => {
    const calls: string[] = [];
    const app = new Hono();
    mountAHTML(app, build({ a2aInvoke: async (id) => (calls.push(id), 'done') }));
    const safe = (await (await send(app, { message: { parts: [{ kind: 'data', data: { skill: 'subscribe' } }] } })).json()) as any;
    assert.equal(safe.result.status.state, 'completed');
    const priced = (await (await send(app, { message: { parts: [{ kind: 'data', data: { skill: 'buy' } }] } })).json()) as any;
    assert.equal(priced.result.status.state, 'input-required');
    assert.deepEqual(calls, ['subscribe']);
    const ok = (await (await send(app, { message: { parts: [{ kind: 'data', data: { skill: 'buy' } }] }, metadata: { confirm: true } })).json()) as any;
    assert.equal(ok.result.status.state, 'completed');
    assert.deepEqual(calls, ['subscribe', 'buy']);
  });

  test('well-known advert is explicit opt-in (a2a:true); a2a:false removes the routes', async () => {
    const wk = async (app: Hono) => ((await (await app.request(`${SITE}/.well-known/ahtml.json`)).json()) as any).endpoints.a2a;

    const dflt = new Hono();
    mountAHTML(dflt, build());
    assert.equal(await wk(dflt), undefined, 'default keeps the manifest byte-equal with other adapters');
    assert.equal((await dflt.request(`${SITE}/.well-known/agent-card.json`)).status, 200);

    const on = new Hono();
    mountAHTML(on, build({ a2a: true }));
    assert.equal(await wk(on), `${SITE}/.well-known/agent-card.json`);

    const off = new Hono();
    mountAHTML(off, build({ a2a: false }));
    assert.equal(await wk(off), undefined);
    assert.equal((await off.request(`${SITE}/.well-known/agent-card.json`)).status, 404);
    assert.equal((await send(off, {})).status, 404);
  });

  test('agents_welcome:false denies the A2A endpoints like the snapshot route', async () => {
    const app = new Hono();
    mountAHTML(app, build({ policy: { agents_welcome: false } }));
    assert.equal((await app.request(`${SITE}/.well-known/agent-card.json`)).status, 403);
    assert.equal((await send(app, {})).status, 403);
  });

  test('app without .post falls back to .all for the RPC route', () => {
    const paths: Array<[string, string]> = [];
    const app: HonoAppLike = {
      get: (p: string, _h: HonoHandler) => void paths.push(['get', p]),
      all: (p: string, _h: HonoHandler) => void paths.push(['all', p]),
    };
    mountAHTML(app, build());
    assert.ok(paths.some(([m, p]) => m === 'all' && p === '/ahtml/a2a'));
    assert.ok(paths.some(([m, p]) => m === 'get' && p === '/.well-known/agent-card.json'));
  });
});

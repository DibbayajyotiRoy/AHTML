/**
 * `ahtml bridge` smoke test — real node:http servers on port 0, no network:
 * a fake AHTML site as the target, the bridge in front of it.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { snapshot, toJson } from '@ahtmljs/schema';
import { startBridge, type RunningBridge } from '../commands/bridge.js';

let site: Server;
let origin: string;
let bridge: RunningBridge;
const hits: Array<{ path: string; body: string }> = [];

before(async () => {
  site = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', origin);
      if (req.method === 'POST') {
        hits.push({ path: url.pathname, body });
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, path: url.pathname }));
      } else if (url.pathname === '/.well-known/ahtml.json') {
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ahtml: '0.1', site: origin }));
      } else {
        const snap = snapshot(`${origin}/`, 'product_detail')
          .add({ id: 'product:mbp', type: 'product', name: 'MacBook Bridge Test' })
          .action({ id: 'add_to_cart', category: 'update', method: 'POST', execute_url: '/api/cart' })
          .action({
            id: 'purchase',
            category: 'transact',
            method: 'POST',
            execute_url: '/api/checkout',
            cost: { amount: 1999, currency: 'USD', category: 'purchase' },
            confirmation: 'required',
          })
          .build();
        res.writeHead(200, { 'content-type': 'application/ahtml+json' }).end(toJson(snap));
      }
    });
  });
  await new Promise<void>((r) => site.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${(site.address() as AddressInfo).port}`;
  bridge = await startBridge(origin, { port: 0 });
});

after(async () => {
  await bridge.close();
  site.closeAllConnections();
  await new Promise<void>((r) => site.close(() => r()));
});

const post = (url: string, body: unknown, headers: Record<string, string> = { 'content-type': 'application/json' }) =>
  fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
const a2a = async (params: unknown, method = 'message/send') =>
  (await (await post(bridge.a2aUrl, { jsonrpc: '2.0', id: 1, method, params })).json()) as any;
const call = (skill: string, input?: unknown, confirm?: boolean) => ({
  message: { messageId: 'm', role: 'user', parts: [{ kind: 'data', data: { skill, input } }] },
  ...(confirm ? { metadata: { confirm: true } } : {}),
});

describe('ahtml bridge', () => {
  test('binds an ephemeral port and prints three URLs on it', () => {
    assert.ok(bridge.port > 0);
    for (const u of [bridge.a2aUrl, bridge.cardUrl, bridge.mcpUrl]) assert.ok(u.includes(`:${bridge.port}/`), u);
  });

  test('serves an A2A agent card whose skills are the snapshot actions', async () => {
    const res = await fetch(bridge.cardUrl);
    assert.equal(res.status, 200);
    const card = (await res.json()) as any;
    assert.deepEqual(card.skills.map((s: any) => s.id), ['read_snapshot', 'add_to_cart', 'purchase']);
    assert.equal(card.url, bridge.a2aUrl);
    assert.equal(card.supportedInterfaces[0].url, bridge.a2aUrl);
  });

  test('A2A read_snapshot returns the live snapshot', async () => {
    const r = await a2a({ message: { messageId: 'm', role: 'user', parts: [{ kind: 'text', text: 'hi' }] } });
    assert.equal(r.result.status.state, 'completed');
    assert.match(r.result.artifacts[0].parts[0].text, /MacBook Bridge Test/);
  });

  test('A2A: safe action executes against execute_url; priced one is gated until confirm', async () => {
    const safe = await a2a(call('add_to_cart', { sku: 'mbp' }));
    assert.equal(safe.result.status.state, 'completed');
    assert.deepEqual(hits, [{ path: '/api/cart', body: JSON.stringify({ sku: 'mbp' }) }]);

    const gated = await a2a(call('purchase', { sku: 'mbp' }));
    assert.equal(gated.result.status.state, 'input-required');
    assert.equal(gated.result.artifacts[0].parts[0].data.simulated, true);
    assert.equal(hits.length, 1, 'priced action must not reach execute_url without confirm');

    const confirmed = await a2a(call('purchase', { sku: 'mbp' }, true));
    assert.equal(confirmed.result.status.state, 'completed');
    assert.equal(hits.length, 2);
    assert.equal(hits[1]!.path, '/api/checkout');
  });

  test('MCP /mcp: initialize, notification, tools/list, tools/call', async () => {
    const init = (await (await post(bridge.mcpUrl, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })).json()) as any;
    assert.equal(init.id, 1);
    assert.equal(init.result.protocolVersion, '2025-06-18');
    assert.ok(init.result.capabilities.tools);

    const note = await post(bridge.mcpUrl, { jsonrpc: '2.0', method: 'notifications/initialized' });
    assert.equal(note.status, 202);

    const list = (await (await post(bridge.mcpUrl, { jsonrpc: '2.0', id: 2, method: 'tools/list' })).json()) as any;
    const names = list.result.tools.map((t: any) => t.name);
    assert.ok(['fetch_page', 'list_pages', 'search', 'invoke_action'].every((n) => names.includes(n)), names.join());

    const bad = (await (await post(bridge.mcpUrl, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'nope' } })).json()) as any;
    assert.equal(bad.error.code, -32602);
    const unk = (await (await post(bridge.mcpUrl, { jsonrpc: '2.0', id: 4, method: 'nope' })).json()) as any;
    assert.equal(unk.error.code, -32601);
  });

  test('MCP /mcp rejects GET (405), non-JSON posts (415) and bad JSON (-32700)', async () => {
    assert.equal((await fetch(bridge.mcpUrl)).status, 405);
    assert.equal((await post(bridge.mcpUrl, {}, { 'content-type': 'text/plain' })).status, 415);
    const res = await fetch(bridge.mcpUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' });
    assert.equal(((await res.json()) as any).error.code, -32700);
  });

  test('foreign Host headers are refused (DNS rebinding guard); unknown paths 404', async () => {
    const status = await new Promise<number>((resolve, reject) => {
      const req = httpRequest({ host: '127.0.0.1', port: bridge.port, path: '/mcp', method: 'POST', headers: { host: 'evil.example', 'content-type': 'application/json' } }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on('error', reject);
      req.end('{}');
    });
    assert.equal(status, 403);
    assert.equal((await fetch(`http://127.0.0.1:${bridge.port}/nope`)).status, 404);
  });
});

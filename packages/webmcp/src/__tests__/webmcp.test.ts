import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { snapshot } from '@ahtmljs/schema';
import { registerAhtmlTools, unregisterAll } from '../index.js';
import { getBookmarkletHref, getBookmarkletSource } from '../bookmarklet.js';

// The registry lives on globalThis.__AHTML_TOOLS__ (the stable fallback used
// when no native WebMCP API is present — as in Node). Reset it before each
// test so cases don't leak tools into one another.
function registry(): Record<string, { description: string; annotations?: Record<string, unknown>; execute(a: Record<string, unknown>): Promise<string> }> {
  return (globalThis as Record<string, unknown>)['__AHTML_TOOLS__'] as never;
}

// A product page with a rich, fully-annotated purchase action plus a free
// read action — exercises every annotation branch in buildTool().
function productSnapshot() {
  return snapshot('https://shop.example.com/products/widget', 'product_detail')
    .add({ id: 'product:widget', type: 'product', name: 'Widget', price: { amount: 19, currency: 'USD' } })
    .action({
      id: 'purchase',
      label: 'Buy Widget',
      target: 'product:widget',
      category: 'transact',
      execute_url: 'https://shop.example.com/api/checkout',
      auth: 'required',
      cost: { amount: 19, currency: 'USD', category: 'purchase', rails: ['x402'] },
      reversible: { reversible: true, window: 'P30D' },
      side_effects: ['charge_card', 'decrement_stock'],
      confirmation: 'required',
    })
    .action({ id: 'view', category: 'read', cost: { category: 'free' } })
    .build();
}

describe('registerAhtmlTools', () => {
  beforeEach(() => unregisterAll());

  test('registers one tool per action into the fallback registry', () => {
    const tools = registerAhtmlTools(productSnapshot());
    assert.equal(tools.length, 2);
    assert.deepEqual(tools.map((t) => t.name).sort(), ['purchase', 'view']);
    assert.ok(registry()['purchase'], 'purchase is in __AHTML_TOOLS__');
    assert.ok(registry()['view'], 'view is in __AHTML_TOOLS__');
  });

  test('maps AHTML action metadata onto x-ahtml-* annotations', () => {
    registerAhtmlTools(productSnapshot());
    const ann = registry()['purchase']!.annotations!;
    assert.equal(ann['x-ahtml-cost'], '19 USD purchase');
    assert.equal(ann['x-ahtml-reversible'], true);
    assert.equal(ann['x-ahtml-reversible-window'], 'P30D');
    assert.equal(ann['x-ahtml-side-effects'], 'charge_card, decrement_stock');
    assert.equal(ann['x-ahtml-confirmation'], 'required');
    assert.equal(ann['x-ahtml-auth'], 'required');
  });

  test('a free, no-auth action carries no cost-amount, auth, or confirmation noise', () => {
    registerAhtmlTools(productSnapshot());
    const ann = registry()['view']!.annotations!;
    assert.equal(ann['x-ahtml-cost'], 'free');
    assert.equal('x-ahtml-auth' in ann, false);
    assert.equal('x-ahtml-confirmation' in ann, false);
    assert.equal('x-ahtml-side-effects' in ann, false);
  });

  test('builds a human-readable description from label, target, cost, and auth', () => {
    registerAhtmlTools(productSnapshot());
    const desc = registry()['purchase']!.description;
    assert.match(desc, /Buy Widget/);
    assert.match(desc, /Target: product:widget/);
    assert.match(desc, /Cost: 19 USD/);
    assert.match(desc, /Auth: required/);
  });

  test('execute() POSTs to execute_url with the action id and args, and returns the body', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return { text: async () => 'RECEIPT-42' } as Response;
    }) as unknown as typeof fetch;

    registerAhtmlTools(productSnapshot(), { fetch: fakeFetch });
    const out = await registry()['purchase']!.execute({ qty: 2 });

    assert.equal(out, 'RECEIPT-42');
    assert.equal(seen!.url, 'https://shop.example.com/api/checkout');
    assert.equal(seen!.init.method, 'POST');
    assert.deepEqual(JSON.parse(seen!.init.body as string), { action: 'purchase', qty: 2 });
  });

  test('execute() falls back to /ahtml/actions/<id> when the action has no execute_url', async () => {
    let calledUrl = '';
    const fakeFetch = (async (url: string) => {
      calledUrl = url;
      return { text: async () => 'ok' } as Response;
    }) as unknown as typeof fetch;

    registerAhtmlTools(productSnapshot(), { fetch: fakeFetch });
    await registry()['view']!.execute({});
    assert.equal(calledUrl, 'https://shop.example.com/ahtml/actions/view');
  });

  test('execute() reports a transport failure as a JSON error instead of throwing', async () => {
    const fakeFetch = (async () => { throw new Error('network down'); }) as unknown as typeof fetch;
    registerAhtmlTools(productSnapshot(), { fetch: fakeFetch });
    const out = await registry()['purchase']!.execute({});
    assert.deepEqual(JSON.parse(out), { error: 'network down' });
  });

  test('unregister() removes a single tool; unregisterAll() clears the registry', () => {
    const tools = registerAhtmlTools(productSnapshot());
    tools.find((t) => t.name === 'view')!.unregister();
    assert.equal('view' in registry(), false);
    assert.equal('purchase' in registry(), true);

    unregisterAll();
    assert.deepEqual(Object.keys(registry()), []);
  });
});

describe('bookmarklet', () => {
  test('getBookmarkletSource returns runnable JS that reads __AHTML_TOOLS__', () => {
    const src = getBookmarkletSource();
    assert.equal(typeof src, 'string');
    assert.match(src, /__AHTML_TOOLS__/);
    assert.match(src, /well-known\/ahtml\.json/);
  });

  test('getBookmarkletHref is a URL-encoded javascript: URI', () => {
    const href = getBookmarkletHref();
    assert.ok(href.startsWith('javascript:'), 'is a javascript: URI');
    assert.ok(!href.includes('\n'), 'the payload is percent-encoded, not raw');
    assert.equal(decodeURIComponent(href.slice('javascript:'.length)), getBookmarkletSource());
  });
});

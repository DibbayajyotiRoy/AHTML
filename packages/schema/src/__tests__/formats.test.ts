import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot } from '../snapshot.js';
import { toJson, fromJson } from '../format-json.js';
import { toCompact, fromCompact } from '../format-compact.js';

function fixture() {
  return snapshot('https://shop.com/products/mbp-14', 'product_detail')
    .ttl(60)
    .etag('W/"abc"')
    .fetchedAt('2026-05-12T14:32:00Z')
    .policy({ agents_welcome: true, license: 'MIT', rate_limit: '100/min' })
    .add({
      id: 'product:mbp-14',
      type: 'product',
      name: 'MacBook Pro 14"',
      brand: 'Apple',
      price: { amount: 1999, currency: 'USD' },
      stock: { status: 'in_stock', quantity: 42 },
      rating: { average: 4.7, count: 1284 },
    })
    .action({
      id: 'purchase',
      label: 'Buy now',
      target: 'product:mbp-14',
      category: 'transact',
      method: 'POST',
      execute_url: '/api/checkout',
      auth: 'required',
      cost: { amount: 1999, currency: 'USD', category: 'purchase' },
      reversible: { reversible: true, window: 'P30D', policy: 'full_refund' },
      side_effects: ['charge_card', 'email_buyer', 'decrement_stock'],
      confirmation: 'required',
    })
    .build();
}

describe('toJson() / fromJson()', () => {
  test('round-trip is lossless', () => {
    const original = fixture();
    const restored = fromJson(toJson(original));
    assert.deepEqual(restored, original);
  });

  test('emits keys in canonical order (deterministic for signing)', () => {
    const s = fixture();
    const json = toJson(s);
    // ahtml comes first, then url, fetched_at, ttl, etag, page_type...
    const ahtmlIdx = json.indexOf('"ahtml"');
    const urlIdx = json.indexOf('"url"');
    const pageTypeIdx = json.indexOf('"page_type"');
    const entitiesIdx = json.indexOf('"entities"');
    assert.ok(ahtmlIdx < urlIdx);
    assert.ok(urlIdx < pageTypeIdx);
    assert.ok(pageTypeIdx < entitiesIdx);
  });

  test('pretty mode produces indented output ending with newline', () => {
    const s = fixture();
    const pretty = toJson(s, { pretty: true });
    assert.ok(pretty.includes('\n'));
    assert.ok(pretty.endsWith('\n'));
  });

  test('omits undefined fields', () => {
    const s = snapshot('https://x.com', 'home').build();
    const json = toJson(s);
    // 'meta', 'policy', 'ttl', 'etag' were never set — should not appear
    assert.ok(!json.includes('"meta"'));
    assert.ok(!json.includes('"policy"'));
    assert.ok(!json.includes('"ttl"'));
    assert.ok(!json.includes('"etag"'));
  });
});

describe('toCompact() / fromCompact()', () => {
  test('round-trip preserves the snapshot envelope and entity/action structure', () => {
    const original = fixture();
    const compact = toCompact(original);
    const restored = fromCompact(compact);
    assert.equal(restored.ahtml, original.ahtml);
    assert.equal(restored.url, original.url);
    assert.equal(restored.page_type, original.page_type);
    assert.equal(restored.fetched_at, original.fetched_at);
    assert.equal(restored.ttl, original.ttl);
    assert.equal(restored.etag, original.etag);
    assert.equal(restored.entities.length, original.entities.length);
    assert.equal(restored.actions.length, original.actions.length);
  });

  test('Money is serialized inline as "AMOUNT CURRENCY"', () => {
    const s = fixture();
    const compact = toCompact(s);
    assert.match(compact, /price: 1999 USD/);
  });

  test('Stock is serialized inline as "STATUS (QUANTITY)"', () => {
    const s = fixture();
    const compact = toCompact(s);
    assert.match(compact, /stock: in_stock \(42\)/);
  });

  test('Rating is serialized inline as "AVG (COUNT)"', () => {
    const s = fixture();
    const compact = toCompact(s);
    assert.match(compact, /rating: 4\.7 \(1284\)/);
  });

  test('Reversibility "P30D full_refund" serialized in single line', () => {
    const s = fixture();
    const compact = toCompact(s);
    assert.match(compact, /reversible: P30D full_refund/);
  });

  test('side_effects serialized as comma-separated single line', () => {
    const s = fixture();
    const compact = toCompact(s);
    assert.match(compact, /side_effects: charge_card, email_buyer, decrement_stock/);
  });

  test('uses @envelope / [entity-id] / (action) syntax', () => {
    const s = fixture();
    const compact = toCompact(s);
    assert.match(compact, /^@ahtml 0\.1/m);
    assert.match(compact, /^@url /m);
    assert.match(compact, /^\[product:mbp-14\]/m);
    assert.match(compact, /^\(action\) purchase/m);
  });

  test('parser handles the compact form back into entities & actions', () => {
    const compact = `@ahtml 0.1
@url https://x.com
@fetched 2026-01-01T00:00:00Z
@page_type product_detail

[product:p1]
  name: Hello
  price: 99 USD
  stock: in_stock (10)

(action) buy
  target: product:p1
  auth: required
  cost: 99 USD purchase
  reversible: P30D full_refund
  side_effects: charge_card, email_buyer
  confirmation: required
`;
    const s = fromCompact(compact);
    assert.equal(s.url, 'https://x.com');
    assert.equal(s.entities.length, 1);
    const p = s.entities[0] as { type: string; name: string; price?: { amount: number; currency: string }; stock?: { status: string; quantity?: number } };
    assert.equal(p.type, 'product');
    assert.equal(p.name, 'Hello');
    assert.equal(p.price?.amount, 99);
    assert.equal(p.price?.currency, 'USD');
    assert.equal(p.stock?.status, 'in_stock');
    assert.equal(p.stock?.quantity, 10);
    assert.equal(s.actions.length, 1);
    assert.equal(s.actions[0]!.id, 'buy');
    assert.equal(s.actions[0]!.confirmation, 'required');
    assert.deepEqual(s.actions[0]!.side_effects, ['charge_card', 'email_buyer']);
  });

  test('compact text is strictly smaller than canonical JSON', () => {
    const s = fixture();
    const json = toJson(s);
    const compact = toCompact(s);
    assert.ok(
      compact.length < json.length,
      `compact (${compact.length}B) should be smaller than json (${json.length}B)`,
    );
  });
});

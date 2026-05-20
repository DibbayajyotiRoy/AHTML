/**
 * Compact-format round-trip baseline — v0.4.0.
 *
 * What's tested here is what `fromCompact()` actually preserves today.
 * The `test.todo` entries at the bottom document every field that is
 * currently LOST on round-trip; closing them is the v0.5.0 plan.
 *
 * Together this acts as a "schema for the parser": the green tests pin
 * existing behavior; the todos enumerate the gap. No silent regressions.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot, toCompact, fromCompact } from '../index.js';
import type { Product } from '../types.js';

describe('compact round-trip — baseline (what works today)', () => {
  test('envelope: ahtml / url / fetched_at / page_type / ttl / etag', () => {
    const a = snapshot('https://x.com/p', 'product_detail').ttl(60).etag('W/"abc"').build();
    const b = fromCompact(toCompact(a));
    assert.equal(b.ahtml, '0.1');
    assert.equal(b.url, 'https://x.com/p');
    assert.equal(b.page_type, 'product_detail');
    assert.equal(b.ttl, 60);
    assert.equal(b.etag, 'W/"abc"');
  });

  test('product: id, name, brand, price, stock, sku, rating', () => {
    const a = snapshot('https://x.com/p', 'product_detail')
      .add({
        id: 'product:p',
        type: 'product',
        name: 'MacBook Pro 14"',
        brand: 'Apple',
        price: { amount: 1999, currency: 'USD' },
        stock: { status: 'in_stock', quantity: 42 },
        sku: 'MBP14-M3',
        rating: { average: 4.7, count: 1200 },
      })
      .build();
    const b = fromCompact(toCompact(a));
    const p = b.entities[0] as Product;
    assert.equal(p.id, 'product:p');
    assert.equal(p.name, 'MacBook Pro 14"');
    assert.equal(p.brand, 'Apple');
    assert.deepEqual(p.price, { amount: 1999, currency: 'USD' });
    assert.deepEqual(p.stock, { status: 'in_stock', quantity: 42 });
    assert.equal(p.sku, 'MBP14-M3');
    assert.deepEqual(p.rating, { average: 4.7, count: 1200 });
  });

  test('action: id, label, target, method, side_effects, confirmation, reversible, cost', () => {
    const a = snapshot('https://x.com/p', 'product_detail')
      .action({
        id: 'buy',
        label: 'Buy now',
        target: 'product:p',
        method: 'POST',
        side_effects: ['charge_card', 'email_buyer'],
        confirmation: 'required',
        reversible: { reversible: true, window: 'P30D', policy: 'full_refund' },
        cost: { amount: 1999, currency: 'USD', category: 'purchase' },
      })
      .build();
    const b = fromCompact(toCompact(a));
    const act = b.actions[0]!;
    assert.equal(act.id, 'buy');
    assert.equal(act.label, 'Buy now');
    assert.equal(act.target, 'product:p');
    assert.equal(act.method, 'POST');
    assert.deepEqual(act.side_effects, ['charge_card', 'email_buyer']);
    assert.equal(act.confirmation, 'required');
    assert.equal(act.reversible?.reversible, true);
    assert.equal(act.reversible?.window, 'P30D');
    assert.equal(act.reversible?.policy, 'full_refund');
    assert.equal(act.cost?.amount, 1999);
    assert.equal(act.cost?.currency, 'USD');
    assert.equal(act.cost?.category, 'purchase');
  });
});

describe('compact round-trip — fields known NOT to round-trip (v0.5.0 work)', () => {
  // Each todo here documents one field/shape that toCompact() writes but
  // fromCompact() drops. Flip the todo off as each is implemented.
  test.todo('product.description / category / list_price / attributes / images');
  test.todo('product.variants');
  test.todo('document.author / summary / content / tags / chunks / language / word_count');
  test.todo('task.priority / due_at / labels / description');
  test.todo('profile.email / homepage / handle / bio / avatar / verified / attributes');
  test.todo('dataset entities (currently parseEntity returns null)');
  test.todo('conversation entities (currently parseEntity returns null)');
  test.todo('action.category / execute_url / preview_url / rate_limit / input / output');
  test.todo('action.auth in object form { scheme, scopes }');
  test.todo('action.target in array form (multi-target actions)');
  test.todo('links block (self / canonical / parent / next / prev / related)');
  test.todo('schemas block (per-snapshot JSON Schema registry)');
  test.todo('meta block with non-numeric string/boolean values');
  test.todo('policy: caching / actions_require / terms_url / attribution_required / republish');
});

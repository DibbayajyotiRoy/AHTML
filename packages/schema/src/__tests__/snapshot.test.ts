import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot, computeEtag } from '../snapshot.js';
import { AHTML_VERSION } from '../types.js';
import type { Snapshot } from '../types.js';

describe('snapshot builder', () => {
  test('produces a valid envelope from minimal input', () => {
    const s = snapshot('https://shop.com/p/1', 'product_detail').build();
    assert.equal(s.ahtml, '0.1');
    assert.equal(s.ahtml, AHTML_VERSION);
    assert.equal(s.url, 'https://shop.com/p/1');
    assert.equal(s.page_type, 'product_detail');
    assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s.fetched_at));
    assert.deepEqual(s.entities, []);
    assert.deepEqual(s.actions, []);
  });

  test('chains entities, actions, policy, links, and meta', () => {
    const s = snapshot('https://x.com', 'home')
      .ttl(300)
      .policy({ agents_welcome: true, license: 'MIT', rate_limit: '100/min' })
      .add({
        id: 'product:p1',
        type: 'product',
        name: 'X',
        price: { amount: 100, currency: 'USD' },
      })
      .action({
        id: 'buy',
        target: 'product:p1',
        category: 'transact',
        execute_url: '/api/buy',
        auth: 'required',
        cost: { amount: 100, currency: 'USD', category: 'purchase' },
      })
      .links({ canonical: 'https://x.com', related: ['product:p2'] })
      .meta({ generated_by: 'test' })
      .build();

    assert.equal(s.ttl, 300);
    assert.equal(s.policy?.agents_welcome, true);
    assert.equal(s.policy?.license, 'MIT');
    assert.equal(s.entities.length, 1);
    assert.equal(s.entities[0]!.id, 'product:p1');
    assert.equal(s.actions.length, 1);
    assert.equal(s.actions[0]!.id, 'buy');
    assert.equal(s.links?.canonical, 'https://x.com');
    assert.deepEqual(s.links?.related, ['product:p2']);
    assert.equal(s.meta?.generated_by, 'test');
  });

  test('add() accepts multiple entities in one call', () => {
    const s = snapshot('https://x.com', 'product_list')
      .add(
        { id: 'product:a', type: 'product', name: 'A' },
        { id: 'product:b', type: 'product', name: 'B' },
        { id: 'product:c', type: 'product', name: 'C' },
      )
      .build();
    assert.equal(s.entities.length, 3);
    assert.deepEqual(
      s.entities.map((e) => e.id),
      ['product:a', 'product:b', 'product:c'],
    );
  });

  test('action() accepts multiple actions in one call', () => {
    const s = snapshot('https://x.com', 'product_detail')
      .action(
        { id: 'buy', category: 'transact' },
        { id: 'cart', category: 'update' },
        { id: 'wishlist', category: 'update' },
      )
      .build();
    assert.equal(s.actions.length, 3);
  });

  test('build() returns a deep clone — mutating the builder after build does not affect result', () => {
    const builder = snapshot('https://x.com', 'home');
    const first = builder.build();
    builder.add({ id: 'product:after', type: 'product', name: 'After' });
    const second = builder.build();
    assert.equal(first.entities.length, 0);
    assert.equal(second.entities.length, 1);
  });

  test('schema() registers shared input/output schemas', () => {
    const s = snapshot('https://x.com', 'product_detail')
      .schema('PurchaseInput', {
        type: 'object',
        properties: { sku: { type: 'string' } },
        required: ['sku'],
      })
      .build();
    assert.ok(s.schemas);
    assert.equal(s.schemas!.PurchaseInput!.type, 'object');
  });

  test('etag() and fetchedAt() override defaults', () => {
    const s = snapshot('https://x.com', 'home')
      .etag('W/"abc"')
      .fetchedAt('2026-01-01T00:00:00Z')
      .build();
    assert.equal(s.etag, 'W/"abc"');
    assert.equal(s.fetched_at, '2026-01-01T00:00:00Z');
  });
});

describe('computeEtag()', () => {
  test('is deterministic — same content always produces the same etag', () => {
    const a = snapshot('https://x.com', 'home').add({ id: 'product:1', type: 'product', name: 'X' }).build();
    const b = snapshot('https://x.com', 'home').add({ id: 'product:1', type: 'product', name: 'X' }).build();
    a.fetched_at = b.fetched_at = '2026-01-01T00:00:00Z';
    assert.equal(computeEtag(a), computeEtag(b));
  });

  test('changes when entities change', () => {
    const a = snapshot('https://x.com', 'home').add({ id: 'product:1', type: 'product', name: 'X' }).build();
    const b = snapshot('https://x.com', 'home').add({ id: 'product:1', type: 'product', name: 'Y' }).build();
    assert.notEqual(computeEtag(a), computeEtag(b));
  });

  test('changes when actions change', () => {
    const a = snapshot('https://x.com', 'home').action({ id: 'buy' }).build();
    const b = snapshot('https://x.com', 'home').action({ id: 'cart' }).build();
    assert.notEqual(computeEtag(a), computeEtag(b));
  });

  test('does NOT change when only fetched_at changes', () => {
    const a: Snapshot = snapshot('https://x.com', 'home').fetchedAt('2026-01-01T00:00:00Z').build();
    const b: Snapshot = snapshot('https://x.com', 'home').fetchedAt('2026-12-31T23:59:59Z').build();
    // Content is identical except for timestamp — etag should ignore timestamp
    assert.equal(computeEtag(a), computeEtag(b));
  });

  test('uses the W/"hex" weak-ETag format', () => {
    const s = snapshot('https://x.com', 'home').build();
    assert.match(computeEtag(s), /^W\/"[0-9a-f]+"$/);
  });
});

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { lint } from '../lint.js';
import { snapshot } from '../snapshot.js';
import type { Snapshot } from '../types.js';

/** A high-quality product-detail snapshot that should lint clean. */
function cleanSnapshot(): Snapshot {
  return snapshot('https://shop.com/p/mbp-14', 'product_detail')
    .ttl(60)
    .policy({ agents_welcome: true, contact: 'agents@shop.com' })
    .add({
      id: 'product:mbp-14',
      type: 'product',
      name: 'MacBook Pro 14"',
      description: 'M3 laptop',
      price: { amount: 1999, currency: 'USD' },
      stock: { status: 'in_stock', quantity: 42 },
      freshness: 'daily',
    })
    .action({
      id: 'purchase',
      label: 'Buy now',
      category: 'transact',
      target: 'product:mbp-14',
      execute_url: '/api/checkout',
      cost: { amount: 1999, currency: 'USD', category: 'purchase' },
      side_effects: ['charge_card'],
      confirmation: 'required',
    })
    .build();
}

describe('lint()', () => {
  test('a high-quality snapshot has no warnings', () => {
    assert.deepEqual(lint(cleanSnapshot()), []);
  });

  test('flags a product with no price', () => {
    const s = snapshot('https://shop.com/p/x', 'product_detail')
      .ttl(60)
      .policy({ agents_welcome: true, contact: 'a@b.com' })
      .add({ id: 'product:x', type: 'product', name: 'X', freshness: 'static' })
      .action({ id: 'view', label: 'View', target: 'product:x' })
      .build();
    assert.ok(lint(s).some((w) => w.rule === 'product-no-price'));
  });

  test('flags a product-detail page with no actions', () => {
    const s = snapshot('https://shop.com/p/x', 'product_detail')
      .ttl(60)
      .policy({ agents_welcome: true, contact: 'a@b.com' })
      .add({
        id: 'product:x',
        type: 'product',
        name: 'X',
        description: 'd',
        price: { amount: 1, currency: 'USD' },
        stock: { status: 'in_stock' },
        freshness: 'static',
      })
      .build();
    assert.ok(lint(s).some((w) => w.rule === 'product-detail-no-actions'));
  });

  test('flags high-risk side effects without required confirmation', () => {
    const s = cleanSnapshot();
    s.actions[0]!.confirmation = 'recommended';
    const w = lint(s).find((x) => x.rule === 'action-unconfirmed-side-effects');
    assert.ok(w && w.severity === 'warning');
  });

  test('flags a mutating action with no execute_url', () => {
    const s = cleanSnapshot();
    delete s.actions[0]!.execute_url;
    assert.ok(lint(s).some((w) => w.rule === 'action-no-execute-url'));
  });

  test('flags an action targeting a missing entity', () => {
    const s = cleanSnapshot();
    s.actions[0]!.target = 'product:ghost';
    assert.ok(lint(s).some((w) => w.rule === 'action-dangling-target'));
  });

  test('flags a missing policy', () => {
    const s = cleanSnapshot();
    delete s.policy;
    assert.ok(lint(s).some((w) => w.rule === 'no-policy'));
  });

  test('flags a truncated dataset with no pagination', () => {
    const s = snapshot('https://x.com/data', 'dataset')
      .ttl(60)
      .policy({ agents_welcome: true, contact: 'a@b.com' })
      .add({
        id: 'dataset:d',
        type: 'dataset',
        name: 'D',
        freshness: 'daily',
        columns: [{ key: 'a', label: 'A', type: 'string' }],
        rows: [['1'], ['2']],
        row_count_total: 100,
      })
      .build();
    assert.ok(lint(s).some((w) => w.rule === 'dataset-truncated-no-pagination'));
  });

  test('disable option suppresses a rule', () => {
    const s = cleanSnapshot();
    delete s.policy;
    delete s.ttl;
    const out = lint(s, { disable: ['no-policy', 'no-ttl'] });
    assert.ok(!out.some((w) => w.rule === 'no-policy' || w.rule === 'no-ttl'));
  });

  test('every warning carries a stable rule id and a path', () => {
    const s = cleanSnapshot();
    delete s.policy;
    s.actions[0]!.target = 'product:ghost';
    for (const w of lint(s)) {
      assert.ok(w.rule.length > 0, 'rule id present');
      assert.ok(typeof w.path === 'string', 'path present');
      assert.ok(w.severity === 'warning' || w.severity === 'info');
    }
  });
});

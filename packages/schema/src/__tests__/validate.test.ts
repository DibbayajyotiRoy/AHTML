import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validate, isValid } from '../validate.js';
import { snapshot } from '../snapshot.js';

describe('validate()', () => {
  test('a well-formed snapshot has no errors', () => {
    const s = snapshot('https://x.com', 'home').build();
    const issues = validate(s);
    const errors = issues.filter((i) => i.severity === 'error');
    assert.deepEqual(errors, []);
  });

  test('rejects non-object input', () => {
    const issues = validate(null);
    assert.ok(issues.some((i) => i.severity === 'error'));
  });

  test('rejects an unsupported ahtml version', () => {
    const s = { ahtml: '99.9', url: 'x', fetched_at: '2026-01-01T00:00:00Z', page_type: 'home', entities: [], actions: [] };
    const errors = validate(s).filter((i) => i.severity === 'error');
    assert.ok(errors.some((e) => e.path === 'ahtml'));
  });

  test('rejects an unknown page_type', () => {
    const s = snapshot('https://x.com', 'home').build();
    (s as { page_type: string }).page_type = 'totally_made_up';
    const errors = validate(s).filter((i) => i.severity === 'error');
    assert.ok(errors.some((e) => e.path === 'page_type'));
  });

  test('rejects an unknown entity type', () => {
    const s = snapshot('https://x.com', 'home').build();
    s.entities.push({ id: 'mystery:x', type: 'mystery' as 'product', name: 'X' } as { id: string; type: 'product'; name: string });
    const errors = validate(s).filter((i) => i.severity === 'error');
    assert.ok(errors.some((e) => e.path.includes('entities[0]') && e.path.endsWith('.type')));
  });

  test('warns when entity id prefix does not match type', () => {
    const s = snapshot('https://x.com', 'home')
      .add({ id: 'wrong-prefix:abc', type: 'product', name: 'X' })
      .build();
    const issues = validate(s);
    assert.ok(issues.some((i) => i.severity === 'warning' && i.path.endsWith('.id')));
  });

  test('rejects a product without a name', () => {
    const s = snapshot('https://x.com', 'product_detail')
      .add({ id: 'product:p1', type: 'product', name: '' })
      .build();
    const errors = validate(s).filter((i) => i.severity === 'error');
    assert.ok(errors.some((e) => e.path.endsWith('.name')));
  });

  test('rejects price.amount that is not a number', () => {
    const s = snapshot('https://x.com', 'product_detail').build();
    s.entities.push({ id: 'product:p1', type: 'product', name: 'X', price: { amount: 'expensive' as unknown as number, currency: 'USD' } });
    const errors = validate(s).filter((i) => i.severity === 'error');
    assert.ok(errors.some((e) => e.path.endsWith('.price.amount')));
  });

  test('rejects duplicate entity ids', () => {
    const s = snapshot('https://x.com', 'product_list')
      .add(
        { id: 'product:p1', type: 'product', name: 'A' },
        { id: 'product:p1', type: 'product', name: 'B' },
      )
      .build();
    const errors = validate(s).filter((i) => i.severity === 'error');
    assert.ok(errors.some((e) => e.message.includes('duplicate entity id')));
  });

  test('rejects an unknown cost category', () => {
    const s = snapshot('https://x.com', 'product_detail')
      .action({ id: 'buy', cost: { category: 'made_up' as 'free' } })
      .build();
    const errors = validate(s).filter((i) => i.severity === 'error');
    assert.ok(errors.some((e) => e.path.includes('cost.category')));
  });

  test('rejects an unknown confirmation level', () => {
    const s = snapshot('https://x.com', 'product_detail')
      .action({ id: 'buy', confirmation: 'mostly' as 'required' })
      .build();
    const errors = validate(s).filter((i) => i.severity === 'error');
    assert.ok(errors.some((e) => e.path.includes('confirmation')));
  });

  test('isValid() is true for clean snapshot', () => {
    const s = snapshot('https://x.com', 'home').build();
    assert.equal(isValid(s), true);
  });

  test('isValid() is false when there is any error', () => {
    assert.equal(isValid({ ahtml: '99.9' }), false);
  });
});

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { semanticDiff, summarizeChanges, describeChange, type SemanticChange } from '../semantic-diff.js';
import { diff } from '../diff.js';
import { snapshot } from '../snapshot.js';
import type { Snapshot, Product, Action, Policy } from '../types.js';

function product(over: Partial<Product> = {}): Product {
  return { id: 'product:p1', type: 'product', name: 'Widget', ...over };
}

function snap(
  entities: Snapshot['entities'] = [],
  actions: Action[] = [],
  extra: Partial<Snapshot> = {},
): Snapshot {
  const b = snapshot('https://x.com/p', 'product_detail');
  for (const e of entities) b.add(e);
  for (const a of actions) b.action(a);
  return { ...b.build(), ...extra };
}

function only<K extends SemanticChange['kind']>(
  changes: SemanticChange[],
  kind: K,
): Extract<SemanticChange, { kind: K }> {
  const hits = changes.filter((c) => c.kind === kind);
  assert.equal(hits.length, 1, `expected exactly one ${kind}, got ${JSON.stringify(changes)}`);
  return hits[0] as Extract<SemanticChange, { kind: K }>;
}

const purchase = (over: Partial<Action> = {}): Action => ({ id: 'purchase', label: 'Buy', ...over });

describe('semanticDiff()', () => {
  test('identical snapshots (and volatile fields only) yield no changes', () => {
    const a = snap([product({ updated_at: '2026-01-01T00:00:00Z' })], [], { etag: 'W/"a"', fetched_at: '2026-01-01T00:00:00Z' });
    const b = snap([product({ updated_at: '2026-02-02T00:00:00Z' })], [], { etag: 'W/"b"', fetched_at: '2026-02-02T00:00:00Z' });
    assert.deepEqual(semanticDiff(a, b), []);
    assert.deepEqual(semanticDiff(a, a), []);
  });

  test('key order and element order are not changes', () => {
    const a = snap([product({ attributes: { a: 1, b: 2 } }), product({ id: 'product:p2' })]);
    const b = snap([product({ id: 'product:p2' }), product({ attributes: { b: 2, a: 1 } })]);
    assert.deepEqual(semanticDiff(a, b), []);
  });

  test('entity.added / entity.removed (info) carry type and label', () => {
    const c = semanticDiff(snap([product()]), snap([product({ id: 'product:p2', name: 'Gadget' })]));
    const added = only(c, 'entity.added');
    const removed = only(c, 'entity.removed');
    assert.equal(added.id, 'product:p2');
    assert.equal(added.entityType, 'product');
    assert.equal(added.label, 'Gadget');
    assert.equal(added.severity, 'info');
    assert.equal(removed.id, 'product:p1');
    assert.equal(removed.severity, 'info');
  });

  test('field.changed reports path / before / after; absent sides are omitted', () => {
    const c = semanticDiff(
      snap([product({ name: 'Old', brand: 'Acme' })]),
      snap([product({ name: 'New', sku: 'S1' })]),
    );
    const byPath = Object.fromEntries(c.map((x) => [(x as { path: string }).path, x]));
    assert.deepEqual(byPath.name, { kind: 'field.changed', id: 'product:p1', severity: 'info', path: 'name', before: 'Old', after: 'New' });
    assert.ok(!('before' in byPath.sku!) && (byPath.sku as { after: string }).after === 'S1');
    assert.ok(!('after' in byPath.brand!) && (byPath.brand as { before: string }).before === 'Acme');
  });

  test('nested object changes get dotted paths', () => {
    const c = semanticDiff(
      snap([product({ rating: { average: 4.5, count: 10 } })]),
      snap([product({ rating: { average: 4.6, count: 10 } })]),
    );
    assert.equal(only(c, 'field.changed').path, 'rating.average');
  });

  test('arrays with ids compare by id; others by value (order-insensitive)', () => {
    const v = (id: string, name: string) => ({ id, name });
    const a = snap([product({ variants: [v('a', 'A'), v('b', 'B')] })]);
    const b = snap([product({ variants: [v('b', 'B2'), v('a', 'A')] })]);
    const c = semanticDiff(a, b);
    assert.equal(c.length, 1);
    assert.equal(only(c, 'field.changed').path, 'variants[b].name');

    const docA = snap([{ id: 'document:d', type: 'document', title: 'T', tags: ['x', 'y'] }]);
    assert.deepEqual(semanticDiff(docA, snap([{ id: 'document:d', type: 'document', title: 'T', tags: ['y', 'x'] }])), []);
    const tagChange = only(semanticDiff(docA, snap([{ id: 'document:d', type: 'document', title: 'T', tags: ['x', 'z'] }])), 'field.changed');
    assert.equal(tagChange.path, 'tags');
    assert.match(describeChange(tagChange), /added \["z"\], removed \["y"\]/);
  });

  test('price.changed: amounts, currency, pctChange, notable', () => {
    const c = semanticDiff(
      snap([product({ price: { amount: 200, currency: 'USD' } })]),
      snap([product({ price: { amount: 150, currency: 'USD' } })]),
    );
    const p = only(c, 'price.changed');
    assert.equal(p.severity, 'notable');
    assert.deepEqual([p.path, p.before, p.after, p.currency, p.pctChange], ['price', 200, 150, 'USD', -25]);
    assert.equal(c.length, 1, 'price must not also appear as field.changed');
  });

  test('price.changed covers list_price, variant prices, added and removed prices, currency swaps', () => {
    const list = only(
      semanticDiff(
        snap([product({ list_price: { amount: 10, currency: 'USD' } })]),
        snap([product({ list_price: { amount: 12, currency: 'USD' } })]),
      ),
      'price.changed',
    );
    assert.equal(list.path, 'list_price');
    assert.equal(list.pctChange, 20);

    const variant = only(
      semanticDiff(
        snap([product({ variants: [{ id: 'v1', name: 'V', price: { amount: 5, currency: 'EUR' } }] })]),
        snap([product({ variants: [{ id: 'v1', name: 'V', price: { amount: 6, currency: 'EUR' } }] })]),
      ),
      'price.changed',
    );
    assert.equal(variant.path, 'variants[v1].price');

    const added = only(semanticDiff(snap([product()]), snap([product({ price: { amount: 9, currency: 'USD' } })])), 'price.changed');
    assert.deepEqual([added.before, added.after, added.pctChange], [null, 9, null]);
    const removed = only(semanticDiff(snap([product({ price: { amount: 9, currency: 'USD' } })]), snap([product()])), 'price.changed');
    assert.deepEqual([removed.before, removed.after], [9, null]);

    const swap = only(
      semanticDiff(
        snap([product({ price: { amount: 10, currency: 'USD' } })]),
        snap([product({ price: { amount: 10, currency: 'EUR' } })]),
      ),
      'price.changed',
    );
    assert.equal(swap.previousCurrency, 'USD');
    assert.equal(swap.currency, 'EUR');
    assert.equal(swap.pctChange, null);
  });

  test('price.changed from a zero price has null pctChange (no divide by zero)', () => {
    const p = only(
      semanticDiff(
        snap([product({ price: { amount: 0, currency: 'USD' } })]),
        snap([product({ price: { amount: 5, currency: 'USD' } })]),
      ),
      'price.changed',
    );
    assert.equal(p.pctChange, null);
  });

  test('availability.changed is notable; quantity-only moves are info field changes', () => {
    const c = semanticDiff(
      snap([product({ stock: { status: 'in_stock', quantity: 3 } })]),
      snap([product({ stock: { status: 'out_of_stock', quantity: 0 } })]),
    );
    const a = only(c, 'availability.changed');
    assert.equal(a.severity, 'notable');
    assert.deepEqual([a.before, a.after, a.quantityBefore, a.quantityAfter], ['in_stock', 'out_of_stock', 3, 0]);
    assert.equal(c.length, 1);

    const q = semanticDiff(
      snap([product({ stock: { status: 'in_stock', quantity: 3 } })]),
      snap([product({ stock: { status: 'in_stock', quantity: 2 } })]),
    );
    assert.equal(q.length, 1);
    assert.equal(q[0]!.kind, 'field.changed');
    assert.equal((q[0] as { path: string }).path, 'stock.quantity');
    assert.equal(q[0]!.severity, 'info');
  });

  test('action.added is info; action.removed is breaking', () => {
    const c = semanticDiff(snap([], [purchase()]), snap([], [{ id: 'subscribe' }]));
    assert.equal(only(c, 'action.added').severity, 'info');
    assert.equal(only(c, 'action.removed').severity, 'breaking');
    assert.equal(only(c, 'action.removed').id, 'purchase');
  });

  test('action became priced -> breaking', () => {
    const c = semanticDiff(
      snap([], [purchase({ cost: { category: 'free' } })]),
      snap([], [purchase({ cost: { amount: 5, currency: 'USD', category: 'purchase' } })]),
    );
    const a = only(c, 'action.changed');
    assert.deepEqual(a.flags, ['became_priced']);
    assert.equal(a.severity, 'breaking');
    assert.deepEqual(a.changes, [], 'covered cost fields are not repeated');
  });

  test('action price changed -> notable', () => {
    const c = semanticDiff(
      snap([], [purchase({ cost: { amount: 5, currency: 'USD', category: 'purchase' } })]),
      snap([], [purchase({ cost: { amount: 7, currency: 'USD', category: 'purchase' } })]),
    );
    const a = only(c, 'action.changed');
    assert.deepEqual(a.flags, ['price_changed']);
    assert.equal(a.severity, 'notable');
  });

  test('action became irreversible -> breaking', () => {
    const c = semanticDiff(
      snap([], [purchase({ reversible: { reversible: true, window: 'P30D' } })]),
      snap([], [purchase({ reversible: { reversible: false } })]),
    );
    const a = only(c, 'action.changed');
    assert.deepEqual(a.flags, ['became_irreversible']);
    assert.equal(a.severity, 'breaking');
  });

  test('action input: added/removed required inputs are breaking, optional additions are info', () => {
    const schema = (required: string[], props: string[] = required) => ({
      type: 'object',
      required,
      properties: Object.fromEntries(props.map((p) => [p, { type: 'string' }])),
    });
    const added = only(
      semanticDiff(snap([], [purchase({ input: schema(['sku']) })]), snap([], [purchase({ input: schema(['sku', 'email']) })])),
      'action.changed',
    );
    assert.deepEqual(added.flags, ['input_changed']);
    assert.deepEqual(added.requiredAdded, ['email']);
    assert.equal(added.severity, 'breaking');

    const removed = only(
      semanticDiff(snap([], [purchase({ input: schema(['sku', 'email']) })]), snap([], [purchase({ input: schema(['sku']) })])),
      'action.changed',
    );
    assert.deepEqual(removed.requiredRemoved, ['email']);
    assert.equal(removed.severity, 'breaking');

    const optional = only(
      semanticDiff(
        snap([], [purchase({ input: schema(['sku']) })]),
        snap([], [purchase({ input: schema(['sku'], ['sku', 'note']) })]),
      ),
      'action.changed',
    );
    assert.deepEqual(optional.flags, ['input_changed']);
    assert.equal(optional.severity, 'info');
  });

  test('action input $ref is resolved through snapshot.schemas', () => {
    const ref = { $ref: '#/schemas/PurchaseInput' };
    const a = snap([], [purchase({ input: ref })], { schemas: { PurchaseInput: { type: 'object', required: ['sku'] } } });
    const b = snap([], [purchase({ input: ref })], { schemas: { PurchaseInput: { type: 'object', required: ['sku', 'zip'] } } });
    const c = only(semanticDiff(a, b), 'action.changed');
    assert.deepEqual(c.requiredAdded, ['zip']);
    assert.equal(c.severity, 'breaking');
    // schemas themselves are not diffed as meta
    assert.equal(semanticDiff(a, b).filter((x) => x.kind === 'meta.changed').length, 0);
  });

  test('other action fields roll up into one info action.changed', () => {
    const c = semanticDiff(snap([], [purchase({ label: 'Buy' })]), snap([], [purchase({ label: 'Buy now', confirmation: 'required' })]));
    const a = only(c, 'action.changed');
    assert.deepEqual(a.flags, []);
    assert.deepEqual(a.changes.map((d) => d.path), ['confirmation', 'label']);
    assert.equal(a.severity, 'info');
  });

  test('policy.changed is info, except withdrawing agents_welcome (breaking)', () => {
    const pol = (p: Partial<Policy>): Partial<Snapshot> => ({ policy: { agents_welcome: true, ...p } });
    const c = semanticDiff(snap([], [], pol({ license: 'MIT' })), snap([], [], pol({ license: 'Apache-2.0' })));
    const lic = only(c, 'policy.changed');
    assert.deepEqual([lic.path, lic.before, lic.after, lic.severity], ['license', 'MIT', 'Apache-2.0', 'info']);

    const off = only(semanticDiff(snap([], [], pol({})), snap([], [], pol({ agents_welcome: false }))), 'policy.changed');
    assert.equal(off.severity, 'breaking');

    const added = semanticDiff(snap(), snap([], [], pol({})));
    assert.equal(only(added, 'policy.changed').path, 'agents_welcome');
  });

  test('meta.changed covers ttl / page_type / meta.*; ignores etag, fetched_at, derived byte counters', () => {
    const a = snap([], [], { ttl: 60, etag: 'W/"1"', meta: { generated_by: 'x', snapshot_bytes: 10 } });
    const b = snap([], [], {
      ttl: 120,
      etag: 'W/"2"',
      page_type: 'home',
      meta: { generated_by: 'y', snapshot_bytes: 99 },
      fetched_at: '2030-01-01T00:00:00Z',
    });
    const c = semanticDiff(a, b);
    assert.deepEqual(
      c.map((x) => [x.kind, (x as { path: string }).path]),
      [
        ['meta.changed', 'meta.generated_by'],
        ['meta.changed', 'page_type'],
        ['meta.changed', 'ttl'],
      ],
    );
    assert.ok(c.every((x) => x.id === 'snapshot' && x.severity === 'info'));
  });

  test('severity ordering: breaking, notable, info', () => {
    const a = snap([product({ name: 'A', price: { amount: 1, currency: 'USD' } })], [purchase()]);
    const b = snap([product({ name: 'B', price: { amount: 2, currency: 'USD' } })], []);
    assert.deepEqual(semanticDiff(a, b).map((c) => c.severity), ['breaking', 'notable', 'info']);
  });

  test('is read-only and leaves structural diff() untouched', () => {
    const a = snap([product({ price: { amount: 1, currency: 'USD' } })]);
    const b = snap([product({ price: { amount: 2, currency: 'USD' } })]);
    const before = JSON.stringify([a, b]);
    const structural = JSON.stringify(diff(a, b));
    semanticDiff(a, b);
    assert.equal(JSON.stringify([a, b]), before);
    assert.equal(JSON.stringify(diff(a, b)), structural);
  });
});

describe('summarizeChanges()', () => {
  const prev = snap(
    [
      product({ price: { amount: 200, currency: 'USD' }, stock: { status: 'in_stock' } }),
      product({ id: 'product:gone', name: 'Gone' }),
    ],
    [purchase({ cost: { category: 'free' } }), { id: 'cancel' }],
  );
  const next = snap(
    [
      product({ name: 'Widget 2', price: { amount: 150, currency: 'USD' }, stock: { status: 'out_of_stock' } }),
      product({ id: 'product:new', name: 'New' }),
    ],
    [purchase({ cost: { amount: 5, currency: 'USD', category: 'purchase' }, reversible: { reversible: false } })],
  );

  test('one line per change, severity-tagged, plain English', () => {
    const lines = summarizeChanges(semanticDiff(prev, next)).split('\n');
    assert.deepEqual(lines, [
      '[breaking] Action "cancel" removed',
      '[breaking] Action "purchase" changed: became priced (5 USD purchase); became irreversible',
      '[notable] product:p1: stock availability changed from in_stock to out_of_stock',
      '[notable] product:p1: price decreased from 200 to 150 USD (-25%)',
      '[info] Entity product:gone removed ("Gone")',
      '[info] Entity product:new added ("New")',
      '[info] product:p1: name changed from "Widget" to "Widget 2"',
    ]);
  });

  test('deterministic: same output regardless of input order or repetition', () => {
    const changes = semanticDiff(prev, next);
    const expected = summarizeChanges(changes);
    assert.equal(summarizeChanges(changes), expected);
    assert.equal(summarizeChanges([...changes].reverse()), expected);
    const reordered = snap([...next.entities].reverse(), [...next.actions].reverse());
    assert.equal(summarizeChanges(semanticDiff(prev, reordered)), expected);
  });

  test('empty change list summarizes to an empty string', () => {
    assert.equal(summarizeChanges([]), '');
  });

  test('describeChange covers every kind without throwing', () => {
    const schema = (req: string[]) => ({ type: 'object', required: req });
    const a = snap(
      [product({ price: { amount: 1, currency: 'USD' }, stock: { status: 'in_stock' } })],
      [purchase({ input: schema([]), output: schema([]) }), { id: 'old' }],
      { policy: { agents_welcome: true }, ttl: 1 },
    );
    const b = snap(
      [product({ price: { amount: 2, currency: 'USD' }, stock: { status: 'low_stock' }, brand: 'B' }), product({ id: 'product:q' })],
      [purchase({ input: schema(['x']), output: schema(['y']) }), { id: 'fresh' }],
      { policy: { agents_welcome: false }, ttl: 2 },
    );
    const kinds = new Set(semanticDiff(a, b).map((c) => c.kind));
    for (const k of ['entity.added', 'field.changed', 'price.changed', 'availability.changed', 'action.added', 'action.removed', 'action.changed', 'policy.changed', 'meta.changed']) {
      assert.ok(kinds.has(k as SemanticChange['kind']), `missing kind ${k}`);
    }
    for (const c of semanticDiff(a, b)) assert.match(describeChange(c), /\S/);
  });
});

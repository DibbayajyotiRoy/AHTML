import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { diff, applyDiff, InvalidDiffError } from '../diff.js';
import { snapshot, computeEtag } from '../snapshot.js';
import type { Snapshot } from '../types.js';

function withProducts(ids: string[]): Snapshot {
  const b = snapshot('https://x.com', 'product_list');
  for (const id of ids) b.add({ id: `product:${id}`, type: 'product', name: id });
  return b.build();
}

describe('diff()', () => {
  test('emits "add" for new entities', () => {
    const prev = withProducts(['a', 'b']);
    const next = withProducts(['a', 'b', 'c']);
    const d = diff(prev, next);
    assert.ok(d.changes.some((c) => c.op === 'add' && (c as { op: 'add'; entity: { id: string } }).entity.id === 'product:c'));
  });

  test('emits "remove" for vanished entities', () => {
    const prev = withProducts(['a', 'b', 'c']);
    const next = withProducts(['a', 'c']);
    const d = diff(prev, next);
    assert.ok(d.changes.some((c) => c.op === 'remove' && (c as { op: 'remove'; id: string }).id === 'product:b'));
  });

  test('emits "update" for changed entity fields', () => {
    const prev = snapshot('https://x.com', 'product_detail').add({ id: 'product:p1', type: 'product', name: 'Old' }).build();
    const next = snapshot('https://x.com', 'product_detail').add({ id: 'product:p1', type: 'product', name: 'New' }).build();
    const d = diff(prev, next);
    assert.ok(d.changes.some((c) => c.op === 'update' && (c as { op: 'update'; id: string }).id === 'product:p1'));
  });

  test('returns an empty change set when snapshots are identical', () => {
    const a = withProducts(['a', 'b']);
    const b = withProducts(['a', 'b']);
    const d = diff(a, b);
    assert.deepEqual(d.changes, []);
  });

  test('carries from_etag and to_etag', () => {
    const a = withProducts(['a']);
    const b = withProducts(['a', 'b']);
    a.etag = 'W/"old"';
    b.etag = 'W/"new"';
    const d = diff(a, b);
    assert.equal(d.from_etag, 'W/"old"');
    assert.equal(d.to_etag, 'W/"new"');
  });

  test('handles action diffs (add / remove)', () => {
    const prev = snapshot('https://x.com', 'product_detail').action({ id: 'buy' }).build();
    const next = snapshot('https://x.com', 'product_detail').action({ id: 'cart' }).build();
    const d = diff(prev, next);
    assert.ok(d.changes.some((c) => c.op === 'add_action' && (c as { op: 'add_action'; action: { id: string } }).action.id === 'cart'));
    assert.ok(d.changes.some((c) => c.op === 'remove_action' && (c as { op: 'remove_action'; id: string }).id === 'buy'));
  });
});

describe('applyDiff()', () => {
  test('applies an add op', () => {
    const prev = withProducts(['a']);
    const next = withProducts(['a', 'b']);
    const restored = applyDiff(prev, diff(prev, next));
    const ids = restored.entities.map((e) => e.id).sort();
    assert.deepEqual(ids, ['product:a', 'product:b']);
  });

  test('applies a remove op', () => {
    const prev = withProducts(['a', 'b']);
    const next = withProducts(['a']);
    const restored = applyDiff(prev, diff(prev, next));
    assert.deepEqual(restored.entities.map((e) => e.id), ['product:a']);
  });

  test('applies an update op', () => {
    const prev = snapshot('https://x.com', 'product_detail').add({ id: 'product:p1', type: 'product', name: 'Old' }).build();
    const next = snapshot('https://x.com', 'product_detail').add({ id: 'product:p1', type: 'product', name: 'New' }).build();
    const restored = applyDiff(prev, diff(prev, next));
    assert.equal((restored.entities[0] as { name: string }).name, 'New');
  });

  test('round-trip: applyDiff(prev, diff(prev, next)) reconstructs next entities/actions', () => {
    const prev = snapshot('https://x.com', 'product_list')
      .add({ id: 'product:a', type: 'product', name: 'A' })
      .add({ id: 'product:b', type: 'product', name: 'B' })
      .action({ id: 'search' })
      .build();
    const next = snapshot('https://x.com', 'product_list')
      .add({ id: 'product:a', type: 'product', name: 'A — refreshed' })
      .add({ id: 'product:c', type: 'product', name: 'C' })
      .action({ id: 'sort' })
      .build();
    const restored = applyDiff(prev, diff(prev, next));
    assert.deepEqual(restored.entities.map((e) => e.id).sort(), ['product:a', 'product:c']);
    assert.deepEqual(restored.actions.map((a) => a.id), ['sort']);
    assert.equal((restored.entities.find((e) => e.id === 'product:a') as { name: string }).name, 'A — refreshed');
  });

  test('etag after applyDiff matches the to_etag', () => {
    const prev = withProducts(['a']);
    const next = withProducts(['a', 'b']);
    prev.etag = computeEtag(prev);
    next.etag = computeEtag(next);
    const restored = applyDiff(prev, diff(prev, next));
    assert.equal(restored.etag, next.etag);
  });

  test('rejects a malformed update patch (regression: v0.4.0)', () => {
    const prev = snapshot('https://x.com', 'product_detail')
      .add({ id: 'product:p1', type: 'product', name: 'A' })
      .build();
    // A patch with an unknown entity type — should be refused, not cached.
    const badDiff = {
      ahtml: '0.1' as const,
      url: 'https://x.com',
      changes: [
        { op: 'update' as const, id: 'product:p1', patch: { id: 'product:p1', type: 'mystery' as 'product', name: 'X' } },
      ],
    };
    assert.throws(() => applyDiff(prev, badDiff), InvalidDiffError);
  });

  test('rejects a malformed add_action (regression: v0.4.0)', () => {
    const prev = snapshot('https://x.com', 'product_detail').build();
    const badDiff = {
      ahtml: '0.1' as const,
      url: 'https://x.com',
      // Missing required action.id
      changes: [{ op: 'add_action' as const, action: { id: '' } }],
    };
    assert.throws(() => applyDiff(prev, badDiff), InvalidDiffError);
  });
});

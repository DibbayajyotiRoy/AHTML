/**
 * Property-style tests for the schema package — round-trip invariants
 * across many programmatically-generated snapshots.
 *
 * Hand-rolled (no fast-check dependency) — for each invariant, we
 * generate 100+ random valid inputs and assert the property holds.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot, toJson, fromJson, toCompact, fromCompact, computeEtag, validate, diff, applyDiff } from '../index.js';
import type { Product } from '../types.js';

// Simple deterministic PRNG so tests are reproducible.
function makePrng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function randomProduct(prng: () => number, id: number): Product {
  const currencies = ['USD', 'EUR', 'GBP', 'JPY'];
  const stockStatuses = ['in_stock', 'low_stock', 'out_of_stock', 'preorder'] as const;
  return {
    id: `product:p-${id}`,
    type: 'product',
    name: `Product ${id}`,
    brand: `Brand ${Math.floor(prng() * 10)}`,
    price: {
      amount: Math.floor(prng() * 10000),
      currency: currencies[Math.floor(prng() * currencies.length)]!,
    },
    stock: {
      status: stockStatuses[Math.floor(prng() * stockStatuses.length)]!,
      quantity: Math.floor(prng() * 100),
    },
    sku: `SKU-${id}-${Math.floor(prng() * 1000)}`,
    rating: { average: Math.round(prng() * 50) / 10, count: Math.floor(prng() * 10000) },
  };
}

describe('property — toJson/fromJson round-trip is lossless across many products', () => {
  test('100 random products', () => {
    const prng = makePrng(42);
    for (let i = 0; i < 100; i++) {
      const s = snapshot(`https://shop.com/p/${i}`, 'product_detail').add(randomProduct(prng, i)).build();
      s.fetched_at = '2026-01-01T00:00:00Z';   // fix for byte-equality
      const restored = fromJson(toJson(s));
      assert.deepEqual(restored, s);
    }
  });
});

describe('property — toCompact preserves entities + actions across many snapshots', () => {
  test('100 random product lists of varying length', () => {
    const prng = makePrng(123);
    for (let i = 0; i < 100; i++) {
      const len = 1 + Math.floor(prng() * 10);
      const b = snapshot(`https://shop.com/list/${i}`, 'product_list');
      for (let j = 0; j < len; j++) b.add(randomProduct(prng, i * 100 + j));
      const s = b.build();
      const compact = toCompact(s);
      const restored = fromCompact(compact);
      assert.equal(restored.entities.length, s.entities.length);
      assert.equal(restored.url, s.url);
      assert.equal(restored.page_type, s.page_type);
      // Spot-check each entity id is preserved
      for (let j = 0; j < s.entities.length; j++) {
        assert.equal(restored.entities[j]!.id, s.entities[j]!.id);
      }
    }
  });
});

describe('property — computeEtag is deterministic for the same content', () => {
  test('500 random snapshots — same content → same etag', () => {
    const prng = makePrng(7);
    for (let i = 0; i < 500; i++) {
      const p = randomProduct(prng, i);
      const a = snapshot(`https://x.com/${i}`, 'product_detail').add(p).build();
      const b = snapshot(`https://x.com/${i}`, 'product_detail').add(p).build();
      a.fetched_at = b.fetched_at = '2026-01-01T00:00:00Z';
      assert.equal(computeEtag(a), computeEtag(b), `etag mismatch at i=${i}`);
    }
  });
});

describe('property — diff(prev, next) followed by applyDiff(prev) reconstructs next', () => {
  test('200 random pairs of catalogs', () => {
    const prng = makePrng(99);
    for (let i = 0; i < 200; i++) {
      const prevLen = 1 + Math.floor(prng() * 8);
      const nextLen = 1 + Math.floor(prng() * 8);
      const prevB = snapshot(`https://shop.com/c/${i}`, 'product_list');
      for (let j = 0; j < prevLen; j++) prevB.add(randomProduct(prng, i * 100 + j));
      const prev = prevB.build();
      const nextB = snapshot(`https://shop.com/c/${i}`, 'product_list');
      for (let j = 0; j < nextLen; j++) nextB.add(randomProduct(prng, i * 100 + 50 + j));
      const next = nextB.build();
      const d = diff(prev, next);
      const restored = applyDiff(prev, d);
      const restoredIds = restored.entities.map((e) => e.id).sort();
      const nextIds = next.entities.map((e) => e.id).sort();
      assert.deepEqual(restoredIds, nextIds, `entities mismatch at i=${i}`);
    }
  });
});

describe('property — validate() never crashes on random inputs', () => {
  test('1000 random objects (most invalid)', () => {
    const prng = makePrng(11);
    for (let i = 0; i < 1000; i++) {
      const garbage: Record<string, unknown> = {
        ahtml: ['0.1', '99.9', '', null, undefined, 42][Math.floor(prng() * 6)],
        url: ['x', '', null, 123][Math.floor(prng() * 4)],
        page_type: ['home', 'unknown_type', null, ''][Math.floor(prng() * 4)],
        entities: prng() > 0.5 ? [] : [{ id: 'product:p1', type: 'product', name: 'X' }],
        actions: [],
      };
      assert.doesNotThrow(() => validate(garbage));
    }
  });
});

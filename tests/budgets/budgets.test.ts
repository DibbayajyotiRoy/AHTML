/**
 * Performance budgets — the PLAN-NEXT-5.md tables, enforced as CI tests.
 *
 * Methodology
 * -----------
 * Every budget is timed with `performance.now()`: at least 20 warm-up
 * iterations (JIT / inline-cache warm), then the median of the measured
 * runs — 100 runs for the cheap synchronous operations, 30 for the
 * WebCrypto sign/verify pair. `AHTMLError` construction is far below
 * timer noise for a single call, so it is timed in batches of 1,000
 * constructions per sample and reported per construction.
 *
 * BUDGET_SCALE
 * ------------
 * Every limit is multiplied by the `BUDGET_SCALE` env var (default `1`).
 * Shared CI runners are noisier and slower than dev machines, so CI sets
 * `BUDGET_SCALE=2`; the real contract is enforced at scale 1 on real
 * hardware. Raising the scale is a visible diff in the workflow file —
 * budgets can only be loosened in the open.
 *
 * Budgets enforced here (limits at scale 1):
 *   v0.5  fromCompact() on a 100-entity snapshot   < 3 ms median, < 8 ms p99
 *   v0.5  toCompact() on the same                  < 2 ms median, < 5 ms p99
 *   v0.5  applyDiff() with 100 changes             < 2 ms median
 *   v0.5  1,000-iteration round-trip               < 1 MB retained heap
 *   v0.6  AHTMLError construction                  < 50 µs
 *   v0.8  signSnapshot() (ES256, 100 entities)     < 5 ms median
 *   v0.8  verifySnapshot() (same)                  < 3 ms median
 *
 * Deliberately omitted: the v0.9 OTel-overhead budgets (< 5 % of baseline
 * with a tracer attached, < 0.5 % no-op). A percentage-of-baseline
 * comparison between two timed runs flakes constantly on shared CI
 * runners — a 2 % scheduler hiccup reads as a 4x budget breach. That
 * budget stays a manual check against the Jaeger demo, not a CI gate.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  snapshot,
  toCompact,
  fromCompact,
  diff,
  applyDiff,
  signSnapshot,
  verifySnapshot,
  AHTMLError,
  type SignKey,
  type VerifyKey,
} from '@ahtmljs/schema';
import type { Product, Snapshot } from '@ahtmljs/schema';

const SCALE = Number(process.env.BUDGET_SCALE ?? '1');
assert.ok(Number.isFinite(SCALE) && SCALE > 0, `BUDGET_SCALE must be a positive number, got ${process.env.BUDGET_SCALE}`);

/* -------------------------------------------------------------------------- */
/* measurement helpers                                                        */
/* -------------------------------------------------------------------------- */

// Results land here so V8 can never dead-code-eliminate the measured call.
let sink: unknown;

function median(samples: number[]): number {
  const s = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function p99(samples: number[]): number {
  const s = [...samples].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(s.length * 0.99) - 1)]!;
}

/** Warm up, then return per-run elapsed milliseconds. */
function measureSync(fn: () => unknown, runs: number, warmup = 20): number[] {
  for (let i = 0; i < warmup; i++) sink = fn();
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    sink = fn();
    samples.push(performance.now() - t0);
  }
  return samples;
}

async function measureAsync(fn: () => Promise<unknown>, runs: number, warmup = 20): Promise<number[]> {
  for (let i = 0; i < warmup; i++) sink = await fn();
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    sink = await fn();
    samples.push(performance.now() - t0);
  }
  return samples;
}

function assertBudget(label: string, measuredMs: number, limitAtScale1Ms: number): void {
  const limit = limitAtScale1Ms * SCALE;
  assert.ok(
    measuredMs < limit,
    `${label}: measured ${measuredMs.toFixed(4)} ms, budget ${limit.toFixed(4)} ms ` +
      `(${limitAtScale1Ms} ms × BUDGET_SCALE=${SCALE})`,
  );
}

/* -------------------------------------------------------------------------- */
/* fixture — a realistic 100-entity product-catalog snapshot                  */
/* -------------------------------------------------------------------------- */

function buildCatalog(priceBump = 0): Snapshot {
  const b = snapshot('https://shop.example.com/catalog', 'product_list')
    .ttl(300)
    .etag('W/"catalog-v1"')
    .fetchedAt('2026-06-01T00:00:00.000Z')
    .policy({ agents_welcome: true, license: 'CC-BY-4.0', rate_limit: '60/min' });

  for (let i = 0; i < 100; i++) {
    const p: Product = {
      id: `product:sku-${1000 + i}`,
      type: 'product',
      name: `Trail Running Shoe ${i}`,
      brand: i % 3 === 0 ? 'Acme' : i % 3 === 1 ? 'Globex' : 'Initech',
      sku: `TRS-${1000 + i}`,
      price: { amount: 80 + i + priceBump, currency: 'USD' },
      list_price: { amount: 120 + i, currency: 'USD' },
      stock: { status: i % 7 === 0 ? 'low_stock' : 'in_stock', quantity: 3 + (i % 40) },
      rating: { average: 3.5 + (i % 15) / 10, count: 12 + i * 7 },
      category: 'footwear/running/trail',
      description: `Lightweight trail running shoe with a rock plate, ${4 + (i % 4)} mm drop, and a grippy outsole. Item ${i} of the summer catalog.`,
      attributes: { color: ['red', 'blue', 'green', 'black'][i % 4]!, weight_g: 230 + i, waterproof: i % 2 === 0 },
      images: [
        { url: `https://cdn.example.com/p/${i}/main.jpg`, alt: `Shoe ${i}, side view`, width: 1200, height: 800 },
        { url: `https://cdn.example.com/p/${i}/sole.jpg`, alt: `Shoe ${i}, outsole`, width: 1200, height: 800 },
      ],
    };
    if (i % 10 === 0) {
      p.variants = [
        { id: `product:sku-${1000 + i}-s`, attributes: { size: 'S' }, stock: { status: 'in_stock', quantity: 5 } },
        { id: `product:sku-${1000 + i}-m`, attributes: { size: 'M' }, stock: { status: 'low_stock', quantity: 1 } },
      ];
    }
    b.add(p);
  }

  b.action(
    { id: 'add_to_cart', label: 'Add to cart', method: 'POST', execute_url: '/api/cart', category: 'create', auth: 'optional' },
    { id: 'buy_now', label: 'Buy now', method: 'POST', execute_url: '/api/checkout', category: 'transact', auth: 'required', confirmation: 'required', side_effects: ['charge_card', 'email_buyer'], cost: { amount: 0, currency: 'USD', category: 'purchase' } },
  );
  return b.build();
}

const catalog = buildCatalog();
const compactText = toCompact(catalog);

// Every entity's price changes → exactly 100 `update` ops for applyDiff().
const catalogNext = buildCatalog(5);
const hundredChanges = diff(catalog, catalogNext);
assert.equal(hundredChanges.changes.length, 100, 'fixture must produce exactly 100 diff changes');

/* -------------------------------------------------------------------------- */
/* budgets                                                                    */
/* -------------------------------------------------------------------------- */

describe('performance budgets (PLAN-NEXT-5.md)', () => {
  test('fromCompact() on a 100-entity snapshot: < 3 ms median, < 8 ms p99', () => {
    const samples = measureSync(() => fromCompact(compactText), 100);
    assertBudget('fromCompact median', median(samples), 3);
    assertBudget('fromCompact p99', p99(samples), 8);
  });

  test('toCompact() on a 100-entity snapshot: < 2 ms median, < 5 ms p99', () => {
    const samples = measureSync(() => toCompact(catalog), 100);
    assertBudget('toCompact median', median(samples), 2);
    assertBudget('toCompact p99', p99(samples), 5);
  });

  test('applyDiff() with 100 changes: < 2 ms median', () => {
    const samples = measureSync(() => applyDiff(catalog, hundredChanges), 100);
    assertBudget('applyDiff median', median(samples), 2);
  });

  test('AHTMLError construction: < 50 µs', () => {
    // A single construction is below performance.now() noise, so each
    // sample is a 1,000-construction batch; the budget is checked on the
    // median per-construction time across 100 batches.
    const BATCH = 1_000;
    const cause = new Error('upstream socket reset');
    const samples = measureSync(() => {
      let last: AHTMLError | undefined;
      for (let i = 0; i < BATCH; i++) {
        last = new AHTMLError({
          code: 'RATE_LIMITED',
          message: 'server replied 429',
          status: 429,
          retryAfterMs: 12_000,
          hint: "Server returned Retry-After: 12s. Pass { retry: 'auto' } to retry transparently.",
          context: 'https://shop.example.com/catalog',
          cause,
        });
      }
      return last;
    }, 100);
    const perConstructionMs = median(samples) / BATCH;
    assertBudget('AHTMLError construction', perConstructionMs, 0.05);
  });

  test('signSnapshot() ES256 over a 100-entity snapshot: < 5 ms median', async () => {
    const { sign } = await makeEs256KeyPair();
    const samples = await measureAsync(() => signSnapshot(catalog, sign), 30);
    assertBudget('signSnapshot median', median(samples), 5);
  });

  test('verifySnapshot() of a 100-entity snapshot: < 3 ms median', async () => {
    const { sign, verify } = await makeEs256KeyPair();
    const jws = await signSnapshot(catalog, sign);
    const samples = await measureAsync(async () => {
      const result = await verifySnapshot(catalog, jws, { trustedKeys: [verify] });
      assert.equal(result.ok, true, `verification must succeed while being timed: ${JSON.stringify(result)}`);
      return result;
    }, 30);
    assertBudget('verifySnapshot median', median(samples), 3);
  });

  // tsx cannot reliably pass --expose-gc through to the test runner, so this
  // budget only runs when a gc handle is present (e.g.
  // NODE_OPTIONS=--expose-gc npm run test:budgets). Without gc we cannot
  // distinguish "retained" from "not yet collected", so we skip rather than
  // report a meaningless number.
  test(
    'memory: 1,000-iteration compact round-trip retains < 1 MB',
    { skip: typeof globalThis.gc !== 'function' && 'global.gc unavailable — run with --expose-gc to enforce this budget' },
    () => {
      const gc = globalThis.gc!;
      gc();
      const before = process.memoryUsage().heapUsed;
      for (let i = 0; i < 1_000; i++) {
        sink = fromCompact(toCompact(catalog));
      }
      sink = undefined;
      gc();
      const retained = process.memoryUsage().heapUsed - before;
      const limit = 1024 * 1024 * SCALE;
      assert.ok(
        retained < limit,
        `round-trip retained ${(retained / 1024).toFixed(1)} KiB, budget ${(limit / 1024).toFixed(0)} KiB ` +
          `(1024 KiB × BUDGET_SCALE=${SCALE})`,
      );
    },
  );
});

/* -------------------------------------------------------------------------- */
/* key helpers                                                                */
/* -------------------------------------------------------------------------- */

async function makeEs256KeyPair(): Promise<{ sign: SignKey; verify: VerifyKey }> {
  // Bare Node 18 only exposes Web Crypto via node:crypto — same fallback
  // the sign module itself uses.
  const subtle =
    globalThis.crypto?.subtle ?? ((await import('node:crypto')).webcrypto.subtle as unknown as SubtleCrypto);
  const pair = (await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  return {
    sign: { alg: 'ES256', key: pair.privateKey },
    verify: { alg: 'ES256', key: pair.publicKey },
  };
}

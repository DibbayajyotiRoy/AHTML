/**
 * @ahtmljs/insights performance budget — T5.4.
 *
 * Acceptance criterion (ROADMAP Feature 4): recording adds ≤ 1 ms p95
 * overhead to a snapshot response with the in-memory KV backend.
 *
 * The measurement harness — warmup, median/p95/p99, BUDGET_SCALE, and
 * assertBudget — is copied from `tests/budgets/budgets.test.ts` so both
 * budget suites enforce their limits the same way (CI sets BUDGET_SCALE=2;
 * the real contract holds at scale 1 on real hardware).
 *
 * What is measured: the full per-request recording path on the dominant
 * snapshot-fetch case — classify (no signature → no crypto), format
 * negotiation from the response Content-Type, and the two KV writes
 * (`incr` + `set`) that append the sanitized event to the memory store.
 * The RFC 9421 verify path is intentionally excluded: it only runs for the
 * rare verified-agent request, not on ordinary snapshot responses, and its
 * cost is WebCrypto's, not the recorder's.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { createInsights } from '@ahtmljs/insights';
import { InMemoryKvStore } from '@ahtmljs/kv';

const SCALE = Number(process.env.BUDGET_SCALE ?? '1');
assert.ok(Number.isFinite(SCALE) && SCALE > 0, `BUDGET_SCALE must be a positive number, got ${process.env.BUDGET_SCALE}`);

/* -------------------------------------------------------------------------- */
/* measurement helpers (mirrors tests/budgets/budgets.test.ts)                */
/* -------------------------------------------------------------------------- */

let sink: unknown;

function median(samples: number[]): number {
  const s = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function percentile(samples: number[], p: number): number {
  const s = [...samples].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(s.length * p) - 1)]!;
}
const p95 = (s: number[]) => percentile(s, 0.95);
const p99 = (s: number[]) => percentile(s, 0.99);

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
/* fixture — a representative snapshot-fetch request/response pair             */
/* -------------------------------------------------------------------------- */

const SITE = 'https://shop.example.com';

// A declared-bot fetch (has a User-Agent to match, no signature) — the common
// snapshot-response case a publisher actually serves.
const req = new Request(`${SITE}/ahtml/store/products/widget-pro`, {
  method: 'GET',
  headers: { 'user-agent': 'Mozilla/5.0 (compatible; ClaudeBot/1.0)' },
});
const res = new Response('body', {
  status: 200,
  headers: { 'content-type': 'application/ahtml+json' },
});

/* -------------------------------------------------------------------------- */
/* budget                                                                     */
/* -------------------------------------------------------------------------- */

describe('@ahtmljs/insights performance budget (T5.4)', () => {
  test('record() adds ≤ 1 ms p95 overhead per request on memory KV', async () => {
    const ins = createInsights({ kv: new InMemoryKvStore(), site: SITE });

    const samples = await measureAsync(() => ins.record(req, res), 500, 50);

    // Headline criterion: p95 ≤ 1 ms.
    assertBudget('insights record p95', p95(samples), 1);
    // Secondary guards so a pathological tail still fails visibly.
    assertBudget('insights record median', median(samples), 1);
    assertBudget('insights record p99', p99(samples), 2);
  });
});

/**
 * Badge cached-path latency budget (TASKS.md T3.4): serve a CACHED badge in
 * <500 ms p95. Measured on the in-process handler with the same
 * warmup/median/p99 methodology as tests/budgets/budgets.test.ts (BUDGET_SCALE
 * honored). Network transit is a deployment property; the budget guards the
 * compute path — SVG render + cache lookup — which must stay trivially fast.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createBadgeHandler } from '@ahtmljs/badge';

const SCALE = Number(process.env.BUDGET_SCALE ?? '1');

function p95(samples: number[]): number {
  const s = [...samples].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(s.length * 0.95) - 1)]!;
}

describe('badge budgets', () => {
  test('cached badge serve: < 500 ms p95', async () => {
    const handler = createBadgeHandler({
      score: async (url) => ({ url, score: 100, grade: 'A+', checks: [] }),
      fetch: (async () => new Response('{}', { status: 404 })) as typeof fetch,
      rateLimit: 1_000_000,
    });
    const req = () =>
      new Request('https://badge.example.com/badge?url=' + encodeURIComponent('https://x.com/'), {
        headers: { 'cf-connecting-ip': '1.1.1.1' },
      });

    await handler(req()); // populate the cache (the one score+ttl call)
    for (let i = 0; i < 20; i++) await handler(req()); // warmup

    const samples: number[] = [];
    for (let i = 0; i < 100; i++) {
      const t0 = performance.now();
      const res = await handler(req());
      samples.push(performance.now() - t0);
      assert.equal(res.headers.get('x-ahtml-badge-cache'), 'hit');
    }
    const measured = p95(samples);
    assert.ok(
      measured < 500 * SCALE,
      `cached badge p95 ${measured.toFixed(2)} ms exceeds ${500 * SCALE} ms budget`,
    );
  });
});

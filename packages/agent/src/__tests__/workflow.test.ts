import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot } from '@ahtmljs/schema';
import { runAction, ActionRefused } from '../workflow.js';
import type { Action } from '@ahtmljs/schema';

function snapWith(action: Action) {
  return snapshot('https://x.com', 'product_detail')
    .policy({ agents_welcome: true })
    .add({ id: 'product:p', type: 'product', name: 'P' })
    .action(action)
    .build();
}

describe('runAction — safety gates', () => {
  test('refuses an auth=required action without a bearer', async () => {
    const s = snapWith({ id: 'buy', auth: 'required', execute_url: '/api/buy' });
    await assert.rejects(
      () => runAction(s, s.actions[0]!, {}, {}),
      (err: Error) => err instanceof ActionRefused && err.message.includes('requires auth'),
    );
  });

  test('refuses confirmation=required action without { confirm: true }', async () => {
    const s = snapWith({ id: 'buy', confirmation: 'required', execute_url: '/api/buy' });
    await assert.rejects(
      () => runAction(s, s.actions[0]!, {}, {}),
      (err: Error) => err instanceof ActionRefused && err.message.includes('confirmation'),
    );
  });

  test('refuses when site policy says agents_welcome: false', async () => {
    const s = snapshot('https://x.com', 'product_detail')
      .policy({ agents_welcome: false })
      .action({ id: 'buy', execute_url: '/api/buy' })
      .build();
    await assert.rejects(
      () => runAction(s, s.actions[0]!, {}, {}),
      (err: Error) => err instanceof ActionRefused && err.message.includes('agents_welcome'),
    );
  });

  test('skipChecks: true bypasses the gates (escape hatch for low-stakes flows)', async () => {
    const s = snapWith({ id: 'buy', auth: 'required', confirmation: 'required', execute_url: '/api/buy' });
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
    const res = await runAction(s, s.actions[0]!, {}, {
      skipChecks: true,
      bearer: 'bypass',
      confirm: true,
      fetch: fakeFetch,
    });
    assert.equal(res.status, 'executed');
  });
});

describe('runAction — dry-run', () => {
  test('returns synthetic dry-run when no preview_url is set', async () => {
    const s = snapWith({
      id: 'buy',
      auth: 'required',
      cost: { amount: 99, currency: 'USD', category: 'purchase' },
      reversible: { reversible: true, window: 'P30D' },
      side_effects: ['charge_card'],
      execute_url: '/api/buy',
    });
    const res = await runAction(s, s.actions[0]!, {}, { bearer: 'tok', dryRun: true });
    assert.equal(res.status, 'dry_run');
    if (res.status === 'dry_run') {
      assert.deepEqual(res.would_charge, { amount: 99, currency: 'USD' });
      assert.deepEqual(res.would_side_effects, ['charge_card']);
    }
  });

  test('calls preview_url when provided and returns its preview body', async () => {
    const s = snapWith({
      id: 'buy',
      auth: 'required',
      cost: { amount: 50, currency: 'USD', category: 'purchase' },
      preview_url: 'https://x.com/api/buy/preview',
      execute_url: 'https://x.com/api/buy',
      side_effects: ['charge_card'],
    });
    let previewWasHit = false;
    const fakeFetch = (async (url: string | URL | Request) => {
      const u = typeof url === 'string' ? url : (url as { url: string }).url;
      if (u.endsWith('/preview')) {
        previewWasHit = true;
        return new Response(JSON.stringify({ tentative_total: 50 }), {
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error('execute_url should NOT be called during dry-run');
    }) as unknown as typeof fetch;
    const res = await runAction(s, s.actions[0]!, {}, {
      bearer: 'tok',
      dryRun: true,
      fetch: fakeFetch,
    });
    assert.equal(res.status, 'dry_run');
    assert.ok(previewWasHit);
    if (res.status === 'dry_run') {
      assert.deepEqual(res.preview, { tentative_total: 50 });
    }
  });
});

describe('runAction — execute path', () => {
  test('POSTs to execute_url with input + Authorization bearer + JSON body', async () => {
    const s = snapWith({
      id: 'subscribe',
      auth: 'required',
      execute_url: 'https://x.com/api/subscribe',
      method: 'POST',
    });
    let capturedReq: { url: string; method?: string; auth?: string; body?: string } | null = null;
    const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = typeof url === 'string' ? url : (url as { url: string }).url;
      capturedReq = {
        url: u,
        method: init?.method,
        auth: (init?.headers as Record<string, string>)?.authorization,
        body: init?.body as string,
      };
      return new Response(JSON.stringify({ id: 'sub_1' }), {
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;
    const res = await runAction(s, s.actions[0]!, { email: 'a@b.c' }, {
      bearer: 'tok',
      fetch: fakeFetch,
    });
    assert.equal(res.status, 'executed');
    assert.equal(capturedReq!.url, 'https://x.com/api/subscribe');
    assert.equal(capturedReq!.method, 'POST');
    assert.equal(capturedReq!.auth, 'Bearer tok');
    assert.equal(capturedReq!.body, JSON.stringify({ email: 'a@b.c' }));
    if (res.status === 'executed') {
      assert.deepEqual(res.output, { id: 'sub_1' });
    }
  });

  test('throws when execute_url is missing and dryRun is not set', async () => {
    const s = snapWith({ id: 'buy', execute_url: undefined });
    await assert.rejects(
      () => runAction(s, s.actions[0]!, {}, { confirm: true }),
      (err: Error) => err.message.includes('no execute_url'),
    );
  });

  test('throws on non-2xx execute response', async () => {
    const s = snapWith({ id: 'buy', execute_url: 'https://x.com/api/buy' });
    const fakeFetch = (async () => new Response('{"error":"bad"}', { status: 400, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
    await assert.rejects(
      () => runAction(s, s.actions[0]!, {}, { confirm: true, fetch: fakeFetch }),
      (err: Error) => err.message.includes('failed: 400'),
    );
  });
});

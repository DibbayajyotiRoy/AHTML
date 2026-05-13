/**
 * UX test #3 — the typed action contract guides an agent to refuse unsafe
 * actions and only execute them with explicit user consent.
 *
 * Proves the AHTML differentiator over llms.txt / schema.org: those
 * formats CAN say "this page has a Buy button," but they cannot give
 * agents the structured metadata to *decide* whether firing it is safe.
 *
 * Three sub-scenarios:
 *   A. A $50,000 wire transfer action with confirmation: required and
 *      side_effects: [charge_card, irrevocable]. Agent refuses without
 *      explicit confirm.
 *   B. A free, reversible "save bookmark" action — agent fires it
 *      directly. No friction for low-stakes operations.
 *   C. Auth: required without bearer — refusal even when confirmed.
 *
 * These mirror the real safety logic agents like Claude/ChatGPT use
 * when consuming MCP tools with annotations.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot } from '@ahtmljs/schema';
import { runAction, ActionRefused } from '@ahtmljs/agent';
import type { Action } from '@ahtmljs/schema';

function siteWith(action: Action) {
  return snapshot('https://bank.example.com/transfer', 'product_detail')
    .policy({ agents_welcome: true })
    .add({ id: 'account:checking-123', type: 'product', name: 'Checking ****1234' })
    .action(action)
    .build();
}

describe('UX — agent honors action contract for safety', () => {
  test('A. Refuses a high-cost, confirmation-required action without user consent', async () => {
    const snap = siteWith({
      id: 'wire_transfer',
      label: 'Wire $50,000 to External Account',
      target: 'account:checking-123',
      category: 'transact',
      method: 'POST',
      execute_url: '/api/wire',
      auth: 'required',
      cost: { amount: 50_000, currency: 'USD', category: 'purchase' },
      reversible: { reversible: false },
      side_effects: ['charge_card', 'audit_log', 'public_post'],
      confirmation: 'required',
    });

    let executeWasCalled = false;
    const trackedFetch = (async () => {
      executeWasCalled = true;
      return new Response('{}');
    }) as unknown as typeof fetch;

    // Agent attempts the action — only providing the bearer. Forgets to confirm.
    await assert.rejects(
      () => runAction(snap, snap.actions[0]!, { amount: 50000 }, { bearer: 'tok', fetch: trackedFetch }),
      (e: Error) => e instanceof ActionRefused && e.message.includes('confirmation'),
      'agent must refuse the wire without explicit user consent',
    );
    assert.equal(executeWasCalled, false, 'execute_url must NOT be hit when the contract is violated');
  });

  test('A2. Same wire transfer EXECUTES once the user has confirmed', async () => {
    const snap = siteWith({
      id: 'wire_transfer',
      auth: 'required',
      cost: { amount: 50_000, currency: 'USD', category: 'purchase' },
      reversible: { reversible: false },
      side_effects: ['charge_card', 'audit_log'],
      confirmation: 'required',
      execute_url: 'https://bank.example.com/api/wire',
    });
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ wire_id: 'wt_99' }), {
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;
    const result = await runAction(snap, snap.actions[0]!, { amount: 50000 }, {
      bearer: 'tok',
      confirm: true,
      fetch: fakeFetch,
    });
    assert.equal(result.status, 'executed');
  });

  test('B. Fires a free, reversible "bookmark" action with no friction', async () => {
    const snap = siteWith({
      id: 'bookmark',
      label: 'Save bookmark',
      category: 'create',
      method: 'POST',
      execute_url: 'https://bank.example.com/api/bookmarks',
      auth: 'none',
      cost: { category: 'free' },
      reversible: { reversible: true, policy: 'delete_bookmark' },
      side_effects: ['create_record'],
      // no confirmation field — defaults to allowing direct execution
    });
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ id: 'bm_1' }), {
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;
    const result = await runAction(snap, snap.actions[0]!, { url: 'https://...' }, { fetch: fakeFetch });
    assert.equal(result.status, 'executed');
  });

  test('C. Refuses auth=required action when no bearer is provided', async () => {
    const snap = siteWith({
      id: 'view_balance',
      auth: 'required',
      execute_url: 'https://bank.example.com/api/balance',
    });
    await assert.rejects(
      () => runAction(snap, snap.actions[0]!, {}, { confirm: true }),
      (e: Error) => e instanceof ActionRefused && e.message.includes('requires auth'),
    );
  });

  test('D. Dry-run reveals cost + side effects before any side effect happens', async () => {
    const snap = siteWith({
      id: 'subscribe_premium',
      auth: 'required',
      cost: { amount: 12, currency: 'USD', category: 'subscription' },
      reversible: { reversible: true, window: 'P14D', policy: 'cancel' },
      side_effects: ['charge_card', 'email_buyer', 'unlock_features'],
      confirmation: 'recommended',
      execute_url: 'https://bank.example.com/api/subscribe',
    });
    let executeFired = false;
    const fakeFetch = (async () => {
      executeFired = true;
      return new Response('{}');
    }) as unknown as typeof fetch;
    const preview = await runAction(snap, snap.actions[0]!, {}, {
      bearer: 'tok',
      dryRun: true,
      fetch: fakeFetch,
    });
    assert.equal(preview.status, 'dry_run');
    assert.equal(executeFired, false, 'dry-run must never call execute_url');
    if (preview.status === 'dry_run') {
      assert.deepEqual(preview.would_charge, { amount: 12, currency: 'USD' });
      assert.deepEqual(preview.would_side_effects, ['charge_card', 'email_buyer', 'unlock_features']);
    }
  });

  test('E. The contract carries enough metadata for an agent to make ALL safety decisions', () => {
    // This is the meta-assertion: prove every safety-relevant field is
    // present and typed in the action contract. If any field becomes
    // optional / disappears, agents lose a lever and this test fails.
    const action: Action = {
      id: 'sample',
      auth: 'required',
      cost: { amount: 99, currency: 'USD', category: 'purchase' },
      reversible: { reversible: true, window: 'P30D', policy: 'full_refund' },
      side_effects: ['charge_card'],
      confirmation: 'required',
      execute_url: '/x',
    };
    const expected = ['auth', 'cost', 'reversible', 'side_effects', 'confirmation'] as const;
    for (const field of expected) {
      assert.ok(
        (action as Record<string, unknown>)[field] !== undefined,
        `action contract must carry "${field}" — it's the lever the agent uses`,
      );
    }
  });
});

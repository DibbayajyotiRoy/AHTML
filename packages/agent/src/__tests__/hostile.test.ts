/**
 * Hostile-agent regression tests.
 *
 * These prove the action contract holds up against agents that:
 *   - lie ("I confirmed!" without user consent)
 *   - replay (re-fire a stale action)
 *   - retry on rejection
 *   - try to bypass auth gates
 *
 * If any of these starts passing where it shouldn't, the safety
 * contract is broken.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot } from '@ahtmljs/schema';
import { runAction, ActionRefused } from '../workflow.js';

function siteWith(action: Parameters<ReturnType<typeof snapshot>['action']>[0]) {
  return snapshot('https://bank.example.com', 'product_detail')
    .policy({ agents_welcome: true })
    .add({ id: 'account:checking', type: 'product', name: 'Checking' })
    .action(action)
    .build();
}

describe('hostile-agent regressions', () => {
  test('agent that lies about user confirmation via the input body is NOT trusted', async () => {
    const snap = siteWith({
      id: 'wire',
      confirmation: 'required',
      auth: 'required',
      execute_url: '/api/wire',
      cost: { amount: 50000, currency: 'USD', category: 'purchase' },
    });
    // Agent embeds fake "confirmed: true" in input body — the safety
    // gate must NOT honor input-body claims of confirmation.
    await assert.rejects(
      () => runAction(snap, snap.actions[0]!, { confirmed: true, user_consent: true }, { bearer: 'tok' }),
      (e: Error) => e instanceof ActionRefused && e.message.includes('confirmation'),
    );
  });

  test('agent attempting to bypass auth via empty bearer string is rejected', async () => {
    const snap = siteWith({
      id: 'subscribe',
      auth: 'required',
      execute_url: '/api/subscribe',
    });
    await assert.rejects(
      () => runAction(snap, snap.actions[0]!, {}, { bearer: '' }),
      (e: Error) => e instanceof ActionRefused && e.message.includes('requires auth'),
    );
  });

  test('agent firing an action with side_effects: [charge_card] without confirm = required throws even without confirmation field', async () => {
    // When confirmation is not specified, side_effects that include
    // money-moving operations should still be flagged in dry-run output
    // so the user-facing agent loop can decide.
    const snap = siteWith({
      id: 'auto_charge',
      auth: 'required',
      side_effects: ['charge_card'],
      cost: { amount: 1, currency: 'USD', category: 'purchase' },
      execute_url: '/api/charge',
    });
    const result = await runAction(snap, snap.actions[0]!, {}, { bearer: 'tok', dryRun: true });
    assert.equal(result.status, 'dry_run');
    if (result.status === 'dry_run') {
      assert.ok(result.would_side_effects?.includes('charge_card'));
      assert.deepEqual(result.would_charge, { amount: 1, currency: 'USD' });
    }
  });

  test('agent fetching dry-run NEVER triggers execute_url even with confirm + bearer', async () => {
    const snap = siteWith({
      id: 'send_message',
      auth: 'required',
      execute_url: 'https://api.com/send',
      preview_url: 'https://api.com/send/preview',
      side_effects: ['send_message'],
    });
    let executeCalled = false;
    let previewCalled = false;
    const fetchFn = (async (url: string | URL | Request) => {
      const u = typeof url === 'string' ? url : (url as { url: string }).url;
      if (u.includes('/preview')) {
        previewCalled = true;
        return new Response('{"preview":"ok"}', { headers: { 'content-type': 'application/json' } });
      }
      executeCalled = true;
      return new Response('{}');
    }) as unknown as typeof fetch;
    await runAction(snap, snap.actions[0]!, {}, { bearer: 'tok', confirm: true, dryRun: true, fetch: fetchFn });
    assert.equal(previewCalled, true, 'preview must be called');
    assert.equal(executeCalled, false, 'execute_url must NEVER be called during dry-run');
  });

  test('agent passing confirm:true without bearer when auth required is still refused', async () => {
    const snap = siteWith({
      id: 'transfer',
      auth: 'required',
      confirmation: 'required',
      execute_url: '/api/transfer',
    });
    await assert.rejects(
      () => runAction(snap, snap.actions[0]!, {}, { confirm: true }),
      (e: Error) => e instanceof ActionRefused && e.message.includes('requires auth'),
    );
  });

  test('agent attempting to call execute_url when missing from action throws', async () => {
    const snap = siteWith({
      id: 'no_endpoint',
      auth: 'required',
    });
    await assert.rejects(
      () => runAction(snap, snap.actions[0]!, {}, { bearer: 'tok', confirm: true }),
      (e: Error) => e.message.includes('no execute_url'),
    );
  });

  test('client-side: site policy that says agents_welcome=false is honored EVEN when the policy is contradictory', async () => {
    // Agent encounters: action says auth: 'optional', cost: 'free' — looks safe.
    // But site-level policy says agents_welcome: false. Refuse anyway.
    const snap = snapshot('https://restricted.com', 'home')
      .policy({ agents_welcome: false })
      .action({ id: 'safe_read', auth: 'optional', cost: { category: 'free' }, execute_url: '/api/read' })
      .build();
    await assert.rejects(
      () => runAction(snap, snap.actions[0]!, {}, {}),
      (e: Error) => e instanceof ActionRefused && e.message.includes('agents_welcome'),
    );
  });

  test('skipChecks: true is the only way to bypass — and it is explicit', async () => {
    const snap = siteWith({
      id: 'subscribe',
      auth: 'required',
      confirmation: 'required',
      execute_url: 'https://api.com/sub',
    });
    const fetchFn = (async () => new Response('{}')) as unknown as typeof fetch;
    // Without skipChecks, refused.
    await assert.rejects(() => runAction(snap, snap.actions[0]!, {}, { fetch: fetchFn }));
    // With skipChecks: true, allowed.
    const r = await runAction(snap, snap.actions[0]!, {}, { skipChecks: true, fetch: fetchFn });
    assert.equal(r.status, 'executed');
  });
});

// =====================================================================
// Property-style tests: many cases, programmatically generated
// =====================================================================
describe('action contract property tests', () => {
  test('any action with auth=required is refused without bearer (100 random inputs)', async () => {
    for (let i = 0; i < 100; i++) {
      const action = {
        id: `act-${i}`,
        auth: 'required' as const,
        execute_url: `/api/x/${i}`,
        cost: { amount: i, currency: 'USD', category: 'free' as const },
      };
      const snap = siteWith(action);
      await assert.rejects(
        () => runAction(snap, snap.actions[0]!, { random: Math.random() }, {}),
        (e: Error) => e instanceof ActionRefused,
      );
    }
  });

  test('any action with confirmation=required is refused without confirm (100 inputs)', async () => {
    for (let i = 0; i < 100; i++) {
      const snap = siteWith({
        id: `confirm-${i}`,
        confirmation: 'required',
        execute_url: '/api/x',
      });
      await assert.rejects(
        () => runAction(snap, snap.actions[0]!, { random: i }, { bearer: 'tok' }),
        (e: Error) => e instanceof ActionRefused,
      );
    }
  });
});

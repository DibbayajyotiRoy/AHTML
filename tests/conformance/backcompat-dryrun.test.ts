/**
 * TASKS.md T7.1 — the dry_run addendum is additive: the PINNED 1.0.0
 * @ahtmljs/agent (installed from npm as `ahtml-agent-pinned-1-0-0`, not the
 * working tree) consumes a dryRun-enabled snapshot without error, ignoring
 * the field entirely per SPEC §12's unknown-field rule.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot, toJson, fromJson, validate, type Action } from '@ahtmljs/schema';
// The published 1.0.0 client — NOT the workspace build.
import * as pinned from 'ahtml-agent-pinned-1-0-0';

const DRY_RUN_ACTION: Action = {
  id: 'subscribe',
  category: 'transact',
  method: 'POST',
  execute_url: 'https://shop.example.com/api/subscribe',
  auth: 'none',
  cost: { amount: 12, currency: 'USD', category: 'subscription' },
  reversible: { reversible: false },
  side_effects: ['charge_card'],
  ...({ dry_run: { url: 'https://shop.example.com/ahtml/actions/subscribe/dry-run' } } as object),
};

const SNAP = snapshot('https://shop.example.com/pricing', 'product_detail')
  .ttl(60)
  .fetchedAt('2026-07-01T00:00:00.000Z')
  .policy({ agents_welcome: true })
  .add({ id: 'product:plan', type: 'product', name: 'Plan' })
  .action(DRY_RUN_ACTION)
  .build();

describe('1.0.0 backcompat with the dry_run addendum (T7.1)', () => {
  test('a dryRun-enabled snapshot round-trips and validates on today’s schema', () => {
    const revived = fromJson(toJson(SNAP));
    assert.deepEqual(
      (revived.actions[0] as { dry_run?: { url: string } }).dry_run,
      { url: 'https://shop.example.com/ahtml/actions/subscribe/dry-run' },
      'the additive field survives canonical serialization',
    );
    const errors = validate(revived).filter((i) => i.severity === 'error');
    assert.deepEqual(errors, []);
  });

  test('pinned 1.0.0 runAction executes the action, silently ignoring dry_run', async () => {
    let hitUrl = '';
    const fakeFetch = (async (input: string | URL | Request) => {
      hitUrl = String(input);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
    const result = await pinned.runAction(SNAP as never, SNAP.actions[0] as never, {}, {
      fetch: fakeFetch,
    } as never);
    assert.equal((result as { status: string }).status, 'executed');
    assert.equal(hitUrl, 'https://shop.example.com/api/subscribe', '1.0.0 goes straight to execute_url');
  });

  test('pinned 1.0.0 dry-run still works via its own semantics (local rehearsal)', async () => {
    // 1.0.0 knows preview_url, not dry_run.url — with neither called for,
    // dryRun falls back to the local contract-derived rehearsal.
    const result = await pinned.runAction(SNAP as never, SNAP.actions[0] as never, {}, {
      dryRun: true,
      fetch: (async () => {
        throw new Error('1.0.0 must not fetch the unknown dry_run.url');
      }) as never,
    } as never);
    assert.equal((result as { status: string }).status, 'dry_run');
    assert.deepEqual((result as { would_charge?: object }).would_charge, { amount: 12, currency: 'USD' });
  });
});

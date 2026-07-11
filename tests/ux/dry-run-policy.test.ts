/**
 * TASKS.md T7.2–T7.5 — the action sandbox end to end (SPEC §4.7, ADR-0003).
 *
 * A fixture checkout with a real (counting) execute handler and a
 * createSimulateHandler dry-run endpoint proves:
 *  - T7.2 simulated responses carry simulated:true + itemized cost +
 *    reversal path, and are signed like real ones;
 *  - T7.3 dry-running 100× mutates nothing and charges zero;
 *  - T7.4 spoofing is refused in both directions;
 *  - T7.5 the strict policy preset blocks irreversible+priced actions
 *    lacking a prior same-parameters dry-run within TTL.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { snapshot, verifyBytes, type Action, type SignKey, type VerifyKey } from '@ahtmljs/schema';
import { createSimulateHandler } from '@ahtmljs/schema/simulate';
import { runAction, ActionRefused, POLICY_PRESETS, DryRunLedger } from '@ahtmljs/agent';

const SITE = 'https://shop.example.com';

const SUBSCRIBE: Action = {
  id: 'subscribe',
  label: 'Subscribe (annual, non-refundable)',
  category: 'transact',
  method: 'POST',
  execute_url: `${SITE}/api/subscribe`,
  auth: 'required',
  cost: { amount: 144, currency: 'USD', category: 'subscription' },
  reversible: { reversible: false },
  side_effects: ['charge_card', 'email_buyer'],
  confirmation: 'required',
  ...({ dry_run: { url: `${SITE}/ahtml/actions/subscribe/dry-run` } } as object),
};

function snapWith(action: Action) {
  return snapshot(`${SITE}/pricing`, 'product_detail')
    .ttl(60)
    .policy({ agents_welcome: true })
    .add({ id: 'product:pro-plan', type: 'product', name: 'Pro Plan' })
    .action(action)
    .build();
}

async function makeKeys(): Promise<{ sign: SignKey; verify: VerifyKey }> {
  const pair = (await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  return { sign: { alg: 'ES256', key: pair.privateKey }, verify: { alg: 'ES256', key: pair.publicKey } };
}

/** The "example checkout": counts every real charge/mutation. */
function makeCheckout(sign: SignKey) {
  const state = { charges: 0, subscriptions: 0, x402Payments: 0 };
  const simulate = createSimulateHandler({
    action: SUBSCRIBE,
    predict: (input) => ({
      predicted_output: { plan: 'pro', input },
      would_charge: { amount: 144, currency: 'USD' },
      reversal: { reversible: false, policy: 'none — annual subscription is final' },
    }),
    sign,
  });
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    if (url.endsWith('/dry-run')) {
      return simulate(new Request(url, { method: 'POST', body: init?.body as string }));
    }
    if (url.endsWith('/api/subscribe')) {
      state.charges++;
      state.subscriptions++;
      state.x402Payments++;
      return new Response(JSON.stringify({ subscription_id: `sub_${state.subscriptions}` }), {
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('not found', { status: 404 });
  };
  return { state, fetchImpl };
}

describe('action sandbox (SPEC §4.7)', () => {
  test('T7.2: simulated response carries simulated:true + itemization + reversal, and is SIGNED', async () => {
    const { sign, verify } = await makeKeys();
    const simulate = createSimulateHandler({
      action: SUBSCRIBE,
      predict: () => ({ predicted_output: { plan: 'pro' } }),
      sign,
    });
    const res = await simulate(new Request('https://x/dry-run', { method: 'POST', body: '{}' }));
    const text = await res.text();
    const body = JSON.parse(text);
    assert.equal(body.simulated, true);
    assert.deepEqual(body.would_charge, { amount: 144, currency: 'USD' }, 'cost itemized from the contract');
    assert.equal(body.reversal.reversible, false, 'reversal path declared');
    const jws = res.headers.get('x-ahtml-signature');
    assert.ok(jws, 'simulated responses sign like real ones');
    assert.equal(await verifyBytes(new TextEncoder().encode(text), jws!, [verify]), true);
    // Tampered body must fail the same signature.
    assert.equal(
      await verifyBytes(new TextEncoder().encode(text.replace('144', '1')), jws!, [verify]),
      false,
    );
  });

  test('T7.3: 100 dry-runs against the example checkout — zero side effects, zero x402 charges', async () => {
    const { sign } = await makeKeys();
    const { state, fetchImpl } = makeCheckout(sign);
    const snap = snapWith(SUBSCRIBE);
    for (let i = 0; i < 100; i++) {
      const result = await runAction(snap, snap.actions[0]!, { seat: i }, {
        bearer: 'tok',
        confirm: true,
        dryRun: true,
        fetch: fetchImpl,
      });
      assert.equal(result.status, 'dry_run');
      assert.equal((result as { simulated?: boolean }).simulated, true);
    }
    assert.deepEqual(state, { charges: 0, subscriptions: 0, x402Payments: 0 });
  });

  test('T7.4a: a dry-run response WITHOUT simulated:true is refused (may have been real)', async () => {
    const snap = snapWith(SUBSCRIBE);
    const liar: typeof fetch = async () =>
      new Response(JSON.stringify({ subscription_id: 'sub_REAL' }), {
        headers: { 'content-type': 'application/json' },
      });
    await assert.rejects(
      runAction(snap, snap.actions[0]!, {}, { bearer: 'tok', confirm: true, dryRun: true, fetch: liar }),
      (e: Error) => e instanceof ActionRefused && /simulated: true/.test(e.message),
    );
  });

  test('T7.4b: an execute response CLAIMING simulated:true is refused (rehearsal sold as real)', async () => {
    const snap = snapWith({ ...SUBSCRIBE, reversible: { reversible: true, window: 'P30D' } });
    const liar: typeof fetch = async () =>
      new Response(JSON.stringify({ simulated: true, subscription_id: 'sub_fake' }), {
        headers: { 'content-type': 'application/json' },
      });
    await assert.rejects(
      runAction(snap, snap.actions[0]!, {}, { bearer: 'tok', confirm: true, fetch: liar }),
      (e: Error) => e instanceof ActionRefused && /claims simulated: true/.test(e.message),
    );
  });

  test('T7.5: strict preset blocks irreversible+priced without a prior same-params dry-run within TTL', async () => {
    const { sign } = await makeKeys();
    const { state, fetchImpl } = makeCheckout(sign);
    const snap = snapWith(SUBSCRIBE);
    const ledger = new DryRunLedger();
    const base = { bearer: 'tok', confirm: true, fetch: fetchImpl, policy: POLICY_PRESETS.strict, ledger };

    // 1. Executing cold → refused, nothing charged.
    await assert.rejects(
      runAction(snap, snap.actions[0]!, { plan: 'pro' }, base),
      (e: Error) => e instanceof ActionRefused && /requires a prior same-parameters dry-run/.test(e.message),
    );
    assert.equal(state.charges, 0);

    // 2. Rehearse, then execute with the SAME parameters → allowed.
    await runAction(snap, snap.actions[0]!, { plan: 'pro' }, { ...base, dryRun: true });
    const done = await runAction(snap, snap.actions[0]!, { plan: 'pro' }, base);
    assert.equal(done.status, 'executed');
    assert.equal(state.charges, 1);

    // 3. DIFFERENT parameters → the rehearsal doesn't transfer.
    await assert.rejects(
      runAction(snap, snap.actions[0]!, { plan: 'enterprise' }, base),
      ActionRefused,
    );

    // 4. Reversible/free actions are untouched by the strict knob.
    const freeSnap = snapWith({
      ...SUBSCRIBE,
      id: 'bookmark',
      cost: { category: 'free' },
      reversible: { reversible: true },
      confirmation: 'none',
      auth: 'none',
      execute_url: `${SITE}/api/subscribe`,
      ...({ dry_run: undefined } as object),
    });
    const free = await runAction(freeSnap, freeSnap.actions[0]!, {}, { fetch: fetchImpl, policy: POLICY_PRESETS.strict, ledger: new DryRunLedger() });
    assert.equal(free.status, 'executed');
  });

  test('T7.5b: the rehearsal expires with the snapshot TTL', () => {
    const ledger = new DryRunLedger();
    const t0 = 1_000_000;
    ledger.record(SUBSCRIBE, { plan: 'pro' }, t0);
    assert.equal(ledger.has(SUBSCRIBE, { plan: 'pro' }, 60, t0 + 59_000), true);
    assert.equal(ledger.has(SUBSCRIBE, { plan: 'pro' }, 60, t0 + 61_000), false, 'TTL expired');
    assert.equal(ledger.has(SUBSCRIBE, { plan: 'PRO' }, 60, t0 + 1_000), false, 'params differ');
  });
});

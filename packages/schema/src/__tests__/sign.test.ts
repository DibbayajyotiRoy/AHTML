/**
 * v0.8.0 — detached JWS signature round-trips.
 *
 * These tests verify the producer/verifier contract: the JWS string is
 * detached (empty middle segment), the signing payload is `toJson(snap)`,
 * tampering anywhere in the snapshot invalidates verification, and the
 * `kid` round-trips back through `VerifyResult.signer.kid`.
 *
 * Keys are generated per-test via `crypto.subtle.generateKey` — no
 * hardcoded key material — so the suite is portable to every WebCrypto
 * runtime we ship to (Node ≥ 18 via the node:crypto binding, Workers, Deno, Bun).
 */

import { test, describe } from 'node:test';
import { webcrypto } from 'node:crypto';

// Bare Node 18 has no global WebCrypto; tests are Node-only, so bind the
// node:crypto implementation explicitly where the global is missing.
const cryptoImpl: Crypto = (globalThis.crypto ?? webcrypto) as Crypto;
import assert from 'node:assert/strict';
import {
  snapshot,
  signSnapshot,
  verifySnapshot,
  verifySnapshotStrict,
  AHTMLError,
  type SignKey,
  type VerifyKey,
} from '../index.js';

function sampleSnapshot() {
  return snapshot('https://example.com/p/widget', 'product_detail')
    .ttl(300)
    .policy({ agents_welcome: true })
    .add({
      id: 'product:widget',
      type: 'product',
      name: 'Widget',
      price: { amount: 19, currency: 'USD' },
    })
    .action({ id: 'buy', target: 'product:widget' })
    .fetchedAt('2026-01-01T00:00:00.000Z')
    .build();
}

async function makeEs256Key(): Promise<{ sign: SignKey; verify: VerifyKey }> {
  const pair = (await cryptoImpl.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  return {
    sign: { alg: 'ES256', key: pair.privateKey },
    verify: { alg: 'ES256', key: pair.publicKey },
  };
}

async function tryMakeEdDsaKey(): Promise<{ sign: SignKey; verify: VerifyKey } | null> {
  try {
    const pair = (await cryptoImpl.subtle.generateKey(
      { name: 'Ed25519' } as unknown as AlgorithmIdentifier,
      false,
      ['sign', 'verify'],
    )) as CryptoKeyPair;
    return {
      sign: { alg: 'EdDSA', key: pair.privateKey },
      verify: { alg: 'EdDSA', key: pair.publicKey },
    };
  } catch {
    return null;
  }
}

describe('signSnapshot() — detached JWS shape', () => {
  test('returns a three-segment JWS with an empty middle (detached form)', async () => {
    const { sign } = await makeEs256Key();
    const jws = await signSnapshot(sampleSnapshot(), sign);
    const parts = jws.split('.');
    assert.equal(parts.length, 3, 'JWS must have exactly three segments');
    assert.equal(parts[1], '', 'middle segment must be empty (detached payload)');
    assert.ok(parts[0]!.length > 0, 'header segment must be non-empty');
    assert.ok(parts[2]!.length > 0, 'signature segment must be non-empty');
  });

  test('header decodes to JSON containing the declared alg', async () => {
    const { sign } = await makeEs256Key();
    const jws = await signSnapshot(sampleSnapshot(), sign);
    const headerB64 = jws.split('.')[0]!;
    const padLen = (4 - (headerB64.length % 4)) % 4;
    const b64 = headerB64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLen);
    const header = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    assert.equal(header.alg, 'ES256');
  });
});

describe('verifySnapshot() — round-trips and rejections', () => {
  test('ES256 round-trip: same snapshot + key verifies ok', async () => {
    const { sign, verify } = await makeEs256Key();
    const snap = sampleSnapshot();
    const jws = await signSnapshot(snap, sign);
    const result = await verifySnapshot(snap, jws, { trustedKeys: [verify] });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.signer.alg, 'ES256');
  });

  test('returns ok:false when the snapshot is tampered after signing', async () => {
    const { sign, verify } = await makeEs256Key();
    const snap = sampleSnapshot();
    const jws = await signSnapshot(snap, sign);
    // Mutate any field — the canonical JSON changes, so the signature
    // no longer covers the new bytes.
    const tampered = { ...snap, ttl: (snap.ttl ?? 0) + 1 };
    const result = await verifySnapshot(tampered, jws, { trustedKeys: [verify] });
    assert.equal(result.ok, false);
  });

  test('returns ok:false when verifying with a different key', async () => {
    const a = await makeEs256Key();
    const b = await makeEs256Key();
    const snap = sampleSnapshot();
    const jws = await signSnapshot(snap, a.sign);
    const result = await verifySnapshot(snap, jws, { trustedKeys: [b.verify] });
    assert.equal(result.ok, false);
  });

  test('multi-trusted-key verifier: tries each and succeeds on a match', async () => {
    const a = await makeEs256Key();
    const b = await makeEs256Key();
    const snap = sampleSnapshot();
    // Sign with A, verify against [B, A] — B fails, A succeeds.
    const jws = await signSnapshot(snap, a.sign);
    const result = await verifySnapshot(snap, jws, {
      trustedKeys: [b.verify, a.verify],
    });
    assert.equal(result.ok, true);
  });

  test('kid in the header round-trips into VerifyResult.signer.kid', async () => {
    const { sign, verify } = await makeEs256Key();
    const snap = sampleSnapshot();
    const jws = await signSnapshot(snap, { ...sign, kid: 'main-2026' });
    const result = await verifySnapshot(snap, jws, { trustedKeys: [verify] });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.signer.kid, 'main-2026');
  });

  test('rejects non-detached JWS (payload segment populated)', async () => {
    const { sign, verify } = await makeEs256Key();
    const snap = sampleSnapshot();
    const jws = await signSnapshot(snap, sign);
    const [h, , s] = jws.split('.');
    const badJws = `${h}.AA.${s}`;
    const result = await verifySnapshot(snap, badJws, { trustedKeys: [verify] });
    assert.equal(result.ok, false);
  });

  test('rejects malformed JWS strings', async () => {
    const { verify } = await makeEs256Key();
    const result = await verifySnapshot(sampleSnapshot(), 'not-a-jws', { trustedKeys: [verify] });
    assert.equal(result.ok, false);
  });
});

describe('verifySnapshotStrict()', () => {
  test('returns the snapshot unchanged on success', async () => {
    const { sign, verify } = await makeEs256Key();
    const snap = sampleSnapshot();
    const jws = await signSnapshot(snap, sign);
    const out = await verifySnapshotStrict(snap, jws, { trustedKeys: [verify] });
    assert.equal(out, snap);
  });

  test('throws AHTMLError(SIGNATURE_INVALID) on a tampered snapshot', async () => {
    const { sign, verify } = await makeEs256Key();
    const snap = sampleSnapshot();
    const jws = await signSnapshot(snap, sign);
    const tampered = { ...snap, url: snap.url + '/x' };
    await assert.rejects(
      () => verifySnapshotStrict(tampered, jws, { trustedKeys: [verify] }),
      (err: unknown) => {
        assert.ok(AHTMLError.is(err, 'SIGNATURE_INVALID'), 'must be SIGNATURE_INVALID');
        return true;
      },
    );
  });
});

describe('EdDSA support (when the runtime exposes Ed25519)', () => {
  test('EdDSA round-trip', async () => {
    const eddsa = await tryMakeEdDsaKey();
    if (!eddsa) {
      // Some WebCrypto runtimes don't expose Ed25519. Skip rather than
      // hard-fail — the producer/verifier code paths are exercised by
      // the ES256 tests above.
      // eslint-disable-next-line no-console
      console.warn('EdDSA not available in this WebCrypto runtime — skipping');
      return;
    }
    const snap = sampleSnapshot();
    const jws = await signSnapshot(snap, eddsa.sign);
    const result = await verifySnapshot(snap, jws, { trustedKeys: [eddsa.verify] });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.signer.alg, 'EdDSA');
  });
});

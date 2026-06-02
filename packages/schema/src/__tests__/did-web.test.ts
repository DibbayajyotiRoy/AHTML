/**
 * v0.9.0 — `did:web` key resolution tests.
 *
 * Coverage:
 *  - URL derivation for both bare-host and path-form DIDs.
 *  - ES256 JWK import yields a usable VerifyKey.
 *  - Unsupported algs are skipped, not thrown.
 *  - A 404 from the well-known endpoint throws AHTMLError(SIGNATURE_INVALID).
 *  - End-to-end: signSnapshot + mock did.json + verifySnapshotWithDidWeb -> ok:true.
 *
 * No real network access — every test supplies a `fetch` shim that
 * returns synthetic DID documents.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  snapshot,
  signSnapshot,
  resolveDidWeb,
  verifySnapshotWithDidWeb,
  didWebToUrl,
  AHTMLError,
  InMemoryCacheStore,
  type VerifyKey,
  type SignKey,
} from '../index.js';

/* -------------------------------------------------------------------------- */
/* helpers                                                                    */
/* -------------------------------------------------------------------------- */

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

async function makeEs256Keypair(): Promise<{
  sign: SignKey;
  verify: VerifyKey;
  publicJwk: JsonWebKey;
}> {
  const pair = (await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true, // extractable — we need to export the public key as JWK for the DID doc.
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  return {
    sign: { alg: 'ES256', key: pair.privateKey },
    verify: { alg: 'ES256', key: pair.publicKey },
    publicJwk,
  };
}

/**
 * Build a fetch shim that returns the supplied DID document for any URL
 * and records every URL it was called with.
 */
function fetchShim(
  responder: (url: string) => { status?: number; body?: unknown; statusText?: string },
): { fetch: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const fn = ((input: Parameters<typeof fetch>[0]) => {
    const url = typeof input === 'string' ? input : (input as URL | Request).toString();
    calls.push(url);
    const { status = 200, statusText = 'OK', body } = responder(url);
    return Promise.resolve(
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        statusText,
        headers: { 'content-type': 'application/did+json' },
      }),
    );
  }) as typeof fetch;
  return { fetch: fn, calls };
}

/* -------------------------------------------------------------------------- */
/* didWebToUrl                                                                */
/* -------------------------------------------------------------------------- */

describe('didWebToUrl()', () => {
  test('bare host -> /.well-known/did.json', () => {
    assert.equal(
      didWebToUrl('did:web:example.com'),
      'https://example.com/.well-known/did.json',
    );
  });

  test('host + single path segment -> /<segment>/did.json', () => {
    assert.equal(
      didWebToUrl('did:web:example.com:agents'),
      'https://example.com/agents/did.json',
    );
  });

  test('host + multi-segment path -> /<a>/<b>/did.json', () => {
    assert.equal(
      didWebToUrl('did:web:example.com:users:alice'),
      'https://example.com/users/alice/did.json',
    );
  });

  test('rejects non-did:web strings', () => {
    assert.throws(() => didWebToUrl('did:key:abcd'), (err: unknown) => {
      assert.ok(AHTMLError.is(err, 'SIGNATURE_INVALID'));
      return true;
    });
    assert.throws(() => didWebToUrl(''), (err: unknown) => {
      assert.ok(AHTMLError.is(err, 'SIGNATURE_INVALID'));
      return true;
    });
  });
});

/* -------------------------------------------------------------------------- */
/* resolveDidWeb                                                              */
/* -------------------------------------------------------------------------- */

describe('resolveDidWeb()', () => {
  test('bare-host DID hits /.well-known/did.json', async () => {
    const { publicJwk } = await makeEs256Keypair();
    const { fetch, calls } = fetchShim(() => ({
      body: {
        id: 'did:web:example.com',
        verificationMethod: [
          {
            id: 'did:web:example.com#key-1',
            type: 'JsonWebKey2020',
            controller: 'did:web:example.com',
            publicKeyJwk: { ...publicJwk, alg: 'ES256', kid: 'key-1' },
          },
        ],
      },
    }));
    const keys = await resolveDidWeb('did:web:example.com', {
      fetch,
      cache: new InMemoryCacheStore<VerifyKey[]>(),
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0], 'https://example.com/.well-known/did.json');
    assert.equal(keys.length, 1);
    assert.equal(keys[0]!.alg, 'ES256');
    assert.equal(keys[0]!.kid, 'key-1');
  });

  test('path-form DID hits /<path>/did.json (no .well-known)', async () => {
    const { publicJwk } = await makeEs256Keypair();
    const { fetch, calls } = fetchShim(() => ({
      body: {
        id: 'did:web:example.com:agents',
        verificationMethod: [
          {
            id: 'did:web:example.com:agents#k',
            type: 'JsonWebKey2020',
            controller: 'did:web:example.com:agents',
            publicKeyJwk: { ...publicJwk, alg: 'ES256' },
          },
        ],
      },
    }));
    await resolveDidWeb('did:web:example.com:agents', {
      fetch,
      cache: new InMemoryCacheStore<VerifyKey[]>(),
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0], 'https://example.com/agents/did.json');
  });

  test('imports ES256 JWKs as VerifyKey handles', async () => {
    const { publicJwk } = await makeEs256Keypair();
    const { fetch } = fetchShim(() => ({
      body: {
        id: 'did:web:example.com',
        verificationMethod: [
          {
            id: '#main',
            type: 'JsonWebKey2020',
            controller: 'did:web:example.com',
            publicKeyJwk: { ...publicJwk, alg: 'ES256', kid: 'main' },
          },
        ],
      },
    }));
    const keys = await resolveDidWeb('did:web:example.com', {
      fetch,
      cache: new InMemoryCacheStore<VerifyKey[]>(),
    });
    assert.equal(keys.length, 1);
    assert.equal(keys[0]!.alg, 'ES256');
    // The CryptoKey must be a 'public' key usable for 'verify'.
    assert.equal(keys[0]!.key.type, 'public');
    assert.ok(keys[0]!.key.usages.includes('verify'));
  });

  test('unsupported algs are skipped, not thrown', async () => {
    const { publicJwk } = await makeEs256Keypair();
    const { fetch } = fetchShim(() => ({
      body: {
        id: 'did:web:example.com',
        verificationMethod: [
          // First entry: an unsupported alg — must be skipped.
          {
            id: '#weird',
            type: 'JsonWebKey2020',
            controller: 'did:web:example.com',
            publicKeyJwk: { kty: 'XYZZY', alg: 'PLUGH-512' },
          },
          // Second entry: a valid ES256 — must be returned.
          {
            id: '#good',
            type: 'JsonWebKey2020',
            controller: 'did:web:example.com',
            publicKeyJwk: { ...publicJwk, alg: 'ES256', kid: 'good' },
          },
        ],
      },
    }));
    const keys = await resolveDidWeb('did:web:example.com', {
      fetch,
      cache: new InMemoryCacheStore<VerifyKey[]>(),
    });
    assert.equal(keys.length, 1, 'unsupported alg must be skipped, only ES256 survives');
    assert.equal(keys[0]!.kid, 'good');
  });

  test('a 404 from the endpoint throws AHTMLError(SIGNATURE_INVALID)', async () => {
    const { fetch } = fetchShim(() => ({ status: 404, statusText: 'Not Found' }));
    await assert.rejects(
      () =>
        resolveDidWeb('did:web:missing.example', {
          fetch,
          cache: new InMemoryCacheStore<VerifyKey[]>(),
        }),
      (err: unknown) => {
        assert.ok(AHTMLError.is(err, 'SIGNATURE_INVALID'), 'must be SIGNATURE_INVALID');
        return true;
      },
    );
  });

  test('a document with zero usable keys throws AHTMLError(SIGNATURE_INVALID)', async () => {
    const { fetch } = fetchShim(() => ({
      body: {
        id: 'did:web:example.com',
        verificationMethod: [
          // Only an unsupported alg — after skipping, zero keys remain.
          {
            id: '#only',
            type: 'JsonWebKey2020',
            controller: 'did:web:example.com',
            publicKeyJwk: { kty: 'XYZZY', alg: 'PLUGH-512' },
          },
        ],
      },
    }));
    await assert.rejects(
      () =>
        resolveDidWeb('did:web:example.com', {
          fetch,
          cache: new InMemoryCacheStore<VerifyKey[]>(),
        }),
      (err: unknown) => {
        assert.ok(AHTMLError.is(err, 'SIGNATURE_INVALID'));
        return true;
      },
    );
  });

  test('cache hits skip the fetch on the second call', async () => {
    const { publicJwk } = await makeEs256Keypair();
    const { fetch, calls } = fetchShim(() => ({
      body: {
        id: 'did:web:example.com',
        verificationMethod: [
          {
            id: '#k',
            type: 'JsonWebKey2020',
            controller: 'did:web:example.com',
            publicKeyJwk: { ...publicJwk, alg: 'ES256' },
          },
        ],
      },
    }));
    const cache = new InMemoryCacheStore<VerifyKey[]>();
    await resolveDidWeb('did:web:example.com', { fetch, cache });
    await resolveDidWeb('did:web:example.com', { fetch, cache });
    assert.equal(calls.length, 1, 'second call must be served from cache');
  });
});

/* -------------------------------------------------------------------------- */
/* verifySnapshotWithDidWeb — end-to-end                                       */
/* -------------------------------------------------------------------------- */

describe('verifySnapshotWithDidWeb()', () => {
  test('signSnapshot + mock did.json + verifySnapshotWithDidWeb -> ok:true', async () => {
    const { sign, publicJwk } = await makeEs256Keypair();
    const snap = sampleSnapshot();
    const jws = await signSnapshot(snap, { ...sign, kid: 'main-2026' });

    const { fetch } = fetchShim(() => ({
      body: {
        id: 'did:web:example.com',
        verificationMethod: [
          {
            id: 'did:web:example.com#main-2026',
            type: 'JsonWebKey2020',
            controller: 'did:web:example.com',
            publicKeyJwk: { ...publicJwk, alg: 'ES256', kid: 'main-2026' },
          },
        ],
      },
    }));

    const result = await verifySnapshotWithDidWeb(snap, jws, 'did:web:example.com', {
      fetch,
      cache: new InMemoryCacheStore<VerifyKey[]>(),
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.signer.alg, 'ES256');
      assert.equal(result.signer.kid, 'main-2026');
    }
  });

  test('returns ok:false (not throws) when the DID cannot be resolved', async () => {
    const { sign } = await makeEs256Keypair();
    const snap = sampleSnapshot();
    const jws = await signSnapshot(snap, sign);
    const { fetch } = fetchShim(() => ({ status: 404, statusText: 'Not Found' }));
    const result = await verifySnapshotWithDidWeb(snap, jws, 'did:web:gone.example', {
      fetch,
      cache: new InMemoryCacheStore<VerifyKey[]>(),
    });
    assert.equal(result.ok, false);
  });

  test('returns ok:false when the DID resolves but its keys do not match', async () => {
    const signer = await makeEs256Keypair();
    const other = await makeEs256Keypair();
    const snap = sampleSnapshot();
    const jws = await signSnapshot(snap, signer.sign);

    // The DID document advertises `other`'s public key — verification must fail.
    const { fetch } = fetchShim(() => ({
      body: {
        id: 'did:web:example.com',
        verificationMethod: [
          {
            id: '#k',
            type: 'JsonWebKey2020',
            controller: 'did:web:example.com',
            publicKeyJwk: { ...other.publicJwk, alg: 'ES256' },
          },
        ],
      },
    }));
    const result = await verifySnapshotWithDidWeb(snap, jws, 'did:web:example.com', {
      fetch,
      cache: new InMemoryCacheStore<VerifyKey[]>(),
    });
    assert.equal(result.ok, false);
  });
});

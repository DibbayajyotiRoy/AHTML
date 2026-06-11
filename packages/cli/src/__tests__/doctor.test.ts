/**
 * Unit tests for {@link doctor} — every branch of the discovery chain
 * is exercised against a hand-rolled mock `fetch`. No network, no
 * filesystem, no `node:*` imports beyond the test runner.
 */

import { test, describe } from 'node:test';
import { webcrypto } from 'node:crypto';

// Bare Node 18 has no global WebCrypto; tests are Node-only, so bind the
// node:crypto implementation explicitly where the global is missing.
const cryptoImpl: Crypto = (globalThis.crypto ?? webcrypto) as Crypto;
import assert from 'node:assert/strict';
import { snapshot, toJson, signSnapshot, type Snapshot, type Provenance } from '@ahtmljs/schema';
import { doctor } from '../doctor.js';

const ORIGIN = 'https://shop.example.com';

/** Build a known-good Snapshot object so signing tests can sign the exact served bytes. */
function makeSnapshot(provenance?: Provenance): Snapshot {
  const b = snapshot(`${ORIGIN}/`, 'home').add({
    type: 'product',
    id: 'product:p1',
    name: 'Test Widget',
    price: { amount: 19.99, currency: 'USD' },
    stock: { status: 'in_stock', quantity: 10 },
  });
  if (provenance) b.provenance(provenance);
  return b.build();
}

/** Build a known-good snapshot so the validate/lint paths have something to grade. */
function makeValidSnapshot(): string {
  return toJson(makeSnapshot());
}

/** Build a snapshot that won't validate — missing `ahtml` field. */
function makeInvalidSnapshotJson(): string {
  return JSON.stringify({
    url: `${ORIGIN}/`,
    fetched_at: new Date().toISOString(),
    page_type: 'home',
    entities: [],
    actions: [],
  });
}

/** Build the well-known manifest body. */
function makeManifest(opts: { mcp?: boolean; openapi?: boolean } = {}): string {
  const endpoints: Record<string, string> = {
    snapshot: `${ORIGIN}/ahtml/{path}`,
    diff_param: 'since',
  };
  if (opts.mcp !== false) endpoints.mcp = `${ORIGIN}/ahtml/mcp.json`;
  if (opts.openapi !== false) endpoints.openapi = `${ORIGIN}/ahtml/openapi.json`;
  return JSON.stringify({
    ahtml: '0.1',
    site: ORIGIN,
    policy: { agents_welcome: true },
    snapshot_url_template: `${ORIGIN}/ahtml/{path}`,
    routes: [],
    endpoints,
    formats: [],
    generated_at: new Date().toISOString(),
  });
}

const MCP_OK = JSON.stringify({
  schema_version: '0.1',
  server: { name: 'shop', url: ORIGIN },
  tools: [],
});

const OPENAPI_OK = JSON.stringify({
  openapi: '3.1.0',
  info: { title: 'shop', version: '0.1.0' },
  paths: {},
});

const LLMS_OK = '# Shop\n\nWelcome to the shop.\n';

/** Build a mock fetch from a routing table keyed by URL. */
function mockFetch(
  routes: Record<string, { status: number; body: string; ct: string; headers?: Record<string, string> }>,
): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const route = routes[url];
    if (!route) {
      return new Response('not found', { status: 404, statusText: 'Not Found' });
    }
    return new Response(route.body, {
      status: route.status,
      statusText: route.status === 200 ? 'OK' : 'Error',
      headers: { 'content-type': route.ct, ...route.headers },
    });
  }) as typeof fetch;
}

describe('doctor()', () => {
  test('all endpoints valid -> every required check is PASS, no FAILs', async () => {
    const fetcher = mockFetch({
      [`${ORIGIN}/.well-known/ahtml.json`]: { status: 200, body: makeManifest(), ct: 'application/json' },
      [`${ORIGIN}/ahtml`]: { status: 200, body: makeValidSnapshot(), ct: 'application/ahtml+json' },
      [`${ORIGIN}/ahtml/mcp.json`]: { status: 200, body: MCP_OK, ct: 'application/json' },
      [`${ORIGIN}/ahtml/openapi.json`]: { status: 200, body: OPENAPI_OK, ct: 'application/json' },
      [`${ORIGIN}/llms.txt`]: { status: 200, body: LLMS_OK, ct: 'text/plain' },
    });
    const report = await doctor(ORIGIN, { fetch: fetcher });
    assert.equal(report.totals.fail, 0, JSON.stringify(report.checks, null, 2));
    // Every primary endpoint should have at least one PASS line.
    const names = report.checks.filter((c) => c.status === 'pass').map((c) => c.name);
    assert.ok(names.some((n) => n.includes('well-known')), 'well-known PASS missing');
    assert.ok(names.some((n) => n.includes('validate')), 'validate PASS missing');
    assert.ok(names.some((n) => n.includes('mcp.json')), 'mcp PASS missing');
    assert.ok(names.some((n) => n.includes('openapi.json')), 'openapi PASS missing');
    assert.ok(names.some((n) => n.includes('llms.txt')), 'llms.txt PASS missing');
  });

  test('missing /.well-known -> FAIL and downstream checks are skipped', async () => {
    const fetcher = mockFetch({
      // No well-known route -> the default 404 fires.
      [`${ORIGIN}/ahtml`]: { status: 200, body: makeValidSnapshot(), ct: 'application/ahtml+json' },
    });
    const report = await doctor(ORIGIN, { fetch: fetcher });
    const wk = report.checks.find((c) => c.name.includes('well-known'));
    assert.ok(wk, 'well-known check missing from report');
    assert.equal(wk.status, 'fail');
    assert.equal(report.totals.fail, 1, 'only the well-known check should FAIL');
    // The remaining checks should be downgraded to warn (skipped), not run.
    assert.ok(
      report.checks.slice(1).every((c) => c.status === 'warn'),
      'downstream checks should be skipped as warnings',
    );
  });

  test('invalid snapshot -> validate check FAILs', async () => {
    const fetcher = mockFetch({
      [`${ORIGIN}/.well-known/ahtml.json`]: { status: 200, body: makeManifest(), ct: 'application/json' },
      [`${ORIGIN}/ahtml`]: { status: 200, body: makeInvalidSnapshotJson(), ct: 'application/ahtml+json' },
      [`${ORIGIN}/ahtml/mcp.json`]: { status: 200, body: MCP_OK, ct: 'application/json' },
      [`${ORIGIN}/ahtml/openapi.json`]: { status: 200, body: OPENAPI_OK, ct: 'application/json' },
      [`${ORIGIN}/llms.txt`]: { status: 200, body: LLMS_OK, ct: 'text/plain' },
    });
    const report = await doctor(ORIGIN, { fetch: fetcher });
    // Either the client itself throws CACHE_POISONED (snapshot fetch FAILs)
    // or our explicit validate step FAILs. Either way, totals.fail > 0.
    assert.ok(report.totals.fail >= 1, JSON.stringify(report.checks, null, 2));
  });

  test('unsigned snapshot -> signature check WARNs (not FAIL)', async () => {
    const fetcher = mockFetch({
      [`${ORIGIN}/.well-known/ahtml.json`]: { status: 200, body: makeManifest(), ct: 'application/json' },
      [`${ORIGIN}/ahtml`]: { status: 200, body: makeValidSnapshot(), ct: 'application/ahtml+json' },
      [`${ORIGIN}/ahtml/mcp.json`]: { status: 200, body: MCP_OK, ct: 'application/json' },
      [`${ORIGIN}/ahtml/openapi.json`]: { status: 200, body: OPENAPI_OK, ct: 'application/json' },
      [`${ORIGIN}/llms.txt`]: { status: 200, body: LLMS_OK, ct: 'text/plain' },
    });
    const report = await doctor(ORIGIN, { fetch: fetcher });
    const sig = report.checks.find((c) => c.name.includes('signature'));
    assert.ok(sig, 'signature check missing from report');
    assert.equal(sig.status, 'warn', 'unsigned snapshot must WARN, never FAIL');
    assert.match(sig.detail ?? '', /unsigned/i);
    assert.equal(report.totals.fail, 0, 'unsigned adopters must not regress to FAIL');
  });

  test('missing /llms.txt -> WARN (not FAIL)', async () => {
    const fetcher = mockFetch({
      [`${ORIGIN}/.well-known/ahtml.json`]: { status: 200, body: makeManifest(), ct: 'application/json' },
      [`${ORIGIN}/ahtml`]: { status: 200, body: makeValidSnapshot(), ct: 'application/ahtml+json' },
      [`${ORIGIN}/ahtml/mcp.json`]: { status: 200, body: MCP_OK, ct: 'application/json' },
      [`${ORIGIN}/ahtml/openapi.json`]: { status: 200, body: OPENAPI_OK, ct: 'application/json' },
      // /llms.txt intentionally omitted -> 404
    });
    const report = await doctor(ORIGIN, { fetch: fetcher });
    const llms = report.checks.find((c) => c.name.includes('llms.txt'));
    assert.ok(llms, 'llms.txt check missing');
    assert.equal(llms.status, 'warn', 'llms.txt must downgrade to warn when missing');
    assert.equal(report.totals.fail, 0, 'no FAILs when only llms.txt is absent');
  });
});

/* -------------------------------------------------------------------------- */
/* signature verification (did:web)                                           */
/* -------------------------------------------------------------------------- */

const DID = `did:web:shop.example.com`;
const DID_JSON_URL = `${ORIGIN}/.well-known/did.json`;

/** Generate a real ES256 keypair; export the public half for the DID document. */
async function makeEs256Keypair(): Promise<{ privateKey: CryptoKey; publicJwk: JsonWebKey }> {
  const pair = (await cryptoImpl.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const publicJwk = await cryptoImpl.subtle.exportKey('jwk', pair.publicKey);
  return { privateKey: pair.privateKey, publicJwk };
}

/** W3C-shaped did.json advertising one ES256 verification key. */
function makeDidJson(publicJwk: JsonWebKey, kid: string): string {
  return JSON.stringify({
    '@context': ['https://www.w3.org/ns/did/v1'],
    id: DID,
    verificationMethod: [
      {
        id: `${DID}#${kid}`,
        type: 'JsonWebKey2020',
        controller: DID,
        publicKeyJwk: { ...publicJwk, alg: 'ES256', kid },
      },
    ],
    assertionMethod: [`${DID}#${kid}`],
  });
}

/** All non-snapshot routes for a healthy site. */
function healthyRoutes(): Record<string, { status: number; body: string; ct: string }> {
  return {
    [`${ORIGIN}/.well-known/ahtml.json`]: { status: 200, body: makeManifest(), ct: 'application/json' },
    [`${ORIGIN}/ahtml/mcp.json`]: { status: 200, body: MCP_OK, ct: 'application/json' },
    [`${ORIGIN}/ahtml/openapi.json`]: { status: 200, body: OPENAPI_OK, ct: 'application/json' },
    [`${ORIGIN}/llms.txt`]: { status: 200, body: LLMS_OK, ct: 'text/plain' },
  };
}

describe('doctor() signature check', () => {
  test('valid X-AHTML-Signature header + did:web key -> PASS with signer', async () => {
    const { privateKey, publicJwk } = await makeEs256Keypair();
    const snap = makeSnapshot();
    const jws = await signSnapshot(snap, { kid: 'shop-2026', alg: 'ES256', key: privateKey });
    const fetcher = mockFetch({
      ...healthyRoutes(),
      [`${ORIGIN}/ahtml`]: {
        status: 200,
        body: toJson(snap),
        ct: 'application/ahtml+json',
        headers: { 'x-ahtml-signature': jws },
      },
      [DID_JSON_URL]: { status: 200, body: makeDidJson(publicJwk, 'shop-2026'), ct: 'application/did+json' },
    });
    const report = await doctor(ORIGIN, { fetch: fetcher });
    const sig = report.checks.find((c) => c.name.includes('signature'));
    assert.ok(sig, 'signature check missing from report');
    assert.equal(sig.status, 'pass', JSON.stringify(sig, null, 2));
    assert.match(sig.detail ?? '', /shop-2026/, 'detail must name the signer kid');
    assert.match(sig.detail ?? '', /did:web:shop\.example\.com/, 'detail must name the did:web identity');
    assert.equal(report.totals.fail, 0, JSON.stringify(report.checks, null, 2));
  });

  test('valid provenance.signature (embedded) + did:web issuer -> PASS', async () => {
    const { privateKey, publicJwk } = await makeEs256Keypair();
    // Sign BEFORE embedding — a signature cannot cover itself.
    const snap = makeSnapshot({ issuer: DID, signed: true });
    const jws = await signSnapshot(snap, { kid: 'shop-2026', alg: 'ES256', key: privateKey });
    const served = JSON.parse(toJson(snap)) as { provenance: Record<string, unknown> };
    served.provenance.signature = jws;
    const fetcher = mockFetch({
      ...healthyRoutes(),
      [`${ORIGIN}/ahtml`]: { status: 200, body: JSON.stringify(served), ct: 'application/ahtml+json' },
      [DID_JSON_URL]: { status: 200, body: makeDidJson(publicJwk, 'shop-2026'), ct: 'application/did+json' },
    });
    const report = await doctor(ORIGIN, { fetch: fetcher });
    const sig = report.checks.find((c) => c.name.includes('signature'));
    assert.ok(sig, 'signature check missing from report');
    assert.equal(sig.status, 'pass', JSON.stringify(sig, null, 2));
    assert.match(sig.detail ?? '', /provenance\.signature/, 'detail must name the wire form');
    assert.equal(report.totals.fail, 0, JSON.stringify(report.checks, null, 2));
  });

  test('tampered snapshot -> signature check FAILs with a hint', async () => {
    const { privateKey, publicJwk } = await makeEs256Keypair();
    const snap = makeSnapshot();
    const jws = await signSnapshot(snap, { kid: 'shop-2026', alg: 'ES256', key: privateKey });
    // Tamper after signing: change the price in the served bytes.
    const tampered = JSON.parse(toJson(snap)) as { entities: { price: { amount: number } }[] };
    tampered.entities[0]!.price.amount = 0.01;
    const fetcher = mockFetch({
      ...healthyRoutes(),
      [`${ORIGIN}/ahtml`]: {
        status: 200,
        body: JSON.stringify(tampered),
        ct: 'application/ahtml+json',
        headers: { 'x-ahtml-signature': jws },
      },
      [DID_JSON_URL]: { status: 200, body: makeDidJson(publicJwk, 'shop-2026'), ct: 'application/did+json' },
    });
    const report = await doctor(ORIGIN, { fetch: fetcher });
    const sig = report.checks.find((c) => c.name.includes('signature'));
    assert.ok(sig, 'signature check missing from report');
    assert.equal(sig.status, 'fail', 'tampered bytes must FAIL the signature check');
    assert.ok(sig.hint, 'a FAILing signature check must carry an actionable hint');
    assert.ok(report.totals.fail >= 1);
  });

  test('signed but no resolvable did:web key (did.json 404) -> FAIL with a hint', async () => {
    const { privateKey } = await makeEs256Keypair();
    const snap = makeSnapshot();
    const jws = await signSnapshot(snap, { kid: 'shop-2026', alg: 'ES256', key: privateKey });
    const fetcher = mockFetch({
      ...healthyRoutes(),
      [`${ORIGIN}/ahtml`]: {
        status: 200,
        body: toJson(snap),
        ct: 'application/ahtml+json',
        headers: { 'x-ahtml-signature': jws },
      },
      // No did.json route -> 404 -> unresolvable key.
    });
    const report = await doctor(ORIGIN, { fetch: fetcher });
    const sig = report.checks.find((c) => c.name.includes('signature'));
    assert.ok(sig, 'signature check missing from report');
    assert.equal(sig.status, 'fail', 'an unverifiable signature must FAIL');
    assert.match(sig.hint ?? '', /did/i, 'hint must point at the DID document');
  });
});

/**
 * v0.9.0 — `did:web` key resolution for the signing module.
 *
 * Implements the W3C `did:web` Method Specification
 * (https://w3c-ccg.github.io/did-method-web/) just enough to turn a DID
 * like `did:web:example.com` or `did:web:example.com:agents` into a list
 * of `VerifyKey` handles that plug directly into `verifySnapshot`.
 *
 * Rules per spec:
 *  - `did:web:example.com` resolves the DID document from
 *    `https://example.com/.well-known/did.json`.
 *  - `did:web:example.com:agents` resolves from
 *    `https://example.com/agents/did.json` (no `.well-known` prefix when
 *    a path component is present).
 *  - Each colon in the method-specific identifier becomes a `/` in the URL.
 *  - Percent-encoded ports (`%3A`) are decoded back to `:` per the spec.
 *
 * The whole module talks to `globalThis.fetch` and `globalThis.crypto.subtle`
 * — no `node:*` imports — so it runs unchanged on Cloudflare Workers,
 * Deno, Bun, browsers, and Node ≥ 20.
 *
 * Resolved keys are memoized by DID in an in-memory `CacheStore<VerifyKey[]>`
 * with a 5-minute TTL. Callers may pass a shared `cache` (Redis / Workers
 * KV via `@ahtmljs/kv`) for cross-replica reuse, or a `fetch` shim for
 * tests.
 */

import type { VerifyKey, SignAlg, VerifyResult } from './sign.js';
import type { Snapshot } from './types.js';
import { verifySnapshot } from './sign.js';
import { AHTMLError, DEFAULT_HINTS } from './errors.js';
import { InMemoryCacheStore, type CacheStore } from './kv.js';

/** Default TTL for resolved DID -> VerifyKey[] entries (5 minutes). */
const DEFAULT_TTL_MS = 5 * 60 * 1000;

/**
 * Process-wide default cache. Adopters can replace per-call via `opts.cache`
 * (e.g. an `@ahtmljs/kv` adapter for cross-replica sharing). Bounded to
 * 256 distinct DIDs to keep the working set predictable.
 */
const defaultCache: CacheStore<VerifyKey[]> = new InMemoryCacheStore<VerifyKey[]>(256);

/* -------------------------------------------------------------------------- */
/* DID document shape (W3C, simplified to what we need)                       */
/* -------------------------------------------------------------------------- */

/**
 * The fields of a `did.json` document this module reads. The W3C DID Core
 * spec defines many more, but `did:web` key resolution only needs the
 * `id` (for log context) and `verificationMethod` (for the JWKs).
 */
interface DidDocument {
  id?: string;
  verificationMethod?: VerificationMethod[];
}

interface VerificationMethod {
  id?: string;
  type?: string;
  controller?: string;
  publicKeyJwk?: PublicJwk;
}

interface PublicJwk {
  kty: string;
  crv?: string;
  alg?: string;
  kid?: string;
  // The rest of the JWK fields (n, e, x, y, ...) are passed through to
  // `crypto.subtle.importKey` opaquely; we don't read them directly.
  [key: string]: unknown;
}

/* -------------------------------------------------------------------------- */
/* DID -> URL                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Translate a `did:web:*` identifier into the HTTPS URL of its DID document.
 *
 * Throws `AHTMLError({code:'SIGNATURE_INVALID'})` if the DID is not a
 * syntactically-valid `did:web`. The error code is shared with downstream
 * signature failures so adopters can write a single `catch` arm.
 */
export function didWebToUrl(did: string): string {
  if (typeof did !== 'string' || !did.startsWith('did:web:')) {
    throw new AHTMLError({
      code: 'SIGNATURE_INVALID',
      message: `not a did:web identifier: ${String(did)}`,
      hint: DEFAULT_HINTS.SIGNATURE_INVALID,
    });
  }
  const msi = did.slice('did:web:'.length);
  if (msi.length === 0) {
    throw new AHTMLError({
      code: 'SIGNATURE_INVALID',
      message: 'did:web identifier is empty',
      hint: DEFAULT_HINTS.SIGNATURE_INVALID,
    });
  }
  // The first colon-separated segment is the host (with optional
  // percent-encoded port). Subsequent segments become path components.
  const segments = msi.split(':');
  const host = decodeURIComponent(segments[0]!);
  if (host.length === 0) {
    throw new AHTMLError({
      code: 'SIGNATURE_INVALID',
      message: 'did:web host segment is empty',
      hint: DEFAULT_HINTS.SIGNATURE_INVALID,
    });
  }
  if (segments.length === 1) {
    return `https://${host}/.well-known/did.json`;
  }
  const path = segments.slice(1).map(decodeURIComponent).join('/');
  return `https://${host}/${path}/did.json`;
}

/* -------------------------------------------------------------------------- */
/* JWK -> WebCrypto import                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Map a JWK `alg` to one of the `SignAlg` values understood by `sign.ts`.
 * Returns `null` for any algorithm we don't support — the caller should
 * skip that `verificationMethod` rather than throw, so a document mixing
 * supported and unsupported keys still yields the supported ones.
 */
function jwkAlgToSignAlg(jwk: PublicJwk): SignAlg | null {
  // Prefer the explicit `alg` field. Fall back to common kty/crv pairs so
  // documents that omit `alg` (the spec permits it) still resolve.
  switch (jwk.alg) {
    case 'ES256':
      return 'ES256';
    case 'EdDSA':
      return 'EdDSA';
    case 'RS256':
      return 'RS256';
  }
  if (jwk.kty === 'EC' && jwk.crv === 'P-256') return 'ES256';
  if (jwk.kty === 'OKP' && jwk.crv === 'Ed25519') return 'EdDSA';
  if (jwk.kty === 'RSA') return 'RS256';
  return null;
}

/**
 * The WebCrypto `importKey` parameter object for a given `SignAlg`. ECDSA
 * and Ed25519 want a named-curve descriptor; RSASSA-PKCS1-v1_5 wants the
 * hash. These mirror the params used by `algParams` in `sign.ts`.
 */
function importParamsFor(alg: SignAlg):
  | EcKeyImportParams
  | RsaHashedImportParams
  | AlgorithmIdentifier {
  switch (alg) {
    case 'ES256':
      return { name: 'ECDSA', namedCurve: 'P-256' };
    case 'EdDSA':
      return { name: 'Ed25519' };
    case 'RS256':
      return { name: 'RSASSA-PKCS1-v1_5', hash: { name: 'SHA-256' } };
  }
}

function subtleOrThrow(): SubtleCrypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c || !c.subtle) {
    throw new AHTMLError({
      code: 'SIGNATURE_INVALID',
      message: 'Web Crypto (globalThis.crypto.subtle) is not available in this runtime',
      hint: DEFAULT_HINTS.SIGNATURE_INVALID,
    });
  }
  return c.subtle;
}

/**
 * Best-effort console warning sink. We deliberately do not throw on a
 * single unsupported / malformed verification method — the spec encourages
 * forward-compat by ignoring entries you don't understand. Centralized so
 * tests can spy if needed.
 */
function warn(message: string, detail?: unknown): void {
  try {
    if (typeof console !== 'undefined' && typeof console.warn === 'function') {
      if (detail !== undefined) console.warn(`[ahtml:did-web] ${message}`, detail);
      else console.warn(`[ahtml:did-web] ${message}`);
    }
  } catch {
    // logging must never throw.
  }
}

/* -------------------------------------------------------------------------- */
/* Resolve                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Resolve a `did:web` DID into a list of `VerifyKey` handles.
 *
 * `did:web:example.com`         -> `https://example.com/.well-known/did.json`
 * `did:web:example.com:agents`  -> `https://example.com/agents/did.json`
 *
 * Caches by DID with a 5-minute TTL using an `InMemoryCacheStore` from
 * `kv.js`. Pass `{fetch}` to override (testing) or `{cache}` to use a
 * shared backend (e.g. Workers KV via `@ahtmljs/kv`).
 *
 * Unsupported `verificationMethod` entries are skipped (logged via
 * `console.warn`), not fatal — a DID document may legitimately contain
 * keys for algorithms this version doesn't implement.
 *
 * Throws `AHTMLError({code:'SIGNATURE_INVALID'})` only when the DID
 * document itself can't be fetched, parsed, or contains zero usable keys.
 */
export async function resolveDidWeb(
  did: string,
  opts?: { fetch?: typeof fetch; cache?: CacheStore<VerifyKey[]> },
): Promise<VerifyKey[]> {
  const cache = opts?.cache ?? defaultCache;
  const cached = await cache.get(did);
  if (cached) return cached;

  const url = didWebToUrl(did);
  const fetchImpl = opts?.fetch ?? (globalThis as { fetch?: typeof fetch }).fetch;
  if (typeof fetchImpl !== 'function') {
    throw new AHTMLError({
      code: 'SIGNATURE_INVALID',
      message: 'did:web resolution requires globalThis.fetch (or opts.fetch) to be available',
      hint: DEFAULT_HINTS.SIGNATURE_INVALID,
      context: did,
    });
  }

  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { accept: 'application/did+json, application/json' },
    });
  } catch (err) {
    throw new AHTMLError({
      code: 'SIGNATURE_INVALID',
      message: `did:web resolution failed: fetch threw for ${url}`,
      hint: DEFAULT_HINTS.SIGNATURE_INVALID,
      context: did,
      cause: err,
    });
  }

  if (!response.ok) {
    throw new AHTMLError({
      code: 'SIGNATURE_INVALID',
      message: `did:web resolution failed: ${response.status} ${response.statusText} for ${url}`,
      hint: DEFAULT_HINTS.SIGNATURE_INVALID,
      status: response.status,
      context: did,
    });
  }

  let doc: DidDocument;
  try {
    doc = (await response.json()) as DidDocument;
  } catch (err) {
    throw new AHTMLError({
      code: 'SIGNATURE_INVALID',
      message: `did:web resolution failed: response body is not valid JSON for ${url}`,
      hint: DEFAULT_HINTS.SIGNATURE_INVALID,
      context: did,
      cause: err,
    });
  }

  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.verificationMethod)) {
    throw new AHTMLError({
      code: 'SIGNATURE_INVALID',
      message: `did:web document is missing verificationMethod[] for ${url}`,
      hint: DEFAULT_HINTS.SIGNATURE_INVALID,
      context: did,
    });
  }

  const subtle = subtleOrThrow();
  const keys: VerifyKey[] = [];

  for (const vm of doc.verificationMethod) {
    if (!vm || typeof vm !== 'object') {
      warn('skipping non-object verificationMethod entry', vm);
      continue;
    }
    const jwk = vm.publicKeyJwk;
    if (!jwk || typeof jwk !== 'object' || typeof jwk.kty !== 'string') {
      warn('skipping verificationMethod without a publicKeyJwk', { id: vm.id });
      continue;
    }
    const alg = jwkAlgToSignAlg(jwk);
    if (alg === null) {
      warn(`skipping verificationMethod with unsupported alg`, {
        id: vm.id,
        alg: jwk.alg,
        kty: jwk.kty,
        crv: jwk.crv,
      });
      continue;
    }
    let cryptoKey: CryptoKey;
    try {
      cryptoKey = await subtle.importKey(
        'jwk',
        jwk as JsonWebKey,
        importParamsFor(alg),
        false,
        ['verify'],
      );
    } catch (err) {
      warn(`failed to import JWK for verificationMethod ${vm.id ?? '(no id)'}`, err);
      continue;
    }
    const key: VerifyKey = {
      alg,
      key: cryptoKey,
    };
    const kid = jwk.kid ?? vm.id;
    if (typeof kid === 'string' && kid.length > 0) key.kid = kid;
    keys.push(key);
  }

  if (keys.length === 0) {
    throw new AHTMLError({
      code: 'SIGNATURE_INVALID',
      message: `did:web document at ${url} yielded zero usable verification keys`,
      hint: DEFAULT_HINTS.SIGNATURE_INVALID,
      context: did,
    });
  }

  await cache.set(did, keys, DEFAULT_TTL_MS);
  return keys;
}

/* -------------------------------------------------------------------------- */
/* Convenience verify wrapper                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Convenience: `verifySnapshot` using a `did:web` identifier instead of
 * pre-imported keys. Resolves the DID, imports each key in the document's
 * `verificationMethod[]`, then tries each one. Returns the same
 * `VerifyResult` as `verifySnapshot`.
 *
 * When the DID can't be resolved at all (network error, 404, malformed
 * document) this returns `{ok:false, reason}` — it does NOT throw — so
 * adopters can treat resolution failures the same as signature mismatches
 * in a single `if (!result.ok)` branch. If you want a hard gate, wrap with
 * `verifySnapshotStrict`-style logic on the caller side, or use
 * `resolveDidWeb` directly to surface `AHTMLError`.
 */
export async function verifySnapshotWithDidWeb(
  snap: Snapshot,
  jws: string,
  did: string,
  opts?: { fetch?: typeof fetch; cache?: CacheStore<VerifyKey[]> },
): Promise<VerifyResult> {
  let trustedKeys: VerifyKey[];
  try {
    trustedKeys = await resolveDidWeb(did, opts);
  } catch (err) {
    const reason =
      err instanceof AHTMLError ? err.message : `did:web resolution failed: ${String(err)}`;
    return { ok: false, reason };
  }
  return verifySnapshot(snap, jws, { trustedKeys });
}

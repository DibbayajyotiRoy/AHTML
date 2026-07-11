/**
 * v0.8.0 — detached JWS signatures over canonical snapshot JSON.
 *
 * The signing payload is `toJson(snapshot)` — the deterministic,
 * key-ordered JSON form defined in `format-json.ts`. Two semantically
 * identical snapshots serialize byte-identically, so the signature is
 * stable across producers and round-trips.
 *
 * Wire format: JWS Compact Serialization with a detached payload
 * (RFC 7515 §3.1, Appendix F). The middle segment is empty, so a JWS
 * looks like `<protected-header>..<signature>`. Producers ship the
 * snapshot JSON separately (e.g. in the response body) and the JWS in a
 * sidecar header (`X-AHTML-Signature`) or inside
 * `snapshot.provenance.signature`. Verifiers reconstruct the signing
 * input by base64url-encoding the protected header, joining it to the
 * base64url of `toJson(snapshot)` with a `.`, and feeding the resulting
 * bytes to `crypto.subtle.verify`.
 *
 * The whole module talks to `globalThis.crypto.subtle` — with a guarded
 * dynamic `node:crypto` fallback that only runs when the global is missing
 * (bare Node 18) — so it runs unchanged on Cloudflare Workers, Deno, Bun,
 * browsers, and Node ≥ 18.
 */

import type { Snapshot } from './types.js';
import { toJson } from './format-json.js';
import { AHTMLError, DEFAULT_HINTS } from './errors.js';
import { trace } from './otel.js';

/** Supported JWS algorithms. Each maps to a WebCrypto verify parameter. */
export type SignAlg = 'ES256' | 'EdDSA' | 'RS256';

/** Producer-side key handle. The `alg` MUST match how `key` was generated. */
export interface SignKey {
  /** Optional Key ID — round-tripped into the JWS protected header. */
  kid?: string;
  alg: SignAlg;
  key: CryptoKey;
}

/** Verifier-side key handle. Verifiers may pass several and try each. */
export interface VerifyKey {
  /** Optional Key ID — when set, only signatures with a matching `kid` are tried against this key. */
  kid?: string;
  alg: SignAlg;
  key: CryptoKey;
}

export interface SignOptions {
  /** Override `key.kid`. Useful when one key has many identifiers. */
  kid?: string;
  /** Override `key.alg`. Rarely needed. */
  algorithm?: SignAlg;
}

export type VerifyResult =
  | { ok: true; signer: { kid?: string; alg: string } }
  | { ok: false; reason: string };

/* -------------------------------------------------------------------------- */
/* base64url helpers                                                          */
/* -------------------------------------------------------------------------- */

const TEXT_ENCODER = new TextEncoder();

function base64urlEncode(bytes: Uint8Array): string {
  // btoa is available in every WebCrypto-capable runtime (Node ≥ 16, Workers,
  // browsers). Build a binary string then convert to base64url.
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64urlEncodeString(s: string): string {
  return base64urlEncode(TEXT_ENCODER.encode(s));
}

function base64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  // Re-pad and translate alphabet.
  const padLen = (4 - (s.length % 4)) % 4;
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLen);
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* -------------------------------------------------------------------------- */
/* WebCrypto algorithm descriptors                                            */
/* -------------------------------------------------------------------------- */

function algParams(alg: SignAlg): AlgorithmIdentifier | EcdsaParams | RsaPssParams {
  switch (alg) {
    case 'ES256':
      return { name: 'ECDSA', hash: { name: 'SHA-256' } };
    case 'EdDSA':
      // Node 22 + modern browsers expose Ed25519 directly. Workers may
      // surface it under the same name; the standardized identifier is
      // simply 'Ed25519'.
      return { name: 'Ed25519' };
    case 'RS256':
      return { name: 'RSASSA-PKCS1-v1_5' };
  }
}

let subtleCached: SubtleCrypto | null = null;

async function subtle(): Promise<SubtleCrypto> {
  if (subtleCached) return subtleCached;
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.subtle) return (subtleCached = c.subtle);
  // Bare Node 18 exposes Web Crypto only behind a flag; load it from
  // node:crypto. Edge runtimes always have the global, so they never reach
  // this import.
  try {
    const { webcrypto } = await import('node:crypto');
    if (webcrypto?.subtle) return (subtleCached = webcrypto.subtle as unknown as SubtleCrypto);
  } catch {
    /* not Node — fall through to the throw below */
  }
  throw new Error('Web Crypto (globalThis.crypto.subtle) is not available in this runtime');
}

/* -------------------------------------------------------------------------- */
/* Sign                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Produce a detached JWS over `toJson(snap)`.
 *
 * Output format: `<base64url(header)>..<base64url(signature)>` (detached;
 * the payload segment is intentionally empty). Re-running with the same
 * `(snap, key)` produces byte-identical JWS for deterministic algorithms;
 * ECDSA is non-deterministic by design, so successive calls produce
 * different signatures that all verify.
 */
export async function signSnapshot(
  snap: Snapshot,
  key: SignKey,
  opts: SignOptions = {},
): Promise<string> {
  const alg = opts.algorithm ?? key.alg;
  const kid = opts.kid ?? key.kid;

  const headerObj: { alg: SignAlg; kid?: string } = { alg };
  if (kid !== undefined) headerObj.kid = kid;
  const headerJson = JSON.stringify(headerObj);
  const headerB64 = base64urlEncodeString(headerJson);

  const payloadJson = toJson(snap);
  const payloadB64 = base64urlEncodeString(payloadJson);

  const signingInput = TEXT_ENCODER.encode(`${headerB64}.${payloadB64}`);

  const sigBuf = await (await subtle()).sign(algParams(alg), key.key, signingInput);
  const sigB64 = base64urlEncode(new Uint8Array(sigBuf));

  // Detached form: empty payload segment.
  return `${headerB64}..${sigB64}`;
}

/**
 * Detached JWS over arbitrary payload bytes — the same profile
 * `signSnapshot` uses, for non-snapshot payloads (SPEC §4.7 simulated
 * responses, conformance attestations). Additive export (1.1).
 */
export async function signBytes(payload: Uint8Array, key: SignKey, opts: SignOptions = {}): Promise<string> {
  const alg = opts.algorithm ?? key.alg;
  const kid = opts.kid ?? key.kid;
  const headerObj: { alg: SignAlg; kid?: string } = { alg };
  if (kid !== undefined) headerObj.kid = kid;
  const headerB64 = base64urlEncodeString(JSON.stringify(headerObj));
  const payloadB64 = base64urlEncode(payload);
  const signingInput = TEXT_ENCODER.encode(`${headerB64}.${payloadB64}`);
  const sigBuf = await (await subtle()).sign(algParams(alg), key.key, signingInput);
  return `${headerB64}..${base64urlEncode(new Uint8Array(sigBuf))}`;
}

/** Verify a detached JWS produced by {@link signBytes}. Additive (1.1). */
export async function verifyBytes(
  payload: Uint8Array,
  jws: string,
  keys: VerifyKey[],
): Promise<boolean> {
  const parsed = parseDetachedJws(jws);
  if ('error' in parsed) return false;
  const signingInput = TEXT_ENCODER.encode(`${parsed.headerB64}.${base64urlEncode(payload)}`);
  const sig = base64urlDecode(parsed.sigB64);
  for (const key of keys) {
    if (parsed.header.alg && parsed.header.alg !== key.alg) continue;
    try {
      const ok = await (await subtle()).verify(algParams(key.alg), key.key, sig, signingInput);
      if (ok) return true;
    } catch {
      /* try the next key */
    }
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/* Verify                                                                     */
/* -------------------------------------------------------------------------- */

interface ParsedJws {
  headerB64: string;
  sigB64: string;
  header: { alg?: string; kid?: string };
}

function parseDetachedJws(jws: string): ParsedJws | { error: string } {
  if (typeof jws !== 'string') return { error: 'JWS is not a string' };
  const parts = jws.split('.');
  if (parts.length !== 3) return { error: 'JWS must have three segments' };
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];
  if (payloadB64 !== '') return { error: 'JWS is not in detached form (payload segment is non-empty)' };
  if (!headerB64 || !sigB64) return { error: 'JWS header or signature segment is empty' };
  let header: { alg?: string; kid?: string };
  try {
    const headerText = new TextDecoder().decode(base64urlDecode(headerB64));
    header = JSON.parse(headerText);
  } catch (err) {
    return { error: `JWS header is not valid base64url JSON: ${(err as Error).message}` };
  }
  if (!header || typeof header !== 'object') return { error: 'JWS header is not an object' };
  return { headerB64, sigB64, header };
}

/**
 * Verify a detached JWS produced by `signSnapshot`. Tries each trusted key
 * in order; the first success wins. Returns a `VerifyResult` and NEVER
 * throws on a signature mismatch — only on programmer errors (e.g. no
 * trusted keys supplied, runtime missing Web Crypto).
 */
export async function verifySnapshot(
  snap: Snapshot,
  jws: string,
  opts: { trustedKeys: VerifyKey[] },
): Promise<VerifyResult> {
  // OTel span (no-op when @opentelemetry/api is absent). Also covers
  // verifySnapshotStrict, which delegates here.
  return trace('ahtml.verify_signature', () => verifySnapshotImpl(snap, jws, opts), {
    'ahtml.url': snap?.url,
  });
}

async function verifySnapshotImpl(
  snap: Snapshot,
  jws: string,
  opts: { trustedKeys: VerifyKey[] },
): Promise<VerifyResult> {
  if (!opts || !Array.isArray(opts.trustedKeys) || opts.trustedKeys.length === 0) {
    throw new Error('verifySnapshot requires at least one trusted key');
  }
  const parsed = parseDetachedJws(jws);
  if ('error' in parsed) return { ok: false, reason: parsed.error };

  const { headerB64, sigB64, header } = parsed;
  if (typeof header.alg !== 'string') {
    return { ok: false, reason: 'JWS header missing alg' };
  }

  const payloadB64 = base64urlEncodeString(toJson(snap));
  const signingInput = TEXT_ENCODER.encode(`${headerB64}.${payloadB64}`);
  let signatureBytes: Uint8Array<ArrayBuffer>;
  try {
    signatureBytes = base64urlDecode(sigB64);
  } catch (err) {
    return { ok: false, reason: `signature is not valid base64url: ${(err as Error).message}` };
  }

  let lastReason = 'no trusted key matched';
  for (const candidate of opts.trustedKeys) {
    if (candidate.alg !== header.alg) {
      lastReason = `no trusted key matched alg=${header.alg}`;
      continue;
    }
    // If both sides declare a kid, require equality. If the candidate has
    // no kid, it's a wildcard for any kid.
    if (candidate.kid !== undefined && header.kid !== undefined && candidate.kid !== header.kid) {
      lastReason = `kid mismatch (header=${header.kid})`;
      continue;
    }
    try {
      const ok = await (await subtle()).verify(
        algParams(candidate.alg),
        candidate.key,
        signatureBytes,
        signingInput,
      );
      if (ok) {
        const signer: { kid?: string; alg: string } = { alg: candidate.alg };
        if (header.kid !== undefined) signer.kid = header.kid;
        else if (candidate.kid !== undefined) signer.kid = candidate.kid;
        return { ok: true, signer };
      }
      lastReason = 'signature did not verify';
    } catch (err) {
      // Verify-side errors (wrong-curve key, etc.) are treated like
      // a failed match — try the next key.
      lastReason = `verify threw: ${(err as Error).message}`;
    }
  }

  return { ok: false, reason: lastReason };
}

/**
 * Strict variant: throws `AHTMLError(SIGNATURE_INVALID)` on failure and
 * returns the snapshot unchanged on success. Useful in pipelines that
 * want signature verification to be a hard gate.
 */
export async function verifySnapshotStrict(
  snap: Snapshot,
  jws: string,
  opts: { trustedKeys: VerifyKey[] },
): Promise<Snapshot> {
  const result = await verifySnapshot(snap, jws, opts);
  if (result.ok) return snap;
  throw new AHTMLError({
    code: 'SIGNATURE_INVALID',
    message: `snapshot signature verification failed: ${result.reason}`,
    hint: DEFAULT_HINTS.SIGNATURE_INVALID,
  });
}

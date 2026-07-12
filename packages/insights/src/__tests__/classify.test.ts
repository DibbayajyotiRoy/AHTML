/**
 * T5.1 — request classifier.
 *
 * Proves the four classifications against a *real* RFC 9421 signature
 * produced by `@ahtmljs/agent`'s `signRequest` (the same code path the
 * 0.9.5 live proof and `examples/why-ahtml` exercise), plus a corrupted
 * signature, the ClaudeBot User-Agent, and a plain browser User-Agent.
 *
 * RFC 9421 / ClaudeBot fixtures: no static recorded fixture exists under
 * `tests/` or `examples/` (the repo generates signatures at runtime — see
 * `examples/why-ahtml/src/proofs.ts` `proveVerifiedAgent`). This test does
 * the same: it generates an ES256 key pair and signs a request live, so the
 * verified-agent path is exercised end-to-end rather than replayed.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { signRequest, type SignKey, type VerifyKey } from '@ahtmljs/agent';
import { classifyRequest } from '../classify.js';

const AGENT_URL = 'https://shop.example.com/ahtml/store/products/widget';

async function es256(): Promise<{ sign: SignKey; verify: VerifyKey }> {
  // Node 18 has no crypto global — same fallback the sign module uses.
  const subtle =
    globalThis.crypto?.subtle ?? ((await import('node:crypto')).webcrypto.subtle as unknown as SubtleCrypto);
  const pair = (await subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  return {
    sign: { alg: 'ES256', key: pair.privateKey },
    verify: { alg: 'ES256', key: pair.publicKey },
  };
}

/** Corrupt the base64 signature value while leaving the header well-formed. */
function tamperSignature(req: Request): Request {
  const sig = req.headers.get('signature');
  assert.ok(sig, 'signed request must carry a Signature header');
  // Format: `ahtml-agent=:<base64>:` — base64 never contains a colon, so
  // splitting on ':' isolates the payload cleanly (padding '=' stays put).
  const parts = sig.split(':');
  assert.equal(parts.length, 3, 'signature header shape is label=:b64:');
  const chars = parts[1]!.split('');
  const idx = 5 % chars.length;
  chars[idx] = chars[idx] === 'A' ? 'B' : 'A'; // guaranteed different byte
  parts[1] = chars.join('');
  const headers = new Headers(req.headers);
  headers.set('signature', parts.join(':'));
  return new Request(req.url, { method: req.method, headers });
}

describe('classifyRequest (T5.1)', () => {
  test('a valid RFC 9421 signature classifies as verified_agent with identity', async () => {
    const { sign, verify } = await es256();
    const base = new Request(AGENT_URL, {
      method: 'GET',
      headers: { 'content-type': 'application/ahtml+json' },
    });
    const signed = await signRequest(base, sign, { id: 'did:web:bot.example.com', version: '1.0' });

    const result = await classifyRequest(signed, { keys: [verify] });
    assert.equal(result.kind, 'verified_agent');
    assert.equal(result.identity?.id, 'did:web:bot.example.com');
  });

  test('a tampered signature classifies as unverified, never verified', async () => {
    const { sign, verify } = await es256();
    const base = new Request(AGENT_URL, {
      method: 'GET',
      headers: { 'content-type': 'application/ahtml+json' },
    });
    const signed = await signRequest(base, sign, { id: 'did:web:bot.example.com' });
    const tampered = tamperSignature(signed);

    const result = await classifyRequest(tampered, { keys: [verify] });
    assert.equal(result.kind, 'unverified');
    assert.equal(result.identity, undefined, 'unproven identity is never stored');
  });

  test('a present signature with NO trusted keys is unverified, never verified', async () => {
    const { sign } = await es256();
    const base = new Request(AGENT_URL, { method: 'GET' });
    const signed = await signRequest(base, sign, { id: 'did:web:bot.example.com' });

    const result = await classifyRequest(signed); // no keys configured
    assert.equal(result.kind, 'unverified');
  });

  test('the ClaudeBot User-Agent classifies as declared_bot', async () => {
    const result = await classifyRequest({
      method: 'GET',
      path: '/ahtml/store/products/widget',
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claude-bot@anthropic.com)',
      },
    });
    assert.equal(result.kind, 'declared_bot');
    assert.equal(result.identity?.id, 'ClaudeBot', 'stores only the curated token, not the raw UA');
  });

  test('a plain browser User-Agent classifies as human', async () => {
    const result = await classifyRequest({
      method: 'GET',
      path: '/ahtml/store/products/widget',
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      },
    });
    assert.equal(result.kind, 'human');
    assert.equal(result.identity, undefined);
  });

  test('no signature and no bot UA classifies as human', async () => {
    const result = await classifyRequest({ method: 'GET', path: '/', headers: {} });
    assert.equal(result.kind, 'human');
  });
});

/**
 * Capability proofs — executed, not asserted.
 *
 * Token efficiency is a tie: readable markdown is as cheap as AHTML. What
 * markdown *cannot* do is carry an executable, trustworthy, priced action
 * contract. Each function below runs real AHTML code against the snapshot and
 * returns the evidence. Every one of these is structurally impossible on
 * HTML, llms.txt, or auto-markdown — there is nothing there to run.
 */

import { webcrypto } from 'node:crypto';
import {
  snapshotsToMcp,
  signSnapshot,
  verifySnapshot,
  buildX402Response,
  signHttpRequest,
  verifyHttpSignature,
  toRsl,
  toMarkdown,
  type Snapshot,
  type SignKey,
  type VerifyKey,
} from '@ahtmljs/schema';
import { PAGE_URL } from './scenario.js';

// Node 18 has no global WebCrypto; bind the node:crypto implementation.
const cryptoImpl: Crypto = (globalThis.crypto ?? webcrypto) as Crypto;

async function es256(): Promise<{ sign: SignKey; verify: VerifyKey }> {
  const pair = (await cryptoImpl.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  return { sign: { alg: 'ES256', key: pair.privateKey }, verify: { alg: 'ES256', key: pair.publicKey } };
}

export interface Proof {
  capability: string;
  result: string;
  ok: boolean;
}

/** MCP tool surface, emitted from the same snapshot — zero extra code. */
export function proveMcp(snap: Snapshot): Proof {
  const manifest = snapshotsToMcp({ name: 'shop.example.com', url: PAGE_URL }, [snap]);
  const names = manifest.tools.map((t) => t.name);
  return {
    capability: 'MCP server (/ahtml/mcp.json)',
    result: `${manifest.tools.length} tools emitted: ${names.join(', ')}`,
    ok: manifest.tools.length > 0,
  };
}

/** Detached JWS provenance — sign, then verify. Real ES256, not a claim. */
export async function proveSigning(snap: Snapshot): Promise<Proof> {
  const { sign, verify } = await es256();
  const jws = await signSnapshot(snap, sign);
  const res = await verifySnapshot(snap, jws, { trustedKeys: [verify] });
  return {
    capability: 'Cryptographic provenance (detached JWS)',
    result: res.ok ? `signed + verified (${res.signer.alg}, ${jws.length} B detached JWS)` : `verify failed: ${res.reason}`,
    ok: res.ok,
  };
}

/** A priced action: what it costs AND how to pay (x402/0.2). */
export function provePricing(snap: Snapshot): Proof {
  const purchase = snap.actions.find((a) => a.id === 'purchase');
  if (!purchase) return { capability: 'Priced action (x402)', result: 'no purchase action', ok: false };
  const res = buildX402Response(purchase);
  const header = res.headers.get('x-payment-required');
  const accept = res.headers.get('accept-payment-request');
  return {
    capability: 'Priced action (HTTP 402 + x402)',
    result: `status ${res.status}, accept-payment-request: ${accept}, x-payment-required: ${header ? `${header.length} B payload` : 'absent'}`,
    ok: res.status === 402 && !!header,
  };
}

/** Verified-agent auth — sign an outbound request (RFC 9421), then verify it. */
export async function proveVerifiedAgent(): Promise<Proof> {
  const { sign, verify } = await es256();
  const req = new Request(`${PAGE_URL}`, { method: 'GET', headers: { 'content-type': 'application/json' } });
  const signed = await signHttpRequest(req, sign, { id: 'ClaudeBot/1.0', version: '1.0' });
  const res = await verifyHttpSignature(signed, [verify]);
  return {
    capability: 'Verified agents (RFC 9421 request signing)',
    result: res.ok ? `request signed + verified as "${res.agent?.id}"` : `verify failed: ${res.reason}`,
    ok: res.ok,
  };
}

/** RSL 1.0 license file, derived from the snapshot's policy. */
export function proveRsl(snap: Snapshot): Proof {
  const rsl = toRsl(snap);
  return {
    capability: 'Content licensing (RSL 1.0 + Content Signals)',
    result: `${Buffer.byteLength(rsl)} B license emitted${/content-signals/i.test(rsl) ? ', with Content Signals' : ''}`,
    ok: rsl.length > 0,
  };
}

/** AHTML also serves the markdown use-case — but losslessly and structured. */
export function proveMarkdown(snap: Snapshot): Proof {
  const md = toMarkdown(snap);
  const structured = /purchase/i.test(md) && /P30D|refund|reversible/i.test(md);
  return {
    capability: 'Markdown view (Accept: text/markdown)',
    result: `${Buffer.byteLength(md)} B${structured ? ', action contract preserved' : ''}`,
    ok: md.length > 0,
  };
}

export async function runProofs(snap: Snapshot): Promise<Proof[]> {
  return [
    proveMcp(snap),
    await proveSigning(snap),
    provePricing(snap),
    await proveVerifiedAgent(),
    proveRsl(snap),
    proveMarkdown(snap),
  ];
}

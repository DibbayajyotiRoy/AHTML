/**
 * HTTP Message Signatures (RFC 9421) — minimal subset for AHTML agent auth.
 *
 * Covers: @method, @target-uri, @authority, content-type (when present), date.
 * The signature goes in Signature + Signature-Input headers per RFC 9421 §3.
 * Agents include X-AHTML-Agent with their identity; servers verify and extract it.
 */

export type { SignKey, VerifyKey, VerifyResult } from '../sign.js';
import type { SignKey, VerifyKey, VerifyResult } from '../sign.js';

export interface AgentIdentity {
  /** Opaque agent ID — a did:web URI or a plain string like 'ClaudeBot/1.0'. */
  id: string;
  /** Agent software version. */
  version?: string;
  /** did:web DID for key resolution. When set, verifiers can resolve the public key. */
  did?: string;
}

export interface RequestSignOptions {
  /** Signature label in the Signature header (default: 'ahtml-agent'). */
  label?: string;
  /** Override the Date used in signing (default: now). For testing. */
  now?: Date;
}

/**
 * Sign an HTTP Request with an AHTML agent signature.
 *
 * Returns a new Request with Signature, Signature-Input, and
 * X-AHTML-Agent headers added.
 */
export async function signHttpRequest(
  request: Request,
  key: SignKey,
  agent: AgentIdentity,
  opts: RequestSignOptions = {},
): Promise<Request> {
  const label = opts.label ?? 'ahtml-agent';
  const now = opts.now ?? new Date();
  const created = Math.floor(now.getTime() / 1000);

  const url = new URL(request.url);
  const authority = url.host;

  // Build the signature base per RFC 9421 §2.5
  const componentIds: string[] = ['"@method"', '"@authority"', '"@target-uri"'];

  const contentType = request.headers.get('content-type');
  if (contentType) {
    componentIds.push('"content-type"');
  }

  const params = `label="${label}";created=${created};alg="${key.alg.toLowerCase()}"${key.kid ? `;keyid="${key.kid}"` : ''}`;

  const componentValues: Record<string, string> = {
    '"@method"': request.method.toLowerCase(),
    '"@authority"': authority,
    '"@target-uri"': request.url,
  };
  if (contentType) {
    componentValues['"content-type"'] = contentType;
  }

  const baseLines = componentIds.map(id => `${id}: ${componentValues[id]!}`);
  baseLines.push(`"@signature-params": (${componentIds.join(' ')});${params}`);
  const signatureBase = baseLines.join('\n');

  // Sign with WebCrypto
  const encoder = new TextEncoder();
  const data = encoder.encode(signatureBase);

  let sigBytes: ArrayBuffer;
  if (key.alg === 'ES256') {
    sigBytes = await globalThis.crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key.key,
      data,
    );
  } else if (key.alg === 'EdDSA') {
    sigBytes = await globalThis.crypto.subtle.sign('Ed25519', key.key, data);
  } else {
    sigBytes = await globalThis.crypto.subtle.sign(
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      key.key,
      data,
    );
  }

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));
  const agentHeader = JSON.stringify(agent);

  const headers = new Headers(request.headers);
  headers.set('signature-input', `${label}=(${componentIds.join(' ')});${params}`);
  headers.set('signature', `${label}=:${sigB64}:`);
  headers.set('x-ahtml-agent', agentHeader);
  headers.set('date', now.toUTCString());

  return new Request(request, { headers });
}

export interface VerifyOptions {
  /** Max age of the signature in seconds (default: 300 = 5 min). */
  maxAge?: number;
}

export type AgentVerifyResult =
  | { ok: true; signer: { kid?: string; alg: string }; agent?: AgentIdentity }
  | { ok: false; reason: string; agent?: AgentIdentity };

/**
 * Verify an HTTP Message Signature on an incoming request.
 *
 * Returns `{ ok: true, agent, signer }` on success, `{ ok: false, reason }` on failure.
 * When no Signature-Input header is present, returns `{ ok: false, reason: 'unsigned' }`.
 */
export async function verifyHttpSignature(
  request: Request,
  keys: VerifyKey[],
  opts: VerifyOptions = {},
): Promise<AgentVerifyResult> {
  const maxAge = opts.maxAge ?? 300;
  const sigInput = request.headers.get('signature-input');
  const sigHeader = request.headers.get('signature');

  if (!sigInput || !sigHeader) {
    return { ok: false, reason: 'unsigned' };
  }

  // Parse agent identity
  let agent: AgentIdentity | undefined;
  const agentHeader = request.headers.get('x-ahtml-agent');
  if (agentHeader) {
    try { agent = JSON.parse(agentHeader) as AgentIdentity; } catch { /* ignore malformed */ }
  }

  // Extract label and params from Signature-Input
  const labelMatch = sigInput.match(/^([a-z0-9_-]+)=\(([^)]*)\);(.+)$/i);
  if (!labelMatch) return { ok: false, reason: 'malformed signature-input' };

  const [, label, componentList, params] = labelMatch;
  const componentIds = componentList!.split(' ').filter(Boolean);

  // Check created timestamp
  const createdMatch = params!.match(/created=(\d+)/);
  if (createdMatch) {
    const created = parseInt(createdMatch[1]!, 10);
    const now = Math.floor(Date.now() / 1000);
    if (now - created > maxAge) {
      return { ok: false, reason: 'signature expired' };
    }
  }

  // Extract algorithm and keyid from params
  const algMatch = params!.match(/alg="([^"]+)"/);
  const kidMatch = params!.match(/keyid="([^"]+)"/);
  const kid = kidMatch ? kidMatch[1] : undefined;

  // Extract signature value
  const sigValueMatch = sigHeader.match(new RegExp(`${label!}=:([^:]+):`));
  if (!sigValueMatch) return { ok: false, reason: 'signature value not found' };

  const sigB64 = sigValueMatch[1]!;
  let sigBytes: Uint8Array;
  try {
    sigBytes = Uint8Array.from(atob(sigB64), c => c.charCodeAt(0));
  } catch {
    return { ok: false, reason: 'invalid base64 in signature' };
  }

  // Reconstruct signature base
  const url = new URL(request.url);
  const componentValues: Record<string, string> = {
    '"@method"': request.method.toLowerCase(),
    '"@authority"': url.host,
    '"@target-uri"': request.url,
    '"content-type"': request.headers.get('content-type') ?? '',
  };

  const baseLines = componentIds.map(id => {
    const val = componentValues[id] ?? request.headers.get(id.replace(/"/g, '')) ?? '';
    return `${id}: ${val}`;
  });
  baseLines.push(`"@signature-params": (${componentList});${params}`);
  const signatureBase = baseLines.join('\n');
  const encoder = new TextEncoder();
  const data = encoder.encode(signatureBase);

  // Try each matching key
  for (const vk of keys) {
    if (kid && vk.kid && vk.kid !== kid) continue;

    try {
      let ok = false;
      const buf = sigBytes.buffer as ArrayBuffer;
      if (vk.alg === 'ES256') {
        ok = await globalThis.crypto.subtle.verify(
          { name: 'ECDSA', hash: 'SHA-256' }, vk.key, buf, data,
        );
      } else if (vk.alg === 'EdDSA') {
        ok = await globalThis.crypto.subtle.verify('Ed25519', vk.key, buf, data);
      } else {
        ok = await globalThis.crypto.subtle.verify(
          { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, vk.key, buf, data,
        );
      }
      if (ok) return { ok: true, signer: { kid: vk.kid, alg: vk.alg }, agent };
    } catch { /* try next key */ }
  }

  return { ok: false, reason: 'no matching key verified the signature' };
}

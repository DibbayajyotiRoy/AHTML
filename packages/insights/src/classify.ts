/**
 * Request classifier — T5.1.
 *
 * Sorts incoming traffic into four kinds:
 *
 *   - `verified_agent` — the request carries an RFC 9421 HTTP Message
 *     Signature that *actually verifies* against one of the publisher's
 *     trusted keys. Verification is delegated to `verifyAgentSignature`
 *     from `@ahtmljs/agent` (the same code path the 0.9.5 live proof
 *     exercised), never re-implemented here.
 *   - `unverified` — signature headers are present but do NOT verify
 *     (tampered, expired, unknown key, or no keys configured). A
 *     present-but-unverifiable signature MUST classify as `unverified`,
 *     never `verified` and never silently downgraded to `declared_bot`:
 *     a broken signature is a stronger signal than a User-Agent string.
 *   - `declared_bot` — no signature, but a recognizable bot User-Agent
 *     (GPTBot, ClaudeBot, PerplexityBot, Googlebot, …).
 *   - `human` — everything else.
 */

import { verifyAgentSignature, type AgentIdentity } from '@ahtmljs/agent';
import type { VerifyKey } from '@ahtmljs/schema';

export type { AgentIdentity };

export type RequestKind = 'verified_agent' | 'declared_bot' | 'human' | 'unverified';

/** Header bag: a Fetch `Headers` or a plain lowercase-friendly record. */
export type HeadersLike = Headers | Record<string, string | undefined>;

export interface ClassifyInput {
  method: string;
  /** Request path (`/store/products/x`) or a full URL. */
  path: string;
  headers: HeadersLike;
}

export interface ClassifyOptions {
  /**
   * Trusted keys for RFC 9421 verification. Without keys, a signed
   * request can never be proven — it classifies as `unverified`.
   */
  keys?: VerifyKey[];
  /** Max signature age in seconds (default 300, matching the verifier). */
  maxAge?: number;
}

export interface Classification {
  kind: RequestKind;
  /**
   * Resolved identity. Only populated from the *verified* signature
   * (`verified_agent`) or from the matched bot-list token
   * (`declared_bot`). Never populated from unverifiable claims.
   */
  identity?: AgentIdentity;
}

/**
 * Self-declared bot User-Agent tokens. Deliberately a small, curated
 * list — the goal is "the crawlers a publisher actually asks about",
 * not a full UA database. Matching is case-insensitive substring.
 */
export const KNOWN_BOT_TOKENS: readonly string[] = [
  // AI agents / crawlers
  'GPTBot',
  'ChatGPT-User',
  'OAI-SearchBot',
  'ClaudeBot',
  'Claude-Web',
  'Claude-User',
  'anthropic-ai',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Amazonbot',
  'cohere-ai',
  'Bytespider',
  'meta-externalagent',
  'CCBot',
  // Search engines
  'Googlebot',
  'bingbot',
  'DuckDuckBot',
  'Applebot',
  'YandexBot',
  'Baiduspider',
];

function headerGet(headers: HeadersLike, name: string): string | null {
  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(name);
  }
  const rec = headers as Record<string, string | undefined>;
  const direct = rec[name] ?? rec[name.toLowerCase()];
  if (direct != null) return direct;
  const wanted = name.toLowerCase();
  for (const [k, v] of Object.entries(rec)) {
    if (k.toLowerCase() === wanted && v != null) return v;
  }
  return null;
}

/** Match a User-Agent against {@link KNOWN_BOT_TOKENS}; returns the token. */
export function matchBotUserAgent(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  const ua = userAgent.toLowerCase();
  for (const token of KNOWN_BOT_TOKENS) {
    if (ua.includes(token.toLowerCase())) return token;
  }
  return null;
}

/** Rebuild a `Request` suitable for `verifyAgentSignature`. The signed
 *  `@target-uri`/`@authority` come from the Host header + path, so the
 *  reconstruction matches what a well-behaved agent signed. */
function toRequest(input: ClassifyInput): Request {
  if (input.path.startsWith('http://') || input.path.startsWith('https://')) {
    return new Request(input.path, { method: input.method, headers: toHeaders(input.headers) });
  }
  const host = headerGet(input.headers, 'host') ?? 'localhost';
  const proto = headerGet(input.headers, 'x-forwarded-proto') ?? 'https';
  return new Request(`${proto}://${host}${input.path}`, {
    method: input.method,
    headers: toHeaders(input.headers),
  });
}

function toHeaders(headers: HeadersLike): Headers {
  if (typeof (headers as Headers).get === 'function') return headers as Headers;
  const h = new Headers();
  for (const [k, v] of Object.entries(headers as Record<string, string | undefined>)) {
    if (v != null) h.set(k, v);
  }
  return h;
}

/**
 * Classify a request. Accepts either a Fetch `Request` or the
 * `{ method, path, headers }` triple.
 */
export async function classifyRequest(
  input: ClassifyInput | Request,
  opts: ClassifyOptions = {},
): Promise<Classification> {
  const req =
    input instanceof Request
      ? input
      : toRequest(input);

  const hasSignature =
    req.headers.get('signature-input') != null || req.headers.get('signature') != null;

  if (hasSignature) {
    if (opts.keys?.length) {
      const result = await verifyAgentSignature(req, opts.keys, {
        maxAge: opts.maxAge,
      });
      if (result.ok) {
        return {
          kind: 'verified_agent',
          identity: result.agent ?? { id: `key:${result.signer.kid ?? result.signer.alg}` },
        };
      }
    }
    // Present but unverifiable — MUST be `unverified`, never `verified`,
    // and never demoted to declared_bot/human. Do not store the claimed
    // identity: it was not proven.
    return { kind: 'unverified' };
  }

  const bot = matchBotUserAgent(req.headers.get('user-agent'));
  if (bot) {
    // Store only the curated token, never the raw User-Agent string —
    // raw UAs are arbitrary client input (privacy guarantee, T5.3).
    return { kind: 'declared_bot', identity: { id: bot } };
  }

  return { kind: 'human' };
}

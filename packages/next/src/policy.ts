/**
 * Policy enforcement at the route handler edge.
 *
 * AHTML is opt-in. Sites that don't want agents do not install this plugin
 * and continue to ship HTML behind their existing defenses (CAPTCHA,
 * Cloudflare, etc). Sites that DO want agents install the plugin and use
 * this layer to set the terms:
 *
 *   - Identity: agents present a user-agent and (optionally) a signed
 *     identity token from the AI provider.
 *   - Rate limit: per-IP token bucket.
 *   - Auth: certain action endpoints require OAuth2 bearer tokens.
 *
 * This module ONLY enforces the read side (snapshot fetch). Action
 * execution is enforced by the host application's own action handlers
 * — AHTML just publishes the *contract* that says auth is required.
 */

import { buildX402Response, hasPaymentToken } from '@ahtmljs/schema';
import type { Action } from '@ahtmljs/schema';
import type { AHTMLConfig } from './index.js';

interface Bucket {
  tokens: number;
  last: number;
}

const buckets = new Map<string, Bucket>();

export interface PolicyDecision {
  deny: boolean;
  response: Response;
}

const ALLOW: PolicyDecision = {
  deny: false,
  response: new Response(null),
};

export async function enforcePolicy(req: Request, config: AHTMLConfig): Promise<PolicyDecision> {
  if (config.policy?.agents_welcome === false) {
    return deny(403, 'agents_not_welcome', 'this site has not opted into agent traffic');
  }

  const limit = parseRateLimit(config.policy?.rate_limit);
  if (limit) {
    const key = clientKey(req);
    const ok = consume(key, limit);
    if (!ok) {
      return deny(429, 'rate_limited', `rate limit ${config.policy?.rate_limit} exceeded`);
    }
  }

  return ALLOW;
}

function deny(status: number, code: string, message: string): PolicyDecision {
  return {
    deny: true,
    response: new Response(JSON.stringify({ error: code, message }), {
      status,
      headers: { 'content-type': 'application/json', 'x-ahtml-policy': code },
    }),
  };
}

function clientKey(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  const real = req.headers.get('x-real-ip');
  return (fwd?.split(',')[0]?.trim() || real || 'anon').toLowerCase();
}

/** Token bucket. Refills `tokens` per `windowMs`. */
function consume(key: string, limit: { tokens: number; windowMs: number }): boolean {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b) {
    b = { tokens: limit.tokens, last: now };
    buckets.set(key, b);
  }
  // Clamp non-negative to survive clock skew (NTP corrections, VM time-warps).
  // Negative elapsed would push refill negative and starve the bucket.
  const elapsed = Math.max(0, now - b.last);
  const refill = (elapsed / limit.windowMs) * limit.tokens;
  b.tokens = Math.min(limit.tokens, b.tokens + refill);
  b.last = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

function parseRateLimit(s: string | undefined): { tokens: number; windowMs: number } | null {
  if (!s) return null;
  const m = s.match(/^(\d+)\/(s|sec|min|hr|hour)$/i);
  if (!m) return null;
  const tokens = parseInt(m[1]!, 10);
  const unit = m[2]!.toLowerCase();
  const windowMs = unit.startsWith('s') ? 1_000 : unit.startsWith('m') ? 60_000 : 3_600_000;
  return { tokens, windowMs };
}

// ---------------------------------------------------------------------------
// x402 payment guard
// ---------------------------------------------------------------------------

type NextRouteHandler = (req: Request, ctx: { params: Record<string, string> }) => Promise<Response>;

/**
 * Wraps a Next.js route handler with x402 payment enforcement.
 *
 * Usage (app/api/actions/[id]/route.ts):
 *   import { withPaymentGuard } from '@ahtmljs/next/policy';
 *   import { myActions } from '@/lib/ahtml';
 *
 *   export const POST = withPaymentGuard(myActions, async (req, action) => {
 *     // action is pre-validated; payment was verified
 *     return Response.json({ ok: true });
 *   });
 *
 * If the matched action has `cost.rails` including 'x402' and the request
 * has no X-Payment header, returns 402 immediately.
 */
export function withPaymentGuard(
  actions: Action[],
  handler: (req: Request, action: Action) => Promise<Response>,
): NextRouteHandler {
  return async (req: Request, ctx: { params: Record<string, string> }) => {
    const actionId = ctx.params['id'] ?? ctx.params['action'];
    const action = actions.find(a => a.id === actionId);

    if (!action) {
      return Response.json({ error: 'action_not_found' }, { status: 404 });
    }

    // x402 gate
    if (action.cost?.rails?.includes('x402') && !hasPaymentToken(req)) {
      return buildX402Response(action);
    }

    return handler(req, action);
  };
}

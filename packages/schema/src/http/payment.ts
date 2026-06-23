/**
 * x402 payment protocol helpers (x402.org).
 *
 * x402 is a machine-micropayment protocol: when an action requires payment,
 * the server responds 402 with structured headers describing what's owed and
 * how to pay. The agent pays and retries with an X-Payment header.
 *
 * Wire format: per the x402 spec (v0.2), the 402 response includes:
 *   X-Payment-Required: <base64url-encoded JSON payload>
 * where the JSON payload is an X402PaymentDetails object.
 */

import type { Action } from '../types.js';

export interface X402PaymentDetails {
  /** x402 protocol version. */
  version: '0.2';
  /** Identifier for what's being paid for — typically the action execute_url. */
  resource: string;
  /** Human description shown to agent or user. */
  description: string;
  /** Max amount acceptable, in smallest denomination (e.g. cents for USD). */
  maxAmountRequired: number;
  /** ISO 4217 currency code. */
  currency: string;
  /** Payment schemes accepted (e.g. 'stripe', 'usdc', 'lightning'). */
  schemes: string[];
  /** If ACP checkout is available, the URL to initiate it. */
  checkout_url?: string;
}

export interface X402Options {
  /** Override the resource URL (default: action.execute_url ?? action.id). */
  resource?: string;
  /** Payment schemes to advertise (default: ['stripe']). */
  schemes?: string[];
  /** Override currency (default: action.cost?.currency ?? 'USD'). */
  currency?: string;
}

/**
 * Build a 402 Payment Required Response for an action that requires payment.
 *
 * Usage in a Next.js route handler:
 *   if (action.cost?.rails?.includes('x402') && !hasPayment(req)) {
 *     return buildX402Response(action);
 *   }
 */
export function buildX402Response(action: Action, opts: X402Options = {}): Response {
  const cost = action.cost;
  if (!cost) {
    return new Response('Payment required', { status: 402 });
  }

  const amountCents = cost.amount != null ? Math.ceil(cost.amount * 100) : 1;
  const currency = opts.currency ?? cost.currency ?? 'USD';
  const resource = opts.resource ?? action.execute_url ?? action.id;
  const schemes = opts.schemes ?? ['stripe'];

  const details: X402PaymentDetails = {
    version: '0.2',
    resource,
    description: cost.notes ?? `Payment required for action: ${action.id}`,
    maxAmountRequired: amountCents,
    currency,
    schemes,
    ...(action.cost?.checkout_url ? { checkout_url: action.cost.checkout_url } : {}),
  };

  // base64url-encode the JSON payload (no padding, URL-safe)
  const json = JSON.stringify(details);
  const b64 = btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  return new Response(
    JSON.stringify({ error: 'payment_required', action: action.id, details }),
    {
      status: 402,
      headers: {
        'content-type': 'application/json',
        'x-payment-required': b64,
        'accept-payment-request': 'x402/0.2',
        ...(action.cost?.checkout_url ? { 'x-checkout-url': action.cost.checkout_url } : {}),
      },
    },
  );
}

/**
 * Check whether an incoming request includes an x402 payment token.
 * Agents include X-Payment with the payment receipt after paying.
 */
export function hasPaymentToken(request: Request): boolean {
  return request.headers.has('x-payment');
}

/**
 * Extract and decode the X-Payment header from a paid request.
 * Returns null if not present or malformed.
 */
export function extractPaymentToken(request: Request): Record<string, unknown> | null {
  const raw = request.headers.get('x-payment');
  if (!raw) return null;
  try {
    const padded = raw.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice((raw.length * 3) % 4);
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

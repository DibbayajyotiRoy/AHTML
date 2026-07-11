/**
 * Producer-side dry-run handler (SPEC §4.7 addendum, ADR-0003).
 *
 * Framework-neutral: every adapter (Next/Vite/Hono/Astro/SvelteKit) speaks
 * fetch Request/Response, so one factory serves them all:
 *
 *   const dryRun = createSimulateHandler({
 *     action: subscribeAction,
 *     predict: async (input) => ({
 *       predicted_output: { subscription: 'pro', starts: '…' },
 *       would_charge: { amount: 12, currency: 'USD' },
 *       reversal: { reversible: true, window: 'P14D', policy: 'cancel' },
 *     }),
 *     sign,                         // optional SignKey — rehearsals sign like snapshots
 *   });
 *   // mount at the action's dry_run.url
 *
 * The handler NEVER calls the real action: `predict` is a pure function of
 * the input by contract. The response always carries `simulated: true`; when
 * a `sign` key is provided the canonical response JSON is signed and the JWS
 * travels in `X-AHTML-Signature`, exactly like snapshot signing.
 */
import type { Action } from './types.js';
import { signBytes, type SignKey } from './sign.js';

export interface SimulatePrediction {
  predicted_output?: unknown;
  would_charge?: { amount: number; currency: string };
  reversal?: { reversible: boolean; window?: string; policy?: string };
}

export interface SimulateHandlerOptions {
  action: Action;
  predict: (input: unknown, request: Request) => Promise<SimulatePrediction> | SimulatePrediction;
  sign?: SignKey;
}

export interface SimulatedResponseBody extends SimulatePrediction {
  simulated: true;
  action_id: string;
}

export function createSimulateHandler(options: SimulateHandlerOptions) {
  return async function handle(request: Request): Promise<Response> {
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      input = undefined;
    }
    const prediction = await options.predict(input, request);
    const body: SimulatedResponseBody = {
      simulated: true,
      action_id: options.action.id,
      ...prediction,
    };
    // Fall back to the action contract when predict omits the itemization.
    if (!body.would_charge && options.action.cost?.amount != null && options.action.cost.currency) {
      body.would_charge = {
        amount: options.action.cost.amount,
        currency: options.action.cost.currency,
      };
    }
    if (!body.reversal && typeof options.action.reversible === 'object') {
      body.reversal = options.action.reversible;
    }
    const json = JSON.stringify(body);
    const headers: Record<string, string> = {
      'content-type': 'application/json; charset=utf-8',
      'x-ahtml-simulated': 'true',
    };
    if (options.sign) {
      headers['x-ahtml-signature'] = await signBytes(new TextEncoder().encode(json), options.sign);
    }
    return new Response(json, { status: 200, headers });
  };
}

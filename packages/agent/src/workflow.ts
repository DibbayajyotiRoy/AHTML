/**
 * Action execution and dry-run.
 *
 * AHTML actions carry typed contracts (input/output schema, auth, cost,
 * reversibility, side effects, confirmation level). This module gives
 * agents a single function to either *simulate* the action against
 * preview_url or *execute* it against execute_url, with policy gates
 * applied client-side as an extra safety layer.
 */

import type { Action, Snapshot } from '@ahtmljs/schema';

export interface ActionRunOptions {
  /** Override the snapshot's confirmation level. Useful when the caller
   *  has already confirmed with the user. */
  confirm?: boolean;
  /** Bearer token for auth: required actions. */
  bearer?: string;
  /** Don't actually call execute_url — hit preview_url and return. */
  dryRun?: boolean;
  /** Skip side-effect safety checks (NOT recommended for autonomous agents). */
  skipChecks?: boolean;
  fetch?: typeof fetch;
}

export interface ActionResult<T = unknown> {
  status: 'executed';
  output: T;
  http_status: number;
}

export interface DryRunResult {
  status: 'dry_run';
  would_charge?: { amount: number; currency: string };
  would_email?: string[];
  would_side_effects?: string[];
  preview?: unknown;
}

/** Throw when an action's contract conflicts with the agent's policy. */
export class ActionRefused extends Error {
  constructor(public reason: string) {
    super(`ActionRefused: ${reason}`);
  }
}

export async function runAction<TIn, TOut>(
  snapshot: Snapshot,
  action: Action,
  input: TIn,
  opts: ActionRunOptions = {},
): Promise<ActionResult<TOut> | DryRunResult> {
  const fetcher = opts.fetch ?? globalThis.fetch;

  if (!opts.skipChecks) checkPolicy(snapshot, action, opts);

  // --- Dry run path ---
  if (opts.dryRun || (!action.execute_url && action.preview_url)) {
    if (!action.preview_url) {
      return {
        status: 'dry_run',
        would_charge: extractCost(action),
        would_side_effects: action.side_effects ?? [],
      };
    }
    const res = await fetcher(action.preview_url, {
      method: 'POST',
      headers: jsonHeaders(opts.bearer),
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`preview failed: ${res.status}`);
    const preview = await res.json().catch(() => undefined);
    return {
      status: 'dry_run',
      would_charge: extractCost(action),
      would_side_effects: action.side_effects ?? [],
      preview,
    };
  }

  // --- Execute path ---
  if (!action.execute_url) {
    throw new ActionRefused(`action "${action.id}" has no execute_url`);
  }
  const res = await fetcher(action.execute_url, {
    method: action.method ?? 'POST',
    headers: jsonHeaders(opts.bearer),
    body: JSON.stringify(input),
  });
  const output = (await res.json().catch(() => null)) as TOut;
  if (!res.ok) {
    throw new Error(`action "${action.id}" failed: ${res.status}`);
  }
  return { status: 'executed', output, http_status: res.status };
}

function checkPolicy(snapshot: Snapshot, action: Action, opts: ActionRunOptions): void {
  if (action.auth === 'required' && !opts.bearer) {
    throw new ActionRefused(`action "${action.id}" requires auth but no bearer provided`);
  }
  if (action.confirmation === 'required' && !opts.confirm) {
    throw new ActionRefused(
      `action "${action.id}" requires explicit confirmation — pass { confirm: true }`,
    );
  }
  if (snapshot.policy?.agents_welcome === false) {
    throw new ActionRefused(`site policy: agents_welcome=false`);
  }
}

function extractCost(action: Action): { amount: number; currency: string } | undefined {
  const c = action.cost;
  if (!c || c.amount == null || !c.currency) return undefined;
  return { amount: c.amount, currency: c.currency };
}

function jsonHeaders(bearer?: string): Record<string, string> {
  const h: Record<string, string> = { 'content-type': 'application/json' };
  if (bearer) h.authorization = `Bearer ${bearer}`;
  return h;
}

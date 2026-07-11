/**
 * Event shape and sanitization — T5.2 / T5.3.
 *
 * The privacy guarantee (ROADMAP Feature 4) is enforced structurally:
 * an `InsightEvent` has exactly six fields — timestamp, method, path,
 * agent, format, outcome — and `sanitizeEvent()` rebuilds every stored
 * event from scratch so nothing else (bodies, query strings, cookies,
 * arbitrary headers) can ride along, even if a caller passes a wider
 * object.
 */

import type { RequestKind } from './classify.js';

/** Negotiated wire format, derived from the response Content-Type. */
export type InsightFormat = 'json' | 'compact' | 'markdown' | 'stream' | 'diff' | 'other';

/**
 * Outcomes:
 *   snapshot fetches → 'ok' | 'not_modified' | 'denied' | 'error'
 *   actions / x402   → 'invoked' | 'refused' | 'paid'
 */
export type InsightOutcome =
  | 'ok'
  | 'not_modified'
  | 'denied'
  | 'error'
  | 'invoked'
  | 'refused'
  | 'paid';

export interface InsightAgent {
  kind: RequestKind;
  /** Verified identity id, or the curated bot token. Never raw UA. */
  id?: string;
}

export interface InsightEvent {
  /** ISO 8601 timestamp. */
  ts: string;
  method: string;
  /** URL pathname only — the query string is never stored. */
  path: string;
  agent: InsightAgent;
  format?: InsightFormat;
  outcome: InsightOutcome;
}

const OUTCOMES: readonly InsightOutcome[] = [
  'ok', 'not_modified', 'denied', 'error', 'invoked', 'refused', 'paid',
];
const FORMATS: readonly InsightFormat[] = [
  'json', 'compact', 'markdown', 'stream', 'diff', 'other',
];
const KINDS: readonly RequestKind[] = [
  'verified_agent', 'declared_bot', 'human', 'unverified',
];

/** Maximum stored identity length — a verified id is publisher-trusted
 *  but still bounded so storage cannot be ballooned. */
const MAX_ID_LEN = 200;

/** Derive the negotiated format from a response Content-Type. */
export function formatFromContentType(contentType: string | null | undefined): InsightFormat | undefined {
  if (!contentType) return undefined;
  const ct = contentType.toLowerCase();
  if (ct.includes('application/ahtml+json-seq')) return 'stream';
  if (ct.includes('application/ahtml-diff+json')) return 'diff';
  if (ct.includes('application/ahtml+json') || ct.includes('application/json')) return 'json';
  if (ct.includes('application/ahtml+text') || ct.includes('text/plain')) return 'compact';
  if (ct.includes('text/markdown')) return 'markdown';
  return 'other';
}

/** Strip a path or URL down to its pathname — no query, no fragment. */
export function pathnameOnly(pathOrUrl: string): string {
  try {
    if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
      return new URL(pathOrUrl).pathname;
    }
    return new URL(pathOrUrl, 'http://x').pathname;
  } catch {
    const q = pathOrUrl.search(/[?#]/);
    return q >= 0 ? pathOrUrl.slice(0, q) : pathOrUrl;
  }
}

/**
 * Rebuild an event with exactly the allowed fields. This is the single
 * choke point every stored event passes through (T5.3): whatever extra
 * properties an input object carries, they cannot survive this function.
 */
export function sanitizeEvent(e: InsightEvent): InsightEvent {
  const out: InsightEvent = {
    ts: new Date(e.ts ?? Date.now()).toISOString(),
    method: String(e.method ?? 'GET').toUpperCase().slice(0, 16),
    path: pathnameOnly(String(e.path ?? '/')),
    agent: {
      kind: KINDS.includes(e.agent?.kind) ? e.agent.kind : 'human',
    },
    outcome: OUTCOMES.includes(e.outcome) ? e.outcome : 'error',
  };
  if (e.agent?.id != null) out.agent.id = String(e.agent.id).slice(0, MAX_ID_LEN);
  if (e.format != null && FORMATS.includes(e.format)) out.format = e.format;
  return out;
}

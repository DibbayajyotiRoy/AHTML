/**
 * Accept-header parsing helpers shared by HTTP adapters.
 *
 * Pure functions — no module-level state, no I/O. Built on the WHATWG /
 * Web Standards string contract for header values.
 */

export interface AcceptEntry {
  type: string;
  q: number;
}

/**
 * Parse an Accept header into a list of `{ type, q }` entries, honoring
 * RFC 7231 q-values. Unknown parameters are ignored. Empty / blank entries
 * are dropped. Types are lower-cased. q-values are clamped to `[0, 1]`.
 */
export function parseAcceptEntries(header: string): Array<{ type: string; q: number }> {
  const out: AcceptEntry[] = [];
  for (const raw of header.split(',')) {
    const parts = raw.trim().split(';').map((p) => p.trim());
    const type = (parts.shift() ?? '').toLowerCase();
    if (!type) continue;
    let q = 1;
    for (const p of parts) {
      const m = p.match(/^q=([0-9]*\.?[0-9]+)$/i);
      if (m) q = Math.max(0, Math.min(1, parseFloat(m[1]!)));
    }
    out.push({ type, q });
  }
  return out;
}

/**
 * Choose JSON vs compact from an Accept header, honoring RFC 7231 q-values.
 *
 * Returns 'json' when the client signals a higher preference for any of
 * `application/ahtml+json` or `application/json`. Returns 'compact' for
 * `application/ahtml+text` or `text/plain`. Wildcards (`* /*`) keep the
 * agent-friendly default (compact). Ties favor JSON, which is the more
 * widely-interoperable format.
 */
export function chooseFormat(header: string): 'json' | 'compact' {
  if (!header) return 'compact';
  let bestJson = -1;
  let bestCompact = -1;
  for (const m of parseAcceptEntries(header)) {
    if (m.type === 'application/ahtml+json' || m.type === 'application/json') {
      if (m.q > bestJson) bestJson = m.q;
    } else if (m.type === 'application/ahtml+text' || m.type === 'text/plain') {
      if (m.q > bestCompact) bestCompact = m.q;
    }
  }
  if (bestJson < 0 && bestCompact < 0) return 'compact';
  return bestJson >= bestCompact ? 'json' : 'compact';
}

/**
 * Conditional-GET helpers for HTTP adapters.
 *
 * Pure functions — no module-level state, no I/O. Built on the Web Standards
 * `Request` / `Response` / `Headers` primitives only.
 */

/**
 * Compute a weak ETag from any string body using djb2.
 *
 * The same algorithm `computeEtag` uses on snapshots, exposed for emitter
 * responses (mcp.json, openapi.json, etc.) that aren't full snapshots but
 * still want stable conditional-GET semantics.
 */
export function weakEtagOf(body: string): string {
  return `W/"${djb2(body)}"`;
}

/**
 * Return `true` when the request's `If-None-Match` header matches the given
 * etag. Per RFC 7232 §3.2, the comparison for GET/HEAD uses the weak rule:
 * the weak-prefix (`W/`) is stripped on both sides before opaque-tag
 * equality. A literal `*` always matches when the resource exists.
 *
 * Multiple tags may be supplied as a comma-separated list; the request
 * matches if any single entry matches.
 */
export function isNotModified(req: Request, etag: string): boolean {
  const header = req.headers.get('if-none-match');
  if (!header) return false;
  const target = stripWeak(etag);
  for (const raw of header.split(',')) {
    const tag = raw.trim();
    if (!tag) continue;
    if (tag === '*') return true;
    if (stripWeak(tag) === target) return true;
  }
  return false;
}

/**
 * Build a `304 Not Modified` response that echoes the etag and (optionally)
 * the cache-control directive. Body is empty per RFC 7232 §4.1.
 */
export function notModifiedResponse(etag: string, cacheControl?: string): Response {
  const headers: Record<string, string> = { etag };
  if (cacheControl) headers['cache-control'] = cacheControl;
  return new Response(null, { status: 304, headers });
}

function stripWeak(tag: string): string {
  return tag.startsWith('W/') ? tag.slice(2) : tag;
}

function djb2(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

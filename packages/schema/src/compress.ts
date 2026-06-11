/**
 * Web-Standards `Accept-Encoding` negotiation + body compression — the
 * v0.7.0 release theme.
 *
 * One module for both sides of the wire: the route handler picks an
 * encoding from the request `Accept-Encoding`, wraps its response body
 * in `CompressionStream`, and tags the response with `Content-Encoding`
 * + `Vary: Accept-Encoding`. Clients with `fetch()` decode transparently;
 * the streaming `AsyncIterable` path also Just Works because
 * `Response.body` is already a piped `DecompressionStream` by the time
 * the application sees it.
 *
 * `CompressionStream` is a Web Standard available natively in Node 18+,
 * Bun, Deno, Cloudflare Workers, and Vercel Edge — so there are zero
 * `node:zlib` imports here. Same code runs unchanged in every runtime.
 */

export type Encoding = 'br' | 'gzip' | 'identity';

const SUPPORTED: Encoding[] = ['br', 'gzip', 'identity'];

// 'br' in CompressionStream is newer than gzip (Node gained it after 22;
// browsers in 2025). Probe once, lazily — advertising an encoding we can't
// produce turns a br-only client into an unhandled throw downstream.
let brSupported: boolean | null = null;

function supportsBr(): boolean {
  if (brSupported !== null) return brSupported;
  try {
    new (CompressionStream as unknown as new (f: string) => unknown)('br');
    brSupported = true;
  } catch {
    brSupported = false;
  }
  return brSupported;
}

/**
 * Pick the highest-quality encoding the client accepts that this runtime
 * supports. Honors RFC 7231 q-values; defaults to `identity` when the
 * header is missing or every supported encoding is explicitly disabled.
 */
export function chooseEncoding(acceptEncoding: string | null | undefined): Encoding {
  if (!acceptEncoding) return 'identity';

  const entries = parseAcceptEncoding(acceptEncoding);
  const explicit = new Map<string, number>();
  let wildcard: number | undefined;
  for (const e of entries) {
    if (e.token === '*') wildcard = e.q;
    else explicit.set(e.token, e.q);
  }

  // Try each supported encoding in our own preference order.
  let best: { enc: Encoding; q: number } | null = null;
  for (const enc of SUPPORTED) {
    if (enc === 'br' && !supportsBr()) continue;
    let q = explicit.get(enc);
    if (q === undefined) q = wildcard;
    if (q === undefined) {
      // RFC 7231: identity is implicitly acceptable when not refused. We
      // give it a vanishingly small implicit q so it stays acceptable as
      // a fallback but loses to any explicit positive q from another
      // encoding — matches Nginx / Apache / Cloudflare behaviour (the
      // client said `gzip;q=0.5` so it WANTS gzip, not identity).
      if (enc === 'identity') q = 0.001;
      else continue;
    }
    if (q > 0 && (!best || q > best.q)) best = { enc, q };
  }
  return best?.enc ?? 'identity';
}

/**
 * Compress a `ReadableStream<Uint8Array>` body. Returns the original
 * stream when `encoding === 'identity'`; otherwise pipes through
 * `CompressionStream`. Throws synchronously if the runtime doesn't
 * advertise the requested codec — the caller should pick `identity`
 * via `chooseEncoding()` rather than catching here.
 */
export function compressStream(
  body: ReadableStream<Uint8Array>,
  encoding: Encoding,
): ReadableStream<Uint8Array> {
  if (encoding === 'identity') return body;
  // CompressionStream's TS lib types accept 'gzip' | 'deflate' | 'deflate-raw'.
  // 'br' is shipped in the Web Standards Cross-Realm proposal and is supported
  // by Node 21+ / Cloudflare Workers / Edge runtimes, but TS doesn't know yet.
  const cs = new (CompressionStream as unknown as new (f: string) => GenericTransform)(encoding);
  return body.pipeThrough(cs as unknown as TransformStream<Uint8Array, Uint8Array>);
}

/**
 * Compress a pre-buffered string body. Returns the original bytes when
 * `encoding === 'identity'`.
 */
export async function compressBuffer(
  body: string | Uint8Array,
  encoding: Encoding,
): Promise<Uint8Array> {
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body;
  if (encoding === 'identity') return bytes;
  const stream = new ReadableStream<Uint8Array>({
    start(c) { c.enqueue(bytes); c.close(); },
  });
  const piped = compressStream(stream, encoding);
  const reader = piped.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) { chunks.push(value); total += value.byteLength; }
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.byteLength; }
  return out;
}

interface AcceptEnc { token: string; q: number; }

function parseAcceptEncoding(header: string): AcceptEnc[] {
  const out: AcceptEnc[] = [];
  for (const raw of header.split(',')) {
    const parts = raw.trim().split(';').map((p) => p.trim());
    const token = (parts.shift() ?? '').toLowerCase();
    if (!token) continue;
    let q = 1;
    for (const p of parts) {
      const m = p.match(/^q=([0-9]*\.?[0-9]+)$/i);
      if (m) q = Math.max(0, Math.min(1, parseFloat(m[1]!)));
    }
    out.push({ token, q });
  }
  return out;
}

// Minimal structural shape for the optional 'br' overload — TypeScript's lib
// types only know 'gzip' | 'deflate' | 'deflate-raw' for CompressionStream.
interface GenericTransform {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
}

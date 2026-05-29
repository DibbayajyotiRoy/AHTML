# Edge runtime

*v0.7.0+. AHTML's hot path runs on every Web-Standards runtime —
Cloudflare Workers, Vercel Edge, Bun, Deno, AWS Lambda@Edge — with no
runtime-conditional imports.*

The TypeScript core (`@ahtmljs/schema`, `@ahtmljs/agent`, the route
helpers in `@ahtmljs/next` and `@ahtmljs/vite`) imports from exactly
two places:

- TypeScript built-ins (`String`, `Array`, `Map`, `Promise`, …)
- Web Standards available in every modern runtime
  (`Request`, `Response`, `Headers`, `ReadableStream`, `TextEncoder`,
  `TextDecoder`, `AbortController`, `CompressionStream`, `fetch`)

No `node:crypto`, no `node:zlib`, no `node:fs`, no `node:buffer`. The
same package serves Node 20+ and Cloudflare Workers from the same dist.

## Cloudflare Workers

```ts
// worker.ts
import { snapshot, toCompact, computeEtag } from '@ahtmljs/schema';

export default {
  async fetch(req: Request): Promise<Response> {
    const snap = snapshot(req.url, 'product_detail')
      .add({ id: 'product:demo', type: 'product', name: 'Demo' })
      .build();
    return new Response(toCompact(snap), {
      headers: {
        'content-type': 'application/ahtml+text',
        etag: computeEtag(snap),
        'cache-control': 'public, max-age=300',
      },
    });
  },
};
```

```toml
# wrangler.toml
name = "ahtml-demo"
main = "worker.ts"
compatibility_date = "2026-05-01"
```

The Next.js handler (`@ahtmljs/next`) works as-is under
`export const runtime = 'edge'`:

```ts
// app/ahtml/[...path]/route.ts
import { createAHTMLRoute } from '@ahtmljs/next/handler';
import { buildSnapshot } from '../../lib/ahtml';

export const runtime = 'edge';
export const { GET, HEAD } = createAHTMLRoute(buildSnapshot);
```

## Vercel Edge

Same as Cloudflare — set `runtime: 'edge'` on the route module. No
code changes.

## Bun / Deno

`@ahtmljs/*` is ESM-only and uses Web Standards exclusively, so
`bun add @ahtmljs/schema` works without any compatibility shims.
`Deno.serve(req => …)` consumes the same helpers.

## What lives in-process per replica

By default, two things are in-memory only:

- The `AHTMLClient` snapshot cache (a bounded `Map`, default 1000 entries).
- The route-handler diff cache and rate-limit token bucket.

This is fine for single-process deployments. For multi-replica setups
where you need consistent cache hit rates or correct rate limits across
nodes, swap in a shared `KvStore` / `CacheStore`:

```ts
import { AHTMLClient, type CacheStore, type CachedSnapshot } from '@ahtmljs/agent';

const cfStore: CacheStore<CachedSnapshot> = {
  async get(k)        { const v = await env.AHTML_KV.get(k, 'json'); return v ?? undefined; },
  async set(k, v)     { await env.AHTML_KV.put(k, JSON.stringify(v)); },
  async delete(k)     { await env.AHTML_KV.delete(k); },
  async clear()       { /* Cloudflare KV has no clear — use a key prefix + bulk delete */ },
};

const client = new AHTMLClient({ cache: cfStore });
```

The `CacheStore<T>` and `KvStore` interfaces are exported from
`@ahtmljs/schema`; the `@ahtmljs/kv` package (planned for v0.7.x) will
ship pre-built adapters for Upstash, Cloudflare KV, and Workers KV.

## Constraint surface

| Capability | Standards-mode | Notes |
|---|---|---|
| Hash / etag | `djb2(JSON.stringify(...))` pure-JS | No `node:crypto` import |
| Compression | `CompressionStream('gzip' \| 'br' \| 'deflate')` | Web Standard; Node 18+, Workers, Edge |
| Decompression | Transparent via `fetch()`; manual via `DecompressionStream` | Web Standard |
| Streaming | `ReadableStream` + `AsyncIterable` | Web Standard |
| Timeouts | `AbortController` + `setTimeout` | Web Standard |
| Crypto signatures (v0.8+) | `crypto.subtle` | Web Standard |

If you hit a runtime where any of the above is missing, that's a bug —
file an issue with the runtime name + version.

## Cold-start budget

The package weight (`@ahtmljs/schema` ~37 kB unpacked, the agent
~12 kB, the next handler ~8 kB) keeps cold starts cheap.

A Cloudflare Worker importing `@ahtmljs/schema` and serving a 100-entity
snapshot bench-marks at < 50ms p50 from cold (Cloudflare regions, May 2026).
That budget is the v0.7.0 commitment in [`PLAN-NEXT-5.md`](../PLAN-NEXT-5.md).

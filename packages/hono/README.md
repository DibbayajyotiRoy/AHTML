# @ahtmljs/hono

AHTML adapter for [Hono](https://hono.dev). Mounts the full AHTML surface on any Hono app — the snapshot endpoint, the well-known manifest, the MCP and OpenAPI emitters, and `llms.txt` — with one function call.

Runs on every runtime Hono targets:

- Node.js (>=20)
- Bun
- Deno
- Cloudflare Workers
- AWS Lambda / Lambda@Edge
- Vercel Edge / Netlify Edge

Edge-first: no `node:*` imports in the hot path. Everything uses Web Standards (`fetch`, `crypto.subtle`, `ReadableStream`).

## Install

```bash
npm install @ahtmljs/hono @ahtmljs/schema hono
```

`hono` is an optional peer dependency so the package can be type-checked and imported in environments without Hono installed; you only need it where the adapter is actually used.

## Quickstart — Cloudflare Workers

```ts
import { Hono } from 'hono';
import { mountAHTML } from '@ahtmljs/hono';
import { snapshot } from '@ahtmljs/schema';

const app = new Hono();

mountAHTML(app, {
  site: 'https://shop.example.com',
  policy: {
    agents_welcome: true,
    license: 'CC-BY-4.0',
    rate_limit: '100/min',
    contact: 'agents@example.com',
  },
  default_ttl: 60,
  routes: [
    { path: '/', page_type: 'home' },
    { path: '/p/demo', page_type: 'product_detail' },
  ],
  async snapshotBuilder(segments, req) {
    if (segments[0] === 'p') {
      return snapshot(req.url, 'product_detail')
        .add({
          id: 'product:demo',
          type: 'product',
          name: 'Demo',
          price: { amount: 19, currency: 'USD' },
        })
        .build();
    }
    return snapshot(req.url, 'home').build();
  },
});

export default app;
```

Deploy with `wrangler deploy` and you are live on the agent web.

## Routes mounted

| Method  | Path                          | Description                                                     |
|---------|-------------------------------|-----------------------------------------------------------------|
| GET     | `/ahtml/*`                    | Snapshot for the path; honors `Accept`, `If-None-Match`, `?since` |
| HEAD    | `/ahtml/*`                    | Mirrors GET headers with an empty body                          |
| GET     | `/.well-known/ahtml.json`     | Well-known manifest (site, policy, routes, emitter URLs)        |
| GET     | `/ahtml/mcp.json`             | MCP tool catalog (set `emit_mcp: false` to disable)             |
| GET     | `/ahtml/openapi.json`         | OpenAPI document (set `emit_openapi: false` to disable)         |
| GET     | `/llms.txt`                   | Plaintext routes catalog for LLM crawlers                       |

## Config

```ts
interface AHTMLHonoConfig {
  site: string;
  policy?: Policy;
  default_ttl?: number;
  routes?: Array<{ path: string; page_type: string }>;
  emit_mcp?: boolean;
  emit_openapi?: boolean;
  snapshotBuilder: (segments: string[], req: Request) =>
    Promise<Snapshot | null> | Snapshot | null;
  getAllSnapshots?: () => Snapshot[] | Promise<Snapshot[]>;
  stream?: boolean | number;
}
```

`stream: true` always emits NDJSON; `stream: 100` streams when `entities.length + actions.length >= 100`. Clients can also opt-in via `Accept: application/ahtml+json-seq`.

## Content negotiation

The snapshot endpoint negotiates by `Accept`:

- `application/ahtml+json` → canonical JSON
- `application/ahtml+text` → token-optimal compact text (default)
- `application/ahtml+json-seq` → NDJSON stream

It also supports `Accept-Encoding: gzip, br` and emits weak ETags + `Cache-Control` + `Last-Modified` + `Vary` headers, plus a 304 path on `If-None-Match` and a diff path on `?since=<etag>`.

## License

MIT — Dibbayajyoti Roy

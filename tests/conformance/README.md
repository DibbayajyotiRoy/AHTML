# Adapter conformance suite

One set of wire-behavior assertions, run against all three framework
adapters — `@ahtmljs/next`, `@ahtmljs/vite`, `@ahtmljs/hono` — stood up with
the **same fixture** (same site, policy, routes, snapshot builder).

```
npm run test:conformance     # from the repo root
```

The suite imports the adapters **from their built `dist/` via package names**
(workspace symlinks), so it tests what ships. If you change an adapter's
source, rebuild the package (`npm run build -w packages/<name>`) before
re-running.

## Files

| File | Purpose |
| --- | --- |
| `harness.ts` | Shared fixture + the common `fetchish(path, { headers }) → { status, headers, body, text }` interface, with one factory per adapter (`makeNextAdapter`, `makeViteAdapter`, `makeHonoAdapter`). |
| `conformance.test.ts` | Behavior matrix: every wire behavior asserted per adapter. |
| `equality.test.ts` | Cross-adapter **byte-equality** of emitter-derived bodies (well-known, mcp.json, openapi.json, llms.txt) plus the snapshot bodies and ETags. |

## Fixture

- Site `https://conformance.example.com`, policy `{ agents_welcome, rate_limit, license, contact }`, `default_ttl: 60`.
- Routes: `/` (home), `/p/demo` (product + a full `purchase` action: cost, reversibility, side effects, confirmation, input schema), `/docs/guide` (document) — exercising products, documents, and actions.
- `/ahtml/counter` changes content on every build (per-adapter counter) so the `?since=<etag>` diff path deterministically returns a non-empty change list.
- `fetched_at` is pinned (`2026-01-01T00:00:00.000Z`) and snapshot URLs are canonical (`site + page path`, independent of the transport request), which is what makes cross-adapter byte-equality possible.

How each adapter is invoked (mirrors its own test suite):

- **next** — `createAHTMLRoute().GET(Request, { params })` for snapshots; `createWellKnownRoute` / `createMcpRoute` / `createOpenApiRoute` / `createLlmsTxtRoute` for the emitter endpoints (in a real app those are separate route files, matched before the `[...path]` catch-all).
- **vite** — the plugin's connect middleware captured from `configureServer`, driven with mock `req`/`res`.
- **hono** — `mountAHTML` onto a Hono-shaped router; handlers invoked with `{ req: { raw: Request } }`. The real `hono` package is not a repo dependency, so the harness dispatches the way `packages/hono/src/__tests__/hono.test.ts` does: exact path first, then the `/ahtml/*` wildcard (see caveat below).

## Conformance matrix

| Behavior | next | vite | hono |
| --- | --- | --- | --- |
| `/.well-known/ahtml.json` manifest | pass | pass | pass |
| Snapshot: compact default | pass | pass | pass |
| Snapshot: JSON via `Accept` | pass | pass | pass |
| `Accept` q-values | pass | pass | pass |
| ETag / Cache-Control / Last-Modified / Vary / x-ahtml-version | pass | pass | pass |
| Conditional GET → 304 | pass | pass | pass |
| 404 on unknown path | pass | pass | pass |
| Diff `?since=` (changed → `ahtml-diff+json`) | pass | pass | pass |
| Diff `?since=` (unchanged → 304) | pass | pass | pass |
| NDJSON streaming (`ahtml+json-seq`) | pass | **skip** (1) | pass |
| `Accept-Encoding: gzip` | pass | **skip** (1) | pass |
| `Accept-Encoding: br` | **skip** (2) | **skip** (1) | **skip** (2) |
| Identity (no encoding offered) | pass | pass | pass |
| Policy 403 (`agents_welcome: false`) | pass | pass | pass |
| `/ahtml/mcp.json` valid + carries fixture tool | pass | pass | pass |
| `/ahtml/openapi.json` valid 3.1 | pass | pass | pass |
| `/llms.txt` markdown | pass | pass | pass |

### Documented skips

1. **Vite: NDJSON streaming and content-encoding were never supported.**
   Proven by `packages/vite/src/__tests__/plugin.test.ts` (no streaming or
   encoding tests exist) and the plugin source (it never imports
   `toStreamResponse` / `compressBuffer` / `chooseEncoding` from
   `@ahtmljs/schema`; the response is always a buffered, identity-encoded
   string). The suite skips these two features for vite only; if the plugin
   gains them, delete `'stream'` / `'content-encoding'` from the vite
   adapter's `unsupported` set in `harness.ts` and the tests activate.
2. **Brotli on this runtime.** Node ≤ 22's `CompressionStream` cannot produce
   `br` (`runtimeSupportsBrotli()` feature-detects). The br test runs
   automatically on runtimes that support it (Node ≥ 23, workerd, Deno).

## Byte-equality

For identical config + warm caches, all three adapters must emit identical
bytes for `/.well-known/ahtml.json`, `/ahtml/mcp.json`, `/ahtml/openapi.json`,
`/llms.txt`, the snapshot bodies (compact and JSON), and the ETag.

- The **only normalized field** is `generated_at` (a per-request ISO
  timestamp in the well-known manifest). Nothing else is normalized — base
  URLs are identical by construction because every adapter is configured
  with the same `site` and receives requests on that origin.
- The vite adapter (and only it) emits MCP/OpenAPI **lazily from its
  snapshot cache**, so the harness `warm()` helper fetches every declared
  route first, in route order, on all adapters alike.
- Status at v0.9.1: **all equality tests pass** — the vite emitter
  consolidation onto `@ahtmljs/schema` landed concurrently with this suite
  and its dist was rebuilt; the `vite ↔ next` assertions are the proof.

## Caveats for integrators

- **Hono route shadowing (needs verification against real Hono).**
  `mountAHTML` registers `GET /ahtml/*` *before* `GET /ahtml/mcp.json` and
  `GET /ahtml/openapi.json`. Real Hono composes matching routes in
  registration order and stops at the first handler that returns a
  `Response`, so on a real `Hono` app the wildcard snapshot handler may
  shadow the two catalog endpoints (the snapshot builder would receive
  `['mcp.json']`). The package's own tests — and therefore this harness —
  dispatch exact-path-first and don't exercise that ordering. Verify with
  `app.request('/ahtml/mcp.json')` on the real `hono` package.
- **`Accept-Encoding: br` on Node ≤ 22.** `chooseEncoding` in
  `@ahtmljs/schema` advertises `br` unconditionally, but
  `CompressionStream('br')` throws on Node ≤ 22 — a client sending
  `Accept-Encoding: br` to the next/hono adapters on those runtimes hits an
  unhandled throw (500) instead of a gzip/identity fallback.
- The vite middleware passes non-AHTML paths to `next()`; the harness
  surfaces that as status `599` so a mis-routed conformance request fails
  loudly rather than silently asserting against an empty response.

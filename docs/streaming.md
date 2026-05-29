# Streaming snapshots

*v0.7.0+. Stream snapshots record-by-record so peak memory stays bounded
by per-entity working set rather than the full payload.*

The default `application/ahtml+text` and `application/ahtml+json` paths
fully buffer the snapshot before responding. Fine for a product page,
expensive for a 10,000-entity dataset. The streaming format —
`application/ahtml+json-seq` — emits the snapshot as line-delimited JSON
records so the server starts writing before the snapshot is fully
materialized, and the client starts processing before the response ends.

## Wire format

```
{"kind":"envelope","envelope":{"ahtml":"0.1","url":"...","page_type":"dataset",...}}
{"kind":"entity","entity":{"id":"product:p-0","type":"product",...}}
{"kind":"entity","entity":{"id":"product:p-1","type":"product",...}}
...
{"kind":"action","action":{"id":"checkout","target":"product:p-0"}}
{"kind":"end","etag":"W/\"abc\""}
```

- One record per line.
- Envelope always first; end sentinel always last (lets the consumer
  distinguish a graceful close from a network cut).
- `kind: 'entity' | 'action' | 'envelope' | 'end'`.

Content-Type: `application/ahtml+json-seq`. Transfer-Encoding: `chunked`.

## Server side — opt into streaming

```ts
// app/ahtml/[...path]/route.ts
import { createAHTMLRoute } from '@ahtmljs/next/handler';
import { buildSnapshot } from '../../lib/ahtml';

export const { GET, HEAD } = createAHTMLRoute(buildSnapshot, undefined, {
  // 'true'   → always stream
  // a number → stream when entities.length + actions.length >= threshold
  // 'false'  (default) → never stream
  stream: 50,
});
```

A client can also force streaming by sending `Accept: application/ahtml+json-seq`
even when the route doesn't opt in — handy when you control both sides
and just want lower client peak memory.

## Client side — three reader shapes

### Stream every record

```ts
const client = new AHTMLClient();

for await (const r of client.streamSnapshot('https://shop.com/datasets/sales')) {
  switch (r.kind) {
    case 'envelope': initUI(r.envelope); break;
    case 'entity':   appendRow(r.entity); break;
    case 'action':   bindCta(r.action); break;
    case 'end':      cacheEtag(r.etag); break;
  }
}
```

### Stream only entities (the common case)

```ts
for await (const entity of client.streamEntities('https://shop.com/datasets/sales')) {
  if (entity.type === 'product') indexInVectorDB(entity);
}
```

### Stream only actions

```ts
for await (const action of client.streamActions('https://shop.com/checkout')) {
  registerAction(action);
}
```

### Materialize the full snapshot (rare)

If you wanted streaming for the *server-side* memory win but the client
can afford to buffer:

```ts
import { fromStream } from '@ahtmljs/schema';

const res = await fetch('https://shop.com/big', {
  headers: { accept: 'application/ahtml+json-seq' },
});
const snap = await fromStream(res.body!);
```

## Short-circuiting

The whole point of streaming is to stop early. `break`-ing out of the
loop tears down the underlying `ReadableStream` (the iteration cancels
the reader). No special cleanup needed:

```ts
let count = 0;
for await (const e of client.streamEntities(url)) {
  if (++count >= 100) break; // server keeps no extra state — just close
  process(e);
}
```

## What about caching?

`streamSnapshot()` does **not** populate the client's snapshot cache.
The iteration is the consumption — there's no buffered `Snapshot`
object to cache. Call `client.fetch(url)` if you also want the cache to
warm up. (Mixing modes against the same URL is fine; cache reads still
work on the next `fetch`.)

## Compression composes cleanly

The streaming response goes through the same `Accept-Encoding` /
`Content-Encoding` negotiation as the buffered paths. Send
`Accept-Encoding: br` and the server pipes the NDJSON stream through
`CompressionStream('br')`; the client's `fetch()` decompresses
transparently, so the `AsyncIterable` consumer sees plain JSON records.

See [`docs/edge.md`](./edge.md) for the runtime constraint surface.

## Errors

Streaming errors surface as typed `AHTMLError`s with a useful `cause`:

| Code | Trigger |
|---|---|
| `JSON_PARSE` | A record on the wire wasn't valid JSON |
| `COMPACT_PARSE` | Stream ended without an envelope record |
| `HTTP_STATUS` | Server returned non-stream content-type |
| `NETWORK` | Response body was absent |

See [`docs/errors.md`](./errors.md) for the full taxonomy.

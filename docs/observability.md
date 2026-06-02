# Observability

*v0.9.0+. AHTML emits OpenTelemetry trace spans from both the route
handler and the client SDK so adopters can pipe the full request graph
through their existing OTel collector.*

## Why tracing belongs in AHTML

In a single-page deployment, a handler that returns the wrong bytes is
trivially debuggable: open the browser, watch the network tab, read
the error. Once AHTML is in production behind a CDN, the picture
changes. A snapshot is built by a publisher, possibly cached at the
edge, fetched by an agent runtime, possibly cached again client-side,
then either returned intact or merged with a diff. By the time the
extractor downstream sees a wrong price, the original cause is six
layers deep.

OpenTelemetry traces collapse those layers into one timeline. v0.9.0
adds first-class span emission to the two surfaces that matter — the
publisher's HTTP handler and the consumer's `AHTMLClient` — and
attaches the URL, format, cache-hit decision, and cache key as span
attributes. The trace context flows end-to-end: a span started in
the agent runtime appears as the parent of the publisher's
`ahtml.serve_snapshot` span, with no glue code in between.

Tracing in v0.9.0 is **traces only**. Metrics and logs land alongside
in v1.x (see roadmap below).

## Activation

AHTML never hard-depends on `@opentelemetry/api`. The package is
auto-detected at runtime: if a compatible tracer provider is
registered, AHTML emits spans; if not, it is a no-op.

Install the API and an exporter of your choice:

```bash
npm install @opentelemetry/api
npm install @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-http
```

The first import of the API into the process is enough. The route
handler and the client both call a memoized loader that imports
`@opentelemetry/api` exactly once per process lifetime; subsequent
spans cost one `undefined` check.

If you uninstall `@opentelemetry/api`, nothing else needs to change.
AHTML's behavior reverts to the v0.8.x baseline of zero tracing
overhead.

## Spans emitted

### Publisher side (`@ahtmljs/next`, `@ahtmljs/vite`, `@ahtmljs/hono`)

| Span name | Wraps | Notes |
|---|---|---|
| `ahtml.serve_snapshot` | The route handler's `GET()` body | Root of the publisher trace; status is set from the outgoing `Response.status` |
| `ahtml.enforce_policy` | The policy check before delegating to the user's builder | Records `policy.action` and the decision; errors here become `POLICY_DENIED` |
| `ahtml.build_snapshot` | The user-supplied snapshot builder callback | Wall-clock cost of producing the snapshot, excluding I/O around it |

### Consumer side (`@ahtmljs/agent`)

| Span name | Wraps | Notes |
|---|---|---|
| `ahtml.client.fetch` | `AHTMLClient.fetch(url, opts)` end-to-end | Includes coalescing, retry, decompression, and diff application |
| `ahtml.client.verify` | `verifySnapshot(...)` calls (reserved for v0.9.x) | Records `kid`, algorithm, and result without exposing the snapshot bytes |

Spans nest naturally — `ahtml.serve_snapshot` parents both
`ahtml.enforce_policy` and `ahtml.build_snapshot`; on the client,
`ahtml.client.fetch` parents any verify span emitted for that
response.

## Attributes

Every AHTML span carries a stable set of attributes, all under the
`ahtml.*` prefix to keep them visually grouped in any OTel UI:

| Attribute | Type | Where | Meaning |
|---|---|---|---|
| `ahtml.url` | string | both sides | The fully-qualified request URL |
| `ahtml.format` | `"compact"` \| `"json"` | both sides | Negotiated wire format |
| `ahtml.method` | string | server | HTTP method (`GET`, `HEAD`) |
| `ahtml.cache_hit` | boolean | both sides | Whether the response came from cache |
| `ahtml.cache_key` | string | both sides | The cache key, useful for grepping a poisoned entry |
| `ahtml.diff_applied` | boolean | client | True when a delta was merged onto a cached base |
| `ahtml.snapshot.entities` | number | server | Entity count of the produced snapshot |
| `ahtml.snapshot.kind` | string | server | Snapshot kind (`product_detail`, `article`, …) |

Errors are recorded with the standard OTel `recordException()` and
the span status is set to `ERROR`. The thrown `AHTMLError`'s `code`
is attached as the attribute `ahtml.error.code` so dashboards can
group on it without parsing messages.

## Node.js setup

```ts
// instrumentation.ts — run this before importing anything from AHTML
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'ahtml-publisher',
  }),
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318/v1/traces',
  }),
});

sdk.start();
```

This works unmodified against Jaeger (`http://localhost:4318`),
Tempo, Honeycomb, Datadog (via the OTel collector), New Relic, or any
OTLP-HTTP receiver. The same SDK setup covers both the route handler
and any in-process `AHTMLClient` instances; spans share the
ambient context provider.

## Cloudflare Workers setup

Workers cannot use the Node SDK. Use the Web SDK plus an OTLP
exporter that ships its batch over `fetch()`:

```ts
// worker.ts
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { createAHTMLRoute } from '@ahtmljs/hono';
import { buildSnapshot } from './lib/ahtml';

const provider = new WebTracerProvider();
provider.addSpanProcessor(
  new SimpleSpanProcessor(
    new OTLPTraceExporter({ url: 'https://otel-collector.example/v1/traces' }),
  ),
);
provider.register();

export default {
  fetch: createAHTMLRoute(buildSnapshot),
};
```

`SimpleSpanProcessor` is appropriate at the edge because the Worker
isolate may be torn down before a batched processor flushes. For
higher-volume publishers, front the collector with a queue and use
`BatchSpanProcessor` with a low `scheduledDelayMillis`.

## Reading a trace end-to-end

A typical agent request flowing through a tracing-enabled deployment
produces a span tree shaped like this:

```
ahtml.client.fetch                         (agent runtime, 42ms)
  ahtml.serve_snapshot                     (publisher, 31ms)
    ahtml.enforce_policy                   (publisher, 2ms)
    ahtml.build_snapshot                   (publisher, 24ms)
  ahtml.client.verify                      (agent runtime, 3ms)
```

The client span and the server span are linked through standard W3C
`traceparent` headers. AHTML's client adds the header automatically
when a tracer is active; the route handler reads it and continues the
trace.

## Performance cost

The cost of tracing in AHTML is structured to be invisible when off
and proportional when on:

- **No `@opentelemetry/api` installed**: zero overhead. The dynamic
  import resolves to `undefined` once at process startup and is
  cached. Every span call site is one `if (!api) return cb();`.
- **API installed, no provider registered**: a few nanoseconds per
  span — the API returns a no-op tracer.
- **Provider registered**: ordinary OTel cost (one object allocation
  per span, attributes set lazily). AHTML never measures wall time
  itself; it lets the SDK do it.

There is no startup penalty. There is no synchronous filesystem
access. There is no global mutation outside the OTel API's own
registration.

## Privacy

AHTML never attaches snapshot **contents** to spans. The URL, kind,
entity count, and cache key are recorded; entity payloads, signatures,
and bearer tokens are not. This keeps trace exporters safe to point
at third-party SaaS without leaking the data you're contracting on.

If you need richer per-entity attributes (for example, to debug a
specific extraction in staging), wrap the call site in your own span
and attach attributes there.

## Roadmap

v0.9.0 ships **traces only**. The plan for v1.x:

- **Metrics**: counters for cache hit / miss, diff apply / reject,
  signature verify success / fail; histograms for fetch latency and
  snapshot size, exported via `@opentelemetry/api-metrics`.
- **Logs**: structured event log bridged through the existing
  `onEvent` hook into the OTel Logs Bridge API, so a single
  collector receives all three signals.
- **Span links**: when a diff is applied, the client span will link
  to the original full-snapshot span so cross-request causality
  shows up in trace UIs.

Until then, the [errors guide](./errors.md) describes the `onEvent`
hook for non-OTel logging, and the [edge guide](./edge.md) covers the
runtime constraints any tracing setup must respect.

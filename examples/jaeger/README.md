# AHTML × Jaeger demo

A minimal end-to-end OpenTelemetry demo: an AHTML snapshot endpoint served
by `@ahtmljs/hono`, with every `ahtml.*` span exported over OTLP/HTTP to a
local [Jaeger](https://www.jaegertracing.io/) all-in-one.

## Run it

1. Start Jaeger (UI on `16686`, OTLP/HTTP ingest on `4318`):

   ```sh
   docker run --rm -p 16686:16686 -p 4318:4318 jaegertracing/all-in-one:latest
   ```

2. Start the demo server (from this directory; run `npm install` first if
   you haven't installed the monorepo workspaces):

   ```sh
   npm start
   ```

## Generate some traces

```sh
# Full snapshot — note the ETag response header.
curl -i http://localhost:3000/ahtml/p/demo

# Diff request — replace <etag> with the value from the previous response.
curl -i 'http://localhost:3000/ahtml/p/demo?since=<etag>'
```

## What to expect in the UI

Open <http://localhost:16686>, pick the **ahtml-jaeger-demo** service, and
click *Find Traces*. Each `/ahtml/*` request produces one trace:

```
ahtml.serve_snapshot          the whole request
├── ahtml.enforce_policy      agents_welcome / rate-limit check
├── ahtml.build_snapshot      your snapshotBuilder
│   ├── ahtml.validate        schema validation (traced sync via traceSync)
│   └── ahtml.lint            snapshot quality linting
└── ahtml.serve_diff          only on ?since=<etag> requests
```

Spans carry `ahtml.url` (and `ahtml.since` on diffs) as attributes. If you
sign snapshots, `verifySnapshot()` / `verifySnapshotStrict()` additionally
emit `ahtml.verify_signature` spans.

All of this is opt-in: `@opentelemetry/api` is an optional peer dependency
of `@ahtmljs/schema` — apps that don't install it pay nothing and see no
spans.

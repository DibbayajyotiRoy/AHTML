/**
 * AHTML × OpenTelemetry × Jaeger demo.
 *
 * Starts a NodeSDK that exports spans over OTLP/HTTP to a local Jaeger
 * all-in-one (see ../README.md), then serves a tiny AHTML snapshot via
 * the Hono adapter. Every request to /ahtml/* produces a trace:
 *
 *   ahtml.serve_snapshot
 *   ├── ahtml.enforce_policy
 *   ├── ahtml.build_snapshot
 *   │   ├── ahtml.validate
 *   │   └── ahtml.lint
 *   └── ahtml.serve_diff        (only on ?since=<etag> requests)
 *
 * Note on ordering: `@ahtmljs/schema` loads `@opentelemetry/api` lazily
 * at the first traced call (request time), so starting the SDK here —
 * before the server accepts its first request — is early enough.
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { mountAHTML } from '@ahtmljs/hono';
import { snapshot, validate, lint } from '@ahtmljs/schema';

const sdk = new NodeSDK({
  serviceName: 'ahtml-jaeger-demo',
  traceExporter: new OTLPTraceExporter({
    // Jaeger all-in-one's OTLP/HTTP ingest endpoint.
    url: 'http://localhost:4318/v1/traces',
  }),
});
sdk.start();

const app = new Hono();

mountAHTML(app, {
  site: 'http://localhost:3000',
  policy: { agents_welcome: true, contact: 'mailto:dev@example.com' },
  routes: [{ path: '/p/demo', page_type: 'product_detail' }],
  snapshotBuilder(_segments, req) {
    const snap = snapshot(req.url, 'product_detail')
      .ttl(60)
      .add({
        id: 'product:demo',
        type: 'product',
        name: 'Demo Widget',
        description: 'A widget that exists so its spans can be admired.',
        price: { amount: 19.99, currency: 'USD' },
        stock: { status: 'in_stock', quantity: 7 },
      })
      .build();
    // Traced schema APIs — show up as children of ahtml.build_snapshot.
    validate(snap);
    lint(snap);
    return snap;
  },
});

serve({ fetch: app.fetch, port: 3000 }, (info) => {
  console.log(`AHTML demo listening on http://localhost:${info.port}`);
  console.log('Try:   curl -i http://localhost:3000/ahtml/p/demo');
  console.log('Diff:  curl -i "http://localhost:3000/ahtml/p/demo?since=<etag-from-above>"');
  console.log('Then open Jaeger at http://localhost:16686 (service: ahtml-jaeger-demo)');
});

// Flush buffered spans before exiting.
process.on('SIGINT', () => {
  void sdk.shutdown().finally(() => process.exit(0));
});

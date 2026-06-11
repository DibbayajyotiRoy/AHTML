/**
 * Adapter conformance suite — one set of wire-behavior assertions, run
 * against all three framework adapters (@ahtmljs/next, @ahtmljs/vite,
 * @ahtmljs/hono) stood up with the SAME fixture.
 *
 * Behaviors covered (the v0.9 wire surface):
 *   - /.well-known/ahtml.json manifest
 *   - snapshot endpoint: compact default + JSON via Accept (incl. q-values)
 *   - caching headers: ETag / Cache-Control / Last-Modified / Vary / x-ahtml-version
 *   - conditional GET (If-None-Match → 304)
 *   - diff via ?since=<etag> (changed → ahtml-diff+json, unchanged → 304)
 *   - NDJSON streaming (application/ahtml+json-seq)
 *   - Accept-Encoding negotiation (gzip / br / identity)
 *   - policy enforcement (agents_welcome: false → 403)
 *   - /ahtml/mcp.json + /ahtml/openapi.json JSON validity
 *   - /llms.txt
 *   - 404 for paths the builder rejects
 *
 * Skips are limited to features an adapter provably never supported — see
 * tests/conformance/README.md for the documented list.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync, brotliDecompressSync } from 'node:zlib';
import { STREAM_CONTENT_TYPE, fromStream } from '@ahtmljs/schema';
import {
  SITE,
  ROUTES,
  FETCHED_AT,
  DEFAULT_TTL,
  allAdapters,
  makeNextAdapter,
  makeViteAdapter,
  makeHonoAdapter,
  warm,
  runtimeSupportsBrotli,
  type AdapterUnderTest,
  type WireFeature,
} from './harness.ts';

const DENIED_FACTORIES = {
  next: makeNextAdapter,
  vite: makeViteAdapter,
  hono: makeHonoAdapter,
} as const;

function skipReason(adapter: AdapterUnderTest, feature: WireFeature): string | false {
  return adapter.unsupported.has(feature)
    ? `@ahtmljs/${adapter.name} has never supported ${feature} (see tests/conformance/README.md)`
    : false;
}

for (const adapter of allAdapters()) {
  describe(`conformance — @ahtmljs/${adapter.name}`, () => {
    // -----------------------------------------------------------------
    // /.well-known/ahtml.json
    // -----------------------------------------------------------------
    test('well-known manifest: 200, JSON, declares site + routes + policy', async () => {
      const res = await adapter.fetchish('/.well-known/ahtml.json');
      assert.equal(res.status, 200);
      assert.match(res.headers['content-type'] ?? '', /application\/json/);
      const m = JSON.parse(res.text);
      assert.equal(m.ahtml, '0.1');
      assert.equal(m.site, SITE);
      assert.ok(m.policy && m.policy.agents_welcome === true);
      assert.ok(Array.isArray(m.routes));
      assert.equal(m.routes.length, ROUTES.length);
      for (const r of m.routes) {
        assert.equal(typeof r.snapshot_url, 'string');
        assert.ok(r.snapshot_url.startsWith(`${SITE}/ahtml`));
      }
      assert.ok(m.snapshot_url_template.includes('{path}'));
    });

    // -----------------------------------------------------------------
    // Snapshot endpoint — content negotiation
    // -----------------------------------------------------------------
    test('snapshot: compact text by default (Accept missing)', async () => {
      const res = await adapter.fetchish('/ahtml/p/demo');
      assert.equal(res.status, 200);
      assert.match(res.headers['content-type'] ?? '', /application\/ahtml\+text/);
      assert.match(res.text, /^@ahtml 0\.1/m);
      assert.match(res.text, /^\[product:demo\]/m);
    });

    test('snapshot: JSON when Accept: application/ahtml+json', async () => {
      const res = await adapter.fetchish('/ahtml/p/demo', {
        headers: { accept: 'application/ahtml+json' },
      });
      assert.equal(res.status, 200);
      assert.match(res.headers['content-type'] ?? '', /application\/ahtml\+json/);
      const parsed = JSON.parse(res.text);
      assert.equal(parsed.ahtml, '0.1');
      assert.equal(parsed.entities[0].id, 'product:demo');
      assert.equal(parsed.actions[0].id, 'purchase');
    });

    test('snapshot: honors RFC 7231 q-values in Accept', async () => {
      const preferJson = await adapter.fetchish('/ahtml/p/demo', {
        headers: { accept: 'application/ahtml+text;q=0.1, application/ahtml+json;q=0.9' },
      });
      assert.match(preferJson.headers['content-type'] ?? '', /application\/ahtml\+json/);

      const preferText = await adapter.fetchish('/ahtml/p/demo', {
        headers: { accept: 'application/ahtml+json;q=0.1, application/ahtml+text;q=0.9' },
      });
      assert.match(preferText.headers['content-type'] ?? '', /application\/ahtml\+text/);
    });

    // -----------------------------------------------------------------
    // Caching headers + conditional GET
    // -----------------------------------------------------------------
    test('snapshot: ETag, Cache-Control, Last-Modified, x-ahtml-version, Vary', async () => {
      const res = await adapter.fetchish('/ahtml/p/demo');
      assert.match(res.headers['etag'] ?? '', /^W\/"/);
      assert.match(res.headers['cache-control'] ?? '', new RegExp(`max-age=${DEFAULT_TTL}`));
      assert.equal(res.headers['last-modified'], new Date(FETCHED_AT).toUTCString());
      assert.equal(res.headers['x-ahtml-version'], '0.1');
      assert.match(res.headers['vary'] ?? '', /Accept/);
    });

    test('snapshot: 304 with empty body when If-None-Match matches', async () => {
      const first = await adapter.fetchish('/ahtml/p/demo');
      const etag = first.headers['etag'];
      assert.ok(etag, 'first response must carry an ETag');
      const second = await adapter.fetchish('/ahtml/p/demo', {
        headers: { 'if-none-match': etag! },
      });
      assert.equal(second.status, 304);
      assert.equal(second.headers['etag'], etag);
      assert.equal(second.text.length, 0);
    });

    test('snapshot: 404 when the builder returns null', async () => {
      const res = await adapter.fetchish('/ahtml/unknown');
      assert.equal(res.status, 404);
    });

    // -----------------------------------------------------------------
    // Diff endpoint — ?since=<etag>
    // -----------------------------------------------------------------
    test('diff: ?since=<etag> with changed content returns a SnapshotDiff', async () => {
      // /ahtml/counter changes content on every build.
      const first = await adapter.fetchish('/ahtml/counter');
      assert.equal(first.status, 200);
      const etag = first.headers['etag']!;
      const res = await adapter.fetchish(`/ahtml/counter?since=${encodeURIComponent(etag)}`);
      assert.equal(res.status, 200);
      assert.match(res.headers['content-type'] ?? '', /application\/ahtml-diff\+json/);
      const d = JSON.parse(res.text);
      assert.equal(d.ahtml, '0.1');
      assert.equal(d.url, `${SITE}/counter`);
      assert.equal(d.from_etag, etag);
      assert.notEqual(d.to_etag, etag);
      assert.ok(Array.isArray(d.changes) && d.changes.length >= 1);
      const ops = new Set(['add', 'remove', 'update', 'add_action', 'remove_action']);
      for (const c of d.changes) assert.ok(ops.has(c.op), `unknown diff op ${c.op}`);
    });

    test('diff: ?since=<etag> with unchanged content returns 304', async () => {
      const first = await adapter.fetchish('/ahtml/p/demo');
      const etag = first.headers['etag']!;
      const res = await adapter.fetchish(`/ahtml/p/demo?since=${encodeURIComponent(etag)}`);
      assert.equal(res.status, 304);
      assert.equal(res.text.length, 0);
    });

    // -----------------------------------------------------------------
    // NDJSON streaming
    // -----------------------------------------------------------------
    test(
      'stream: Accept: application/ahtml+json-seq forces NDJSON framing',
      { skip: skipReason(adapter, 'stream') },
      async () => {
        const res = await adapter.fetchish('/ahtml/p/demo', {
          headers: { accept: STREAM_CONTENT_TYPE },
        });
        assert.equal(res.status, 200);
        assert.match(
          res.headers['content-type'] ?? '',
          new RegExp(STREAM_CONTENT_TYPE.replace(/[+]/g, '\\+')),
        );
        // NDJSON framing: every non-empty line is standalone JSON.
        const lines = res.text.split('\n').filter((l) => l.trim() !== '');
        assert.ok(lines.length >= 3, `expected ≥3 NDJSON records, got ${lines.length}`);
        for (const line of lines) JSON.parse(line);
        // The records reassemble into the same snapshot.
        const restored = await fromStream(res.text);
        assert.equal(restored.url, `${SITE}/p/demo`);
        assert.equal(restored.entities[0]!.id, 'product:demo');
        assert.equal(restored.actions[0]!.id, 'purchase');
      },
    );

    // -----------------------------------------------------------------
    // Accept-Encoding negotiation
    // -----------------------------------------------------------------
    test(
      'encoding: gzip body when client offers gzip',
      { skip: skipReason(adapter, 'content-encoding') },
      async () => {
        const res = await adapter.fetchish('/ahtml/p/demo', {
          headers: { 'accept-encoding': 'gzip' },
        });
        assert.equal(res.status, 200);
        assert.equal(res.headers['content-encoding'], 'gzip');
        assert.match(res.headers['vary'] ?? '', /Accept-Encoding/);
        const inflated = gunzipSync(Buffer.from(res.body)).toString('utf8');
        assert.match(inflated, /^@ahtml 0\.1/m);
        assert.match(inflated, /^\[product:demo\]/m);
      },
    );

    test(
      'encoding: br body when client offers br',
      {
        skip:
          skipReason(adapter, 'content-encoding') ||
          (!runtimeSupportsBrotli()
            ? `this runtime's CompressionStream cannot produce brotli (Node ≤22) — see README.md`
            : false),
      },
      async () => {
        const res = await adapter.fetchish('/ahtml/p/demo', {
          headers: { 'accept-encoding': 'br' },
        });
        assert.equal(res.status, 200);
        assert.equal(res.headers['content-encoding'], 'br');
        const inflated = brotliDecompressSync(Buffer.from(res.body)).toString('utf8');
        assert.match(inflated, /^@ahtml 0\.1/m);
      },
    );

    test('encoding: identity (no Content-Encoding) when client offers nothing', async () => {
      const res = await adapter.fetchish('/ahtml/p/demo');
      assert.equal(res.status, 200);
      assert.equal(res.headers['content-encoding'], undefined);
      assert.match(res.text, /^@ahtml 0\.1/m);
    });

    // -----------------------------------------------------------------
    // Policy enforcement
    // -----------------------------------------------------------------
    test('policy: 403 agents_not_welcome when agents_welcome is false', async () => {
      const denied = DENIED_FACTORIES[adapter.name]({ policy: { agents_welcome: false } });
      const res = await denied.fetchish('/ahtml/p/demo');
      assert.equal(res.status, 403);
      const body = JSON.parse(res.text);
      assert.equal(body.error, 'agents_not_welcome');
    });

    // -----------------------------------------------------------------
    // Emitter endpoints
    // -----------------------------------------------------------------
    test('mcp.json: 200, valid JSON, carries the fixture action as a tool', async () => {
      await warm(adapter); // the vite adapter emits MCP lazily from its snapshot cache
      const res = await adapter.fetchish('/ahtml/mcp.json');
      assert.equal(res.status, 200);
      assert.match(res.headers['content-type'] ?? '', /application\/json/);
      const m = JSON.parse(res.text);
      assert.ok(m.server, 'mcp.json must carry a server block');
      assert.ok(Array.isArray(m.tools));
      const tool = m.tools.find((t: { name: string }) => t.name === 'product_detail.purchase');
      assert.ok(tool, 'expected tool product_detail.purchase');
      assert.equal(tool.annotations?.execute_url, '/api/checkout');
    });

    test('openapi.json: 200, valid JSON, OpenAPI 3.1 with paths', async () => {
      await warm(adapter);
      const res = await adapter.fetchish('/ahtml/openapi.json');
      assert.equal(res.status, 200);
      assert.match(res.headers['content-type'] ?? '', /application\/json/);
      const doc = JSON.parse(res.text);
      assert.equal(doc.openapi, '3.1.0');
      assert.ok(doc.paths && typeof doc.paths === 'object');
      assert.ok(doc.paths['/api/checkout'], 'action execute_url must appear in paths');
    });

    test('llms.txt: 200, markdown, non-empty', async () => {
      const res = await adapter.fetchish('/llms.txt');
      assert.equal(res.status, 200);
      assert.match(res.headers['content-type'] ?? '', /text\/markdown/);
      assert.ok(res.text.length > 0);
      assert.match(res.text, /^# /m);
      assert.match(res.text, /\.well-known\/ahtml\.json/);
    });
  });
}

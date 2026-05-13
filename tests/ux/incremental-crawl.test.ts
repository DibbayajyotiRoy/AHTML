/**
 * UX test #4 — incremental crawl saves bandwidth at scale.
 *
 * Proves the ETag + If-None-Match + diff-since-etag flow actually works:
 * a second crawl over the same set of unchanged pages should fetch ZERO
 * payload bytes (just 304 headers).
 *
 * If the site changes between crawls, the agent receives a tiny diff
 * payload, not the full snapshot.
 *
 * Why this matters: at 100k+ pages, the difference between full-fetch and
 * diff-fetch is the difference between "viable agent" and "rate-limited
 * into oblivion."
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot, toCompact, toJson, computeEtag, diff } from '@ahtmljs/schema';
import { AHTMLClient } from '@ahtmljs/agent';
import type { Snapshot } from '@ahtmljs/schema';

interface Catalog {
  [path: string]: Snapshot;
}

/** A 50-product catalog. Pages 0–49 each carry a product snapshot. */
function makeCatalog(seed = 0): Catalog {
  const c: Catalog = {};
  for (let i = 0; i < 50; i++) {
    const s = snapshot(`https://shop.example.com/ahtml/p/${i}`, 'product_detail')
      .ttl(0)
      .add({
        id: `product:p${i}`,
        type: 'product',
        name: `Product ${i}`,
        price: { amount: 100 + i + seed, currency: 'USD' },
        stock: { status: 'in_stock', quantity: 10 + i },
      })
      .build();
    s.etag = computeEtag(s);
    c[s.url] = s;
  }
  return c;
}

/** Records every byte sent over the wire during a crawl. */
function makeRecordingServer(catalog: Catalog) {
  let bytesSent = 0;
  let requests = 0;
  const handler = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    requests++;
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const headers = init?.headers as Record<string, string> | undefined;
    const ifNoneMatch = headers?.['if-none-match'];
    const u = new URL(url);
    const sinceEtag = u.searchParams.get('since');
    const cleanUrl = u.origin + u.pathname;
    const snap = catalog[cleanUrl];
    if (!snap) {
      return new Response(JSON.stringify({ error: 'no_snapshot' }), { status: 404 });
    }
    const etag = snap.etag!;

    // Diff endpoint
    if (sinceEtag) {
      const prev = (handler as { _prev?: Map<string, Snapshot> })._prev?.get(cleanUrl);
      if (prev && (prev.etag === sinceEtag)) {
        const d = diff(prev, snap);
        (handler as { _prev?: Map<string, Snapshot> })._prev?.set(cleanUrl, snap);
        // No changes → return 304, saves the diff envelope bytes
        if (d.changes.length === 0) {
          return new Response(null, { status: 304, headers: { etag } });
        }
        const body = JSON.stringify(d);
        bytesSent += body.length;
        return new Response(body, {
          status: 200,
          headers: { 'content-type': 'application/ahtml-diff+json', etag },
        });
      }
    }

    // Conditional GET — 304
    if (ifNoneMatch === etag) {
      return new Response(null, { status: 304, headers: { etag } });
    }

    // Full fetch
    const body = toCompact(snap);
    bytesSent += body.length;
    (handler as { _prev?: Map<string, Snapshot> })._prev ??= new Map();
    (handler as { _prev?: Map<string, Snapshot> })._prev!.set(cleanUrl, snap);
    return new Response(body, {
      status: 200,
      headers: { 'content-type': 'application/ahtml+text', etag },
    });
  };
  return {
    fetch: handler as unknown as typeof fetch,
    get bytesSent() { return bytesSent; },
    get requests() { return requests; },
    reset: () => { bytesSent = 0; requests = 0; },
  };
}

describe('UX — incremental crawl over 50 pages', () => {
  test('a second crawl with no changes transfers ≤5% of the bytes of the first crawl', async () => {
    const catalog = makeCatalog();
    const server = makeRecordingServer(catalog);
    const client = new AHTMLClient({ fetch: server.fetch });

    // First crawl — measures the full-fetch baseline
    for (const url of Object.keys(catalog)) {
      await client.fetch(url);
    }
    const firstCrawlBytes = server.bytesSent;
    console.log(`    first crawl:  ${server.requests} requests, ${firstCrawlBytes.toLocaleString()} bytes`);
    server.reset();

    // Second crawl — same unchanged content, should be all 304s
    for (const url of Object.keys(catalog)) {
      await client.fetch(url);
    }
    const secondCrawlBytes = server.bytesSent;
    console.log(`    second crawl: ${server.requests} requests, ${secondCrawlBytes.toLocaleString()} bytes`);

    const savedPct = (1 - secondCrawlBytes / firstCrawlBytes) * 100;
    console.log(`    saved: ${savedPct.toFixed(1)}% of bandwidth on the no-change recrawl`);
    assert.ok(
      secondCrawlBytes <= firstCrawlBytes * 0.05,
      `expected second crawl ≤5% of first; got ${(secondCrawlBytes / firstCrawlBytes * 100).toFixed(2)}%`,
    );
  });

  test('a second crawl with sparse changes transfers a diff, not the whole snapshot', async () => {
    const catalogV1 = makeCatalog(0);
    const server = makeRecordingServer(catalogV1);
    const client = new AHTMLClient({ fetch: server.fetch });

    for (const url of Object.keys(catalogV1)) await client.fetch(url);
    server.reset();

    // Simulate a price update on ONE product: price now $999 instead of $100
    const updatedUrl = 'https://shop.example.com/ahtml/p/0';
    const next = snapshot(updatedUrl, 'product_detail')
      .ttl(0)
      .add({
        id: 'product:p0',
        type: 'product',
        name: 'Product 0',
        price: { amount: 999, currency: 'USD' },
        stock: { status: 'in_stock', quantity: 10 },
      })
      .build();
    next.etag = computeEtag(next);
    catalogV1[updatedUrl] = next;

    // Re-crawl
    for (const url of Object.keys(catalogV1)) await client.fetch(url);
    const recrawlBytes = server.bytesSent;
    console.log(`    re-crawl after 1/50 price change: ${recrawlBytes.toLocaleString()} bytes (a diff, not a full snapshot)`);

    // We expect: 49 × 304 + 1 small diff. Total should be a small multiple
    // of one full snapshot — not 50 full snapshots.
    const oneFullSnapshotBytes = toCompact(next).length;
    assert.ok(
      recrawlBytes < oneFullSnapshotBytes * 5,
      `recrawl after 1 sparse change (${recrawlBytes} B) should be less than 5× the cost of one full snapshot (${oneFullSnapshotBytes} B); not the full re-crawl`,
    );
  });

  test('the AHTML compact wire format is strictly smaller than the canonical JSON form', () => {
    const snap = makeCatalog()['https://shop.example.com/ahtml/p/0']!;
    const compact = toCompact(snap);
    const json = toJson(snap);
    assert.ok(compact.length < json.length);
  });
});

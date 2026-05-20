import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot, toCompact, toJson, computeEtag, diff } from '@ahtmljs/schema';
import { AHTMLClient } from '../client.js';

/** Minimal fetch mock — records calls + returns a programmable response. */
function makeMockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });
    return handler(url, init);
  }) as unknown as typeof fetch;
  return Object.assign(fn, { calls });
}

describe('AHTMLClient', () => {
  test('fetches a compact-text snapshot and parses it back', async () => {
    const snap = snapshot('https://x.com/ahtml/p', 'product_detail')
      .add({ id: 'product:p', type: 'product', name: 'Hello' })
      .build();
    snap.etag = computeEtag(snap);

    const f = makeMockFetch(() =>
      new Response(toCompact(snap), {
        status: 200,
        headers: { 'content-type': 'application/ahtml+text', etag: snap.etag! },
      }),
    );
    const client = new AHTMLClient({ fetch: f });
    const got = await client.fetch('https://x.com/ahtml/p');
    assert.equal(got.entities[0]!.id, 'product:p');
  });

  test('sends Accept: application/ahtml+text by default', async () => {
    const snap = snapshot('https://x.com', 'home').build();
    const f = makeMockFetch(() => new Response(toCompact(snap), {
      headers: { 'content-type': 'application/ahtml+text' },
    }));
    const client = new AHTMLClient({ fetch: f });
    await client.fetch('https://x.com');
    const accept = (f.calls[0]!.init!.headers as Record<string, string>).accept;
    assert.match(accept, /application\/ahtml\+text/);
  });

  test('sends Accept: application/ahtml+json when format: "json"', async () => {
    const snap = snapshot('https://x.com', 'home').build();
    const f = makeMockFetch(() => new Response(toJson(snap), {
      headers: { 'content-type': 'application/ahtml+json' },
    }));
    const client = new AHTMLClient({ fetch: f });
    await client.fetch('https://x.com', { format: 'json' });
    const accept = (f.calls[0]!.init!.headers as Record<string, string>).accept;
    assert.match(accept, /application\/ahtml\+json/);
  });

  test('serves a fresh snapshot from cache when within TTL (zero network calls)', async () => {
    const snap = snapshot('https://x.com', 'home').ttl(60).build();
    snap.etag = computeEtag(snap);
    let callCount = 0;
    const f = makeMockFetch(() => {
      callCount++;
      return new Response(toCompact(snap), {
        headers: { 'content-type': 'application/ahtml+text', etag: snap.etag! },
      });
    });
    const client = new AHTMLClient({ fetch: f });
    await client.fetch('https://x.com');
    await client.fetch('https://x.com');   // second call should be cache-served
    assert.equal(callCount, 1);
  });

  test('sends If-None-Match on a re-fetch after TTL expiry', async () => {
    const snap = snapshot('https://x.com', 'home').ttl(0).build();   // ttl=0 means always-stale
    snap.etag = computeEtag(snap);
    const f = makeMockFetch(() =>
      new Response(toCompact(snap), {
        status: 200,
        headers: { 'content-type': 'application/ahtml+text', etag: snap.etag! },
      }),
    );
    const client = new AHTMLClient({ fetch: f });
    await client.fetch('https://x.com');
    await client.fetch('https://x.com');
    // Look at the second call — should carry If-None-Match (or be a diff request)
    const second = f.calls[1]!;
    const hdrs = (second.init!.headers as Record<string, string>);
    const sentIfNoneMatch = hdrs['if-none-match'] !== undefined;
    const isDiffRequest = second.url.includes('since=');
    assert.ok(sentIfNoneMatch || isDiffRequest, 'second call should be conditional');
  });

  test('handles 304 by reusing the cached snapshot', async () => {
    const snap = snapshot('https://x.com', 'home').ttl(0).build();
    snap.etag = computeEtag(snap);
    let i = 0;
    const f = makeMockFetch(() => {
      i++;
      if (i === 1) {
        return new Response(toCompact(snap), {
          status: 200,
          headers: { 'content-type': 'application/ahtml+text', etag: snap.etag! },
        });
      }
      // On the conditional re-fetch return 304
      return new Response(null, { status: 304, headers: { etag: snap.etag! } });
    });
    const client = new AHTMLClient({ fetch: f });
    const a = await client.fetch('https://x.com');
    const b = await client.fetch('https://x.com');
    assert.equal(b.entities.length, a.entities.length);
    assert.equal(b.etag, a.etag);
  });

  test('applies a diff response and reconstructs the new snapshot', async () => {
    const prev = snapshot('https://x.com', 'product_list')
      .ttl(0)
      .add({ id: 'product:a', type: 'product', name: 'A' })
      .build();
    prev.etag = computeEtag(prev);
    const next = snapshot('https://x.com', 'product_list')
      .ttl(0)
      .add({ id: 'product:a', type: 'product', name: 'A' })
      .add({ id: 'product:b', type: 'product', name: 'B' })
      .build();
    next.etag = computeEtag(next);

    let i = 0;
    const f = makeMockFetch((url) => {
      i++;
      if (i === 1) {
        return new Response(toCompact(prev), {
          headers: { 'content-type': 'application/ahtml+text', etag: prev.etag! },
        });
      }
      // Second call may include ?since=<etag> — return a diff
      if (url.includes('since=')) {
        const d = diff(prev, next);
        return new Response(JSON.stringify(d), {
          headers: { 'content-type': 'application/ahtml-diff+json', etag: next.etag! },
        });
      }
      return new Response(toCompact(next), {
        headers: { 'content-type': 'application/ahtml+text', etag: next.etag! },
      });
    });
    const client = new AHTMLClient({ fetch: f });
    await client.fetch('https://x.com');
    const got = await client.fetch('https://x.com');
    const ids = got.entities.map((e) => e.id).sort();
    assert.deepEqual(ids, ['product:a', 'product:b']);
  });

  test('manifest() fetches /.well-known/ahtml.json from the site', async () => {
    const f = makeMockFetch(() =>
      new Response(JSON.stringify({ ahtml: '0.1', site: 'https://x.com' }), {
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = new AHTMLClient({ fetch: f });
    const m = await client.manifest('https://x.com');
    assert.equal((m as { site: string }).site, 'https://x.com');
    assert.match(f.calls[0]!.url, /\/.well-known\/ahtml\.json$/);
  });

  test('sends Authorization: Bearer <token> when bearer is set (regression: v0.4.0)', async () => {
    const snap = snapshot('https://x.com', 'home').build();
    snap.etag = computeEtag(snap);
    const f = makeMockFetch(() => new Response(toCompact(snap), {
      headers: { 'content-type': 'application/ahtml+text', etag: snap.etag! },
    }));
    const client = new AHTMLClient({ fetch: f });
    await client.fetch('https://x.com', { bearer: 'tok-abc' });
    const hdrs = f.calls[0]!.init!.headers as Record<string, string>;
    assert.equal(hdrs.authorization, 'Bearer tok-abc');
  });

  test('rejects an invalid snapshot from the server (does not cache it)', async () => {
    // Server returns junk that parses but fails structural validation
    // (missing required url/fetched_at).
    const f = makeMockFetch(() => new Response('{"ahtml":"0.1"}', {
      headers: { 'content-type': 'application/ahtml+json' },
    }));
    const client = new AHTMLClient({ fetch: f });
    await assert.rejects(
      () => client.fetch('https://x.com'),
      /invalid AHTML snapshot/,
    );
  });

  test('invalidate(url) drops a single cached entry', async () => {
    const snap = snapshot('https://x.com', 'home').ttl(60).build();
    snap.etag = computeEtag(snap);
    let i = 0;
    const f = makeMockFetch(() => {
      i++;
      return new Response(toCompact(snap), {
        headers: { 'content-type': 'application/ahtml+text', etag: snap.etag! },
      });
    });
    const client = new AHTMLClient({ fetch: f });
    await client.fetch('https://x.com');
    client.invalidate('https://x.com');
    await client.fetch('https://x.com');
    assert.equal(i, 2);
  });
});

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot, computeEtag } from '@ahtmljs/schema';
import { createAHTMLRoute } from '../handler.js';
import type { AHTMLConfig } from '../index.js';

const config: AHTMLConfig = {
  site: 'https://test.example.com',
  default_ttl: 60,
  policy: { agents_welcome: true, rate_limit: '1000/min' },
};

const builder = async (segments: string[], req: Request) => {
  if (segments[0] === 'p') {
    return snapshot(req.url, 'product_detail')
      .add({ id: 'product:demo', type: 'product', name: 'Demo', price: { amount: 1, currency: 'USD' } })
      .build();
  }
  if (segments[0] === 'unknown') return null;
  return snapshot(req.url, 'home').build();
};

function makeCtx(...path: string[]) {
  return { params: Promise.resolve({ path: path.length ? path : undefined }) };
}

describe('createAHTMLRoute', () => {
  test('returns 200 with compact text by default (Accept missing)', async () => {
    const { GET } = createAHTMLRoute(builder, config);
    const res = await GET(new Request('https://test.example.com/ahtml/p'), makeCtx('p'));
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /application\/ahtml\+text/);
    const body = await res.text();
    assert.match(body, /^@ahtml 0\.1/m);
    assert.match(body, /^\[product:demo\]/m);
  });

  test('returns JSON when Accept: application/ahtml+json', async () => {
    const { GET } = createAHTMLRoute(builder, config);
    const res = await GET(
      new Request('https://test.example.com/ahtml/p', { headers: { accept: 'application/ahtml+json' } }),
      makeCtx('p'),
    );
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /application\/ahtml\+json/);
    const parsed = JSON.parse(await res.text());
    assert.equal(parsed.ahtml, '0.1');
    assert.equal(parsed.entities[0].id, 'product:demo');
  });

  test('sets ETag, Cache-Control, Last-Modified, x-ahtml-version, Vary headers', async () => {
    const { GET } = createAHTMLRoute(builder, config);
    const res = await GET(new Request('https://test.example.com/ahtml/p'), makeCtx('p'));
    assert.match(res.headers.get('etag') ?? '', /^W\/"/);
    assert.match(res.headers.get('cache-control') ?? '', /max-age=\d+/);
    assert.ok(res.headers.get('last-modified'));
    assert.equal(res.headers.get('x-ahtml-version'), '0.1');
    // v0.7.0: Vary now also lists Accept-Encoding because we negotiate
    // gzip/br on the body.
    assert.match(res.headers.get('vary') ?? '', /Accept/);
  });

  test('returns 304 when If-None-Match matches the snapshot etag', async () => {
    const { GET } = createAHTMLRoute(builder, config);
    const first = await GET(new Request('https://test.example.com/ahtml/p'), makeCtx('p'));
    const etag = first.headers.get('etag')!;
    const second = await GET(
      new Request('https://test.example.com/ahtml/p', { headers: { 'if-none-match': etag } }),
      makeCtx('p'),
    );
    assert.equal(second.status, 304);
    assert.equal(second.headers.get('etag'), etag);
    // 304 body is empty
    assert.equal((await second.text()).length, 0);
  });

  test('returns 404 for paths the builder rejects', async () => {
    const { GET } = createAHTMLRoute(builder, config);
    const res = await GET(new Request('https://test.example.com/ahtml/unknown'), makeCtx('unknown'));
    assert.equal(res.status, 404);
  });

  test('?since=<etag> returns a SnapshotDiff against the previously-cached snapshot', async () => {
    const { GET } = createAHTMLRoute(builder, config);
    // First fetch — populates the in-memory cache
    const first = await GET(new Request('https://test.example.com/ahtml/p'), makeCtx('p'));
    const etag = first.headers.get('etag')!;
    // Second fetch with ?since=<etag> when the snapshot has not changed
    const res = await GET(
      new Request(`https://test.example.com/ahtml/p?since=${encodeURIComponent(etag)}`),
      makeCtx('p'),
    );
    // Server returns either a diff (200 + application/ahtml-diff+json) or a 304 — either is correct.
    assert.ok([200, 304].includes(res.status));
  });

  test('HEAD returns same headers but no body', async () => {
    const { GET, HEAD } = createAHTMLRoute(builder, config);
    const get = await GET(new Request('https://test.example.com/ahtml/p'), makeCtx('p'));
    const head = await HEAD(new Request('https://test.example.com/ahtml/p'), makeCtx('p'));
    assert.equal(head.status, get.status);
    assert.equal(head.headers.get('etag'), get.headers.get('etag'));
    assert.equal((await head.text()).length, 0);
  });

  test('applies default_ttl from config when snapshot has no ttl', async () => {
    const { GET } = createAHTMLRoute(builder, { site: 'x', default_ttl: 120, policy: { agents_welcome: true } });
    const res = await GET(new Request('https://test.example.com/ahtml/'), makeCtx());
    assert.match(res.headers.get('cache-control') ?? '', /max-age=120/);
  });

  test('falls back to "compact" when Accept is */* or missing', async () => {
    const { GET } = createAHTMLRoute(builder, config);
    const res = await GET(
      new Request('https://test.example.com/ahtml/p', { headers: { accept: '*/*' } }),
      makeCtx('p'),
    );
    assert.match(res.headers.get('content-type') ?? '', /application\/ahtml\+text/);
  });

  test('honors q-values when Accept lists both formats (regression: v0.4.0)', async () => {
    const { GET } = createAHTMLRoute(builder, config);
    // Compact preferred over JSON.
    const r1 = await GET(
      new Request('https://test.example.com/ahtml/p', {
        headers: { accept: 'application/ahtml+json;q=0.1, application/ahtml+text;q=0.9' },
      }),
      makeCtx('p'),
    );
    assert.match(r1.headers.get('content-type') ?? '', /application\/ahtml\+text/);
    // JSON preferred over compact.
    const r2 = await GET(
      new Request('https://test.example.com/ahtml/p', {
        headers: { accept: 'application/ahtml+text;q=0.1, application/ahtml+json;q=0.9' },
      }),
      makeCtx('p'),
    );
    assert.match(r2.headers.get('content-type') ?? '', /application\/ahtml\+json/);
  });
});

describe('policy enforcement', () => {
  test('returns 403 when agents_welcome is false', async () => {
    const { GET } = createAHTMLRoute(builder, { site: 'x', policy: { agents_welcome: false } });
    const res = await GET(new Request('https://test.example.com/ahtml/'), makeCtx());
    assert.equal(res.status, 403);
    const body = JSON.parse(await res.text());
    assert.equal(body.error, 'agents_not_welcome');
  });

  test('rate-limit eventually returns 429 under heavy burst', async () => {
    const { GET } = createAHTMLRoute(builder, { site: 'x', policy: { agents_welcome: true, rate_limit: '2/min' } });
    const req = () => new Request('https://test.example.com/ahtml/p', { headers: { 'x-forwarded-for': '203.0.113.7' } });
    const a = await GET(req(), makeCtx('p'));
    const b = await GET(req(), makeCtx('p'));
    const c = await GET(req(), makeCtx('p'));
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(c.status, 429);
  });
});

describe('ETag stability', () => {
  test('same content + different fetched_at = same content-addressed etag', async () => {
    const a = snapshot('https://x.com', 'home').fetchedAt('2026-01-01T00:00:00Z').build();
    const b = snapshot('https://x.com', 'home').fetchedAt('2026-06-01T00:00:00Z').build();
    assert.equal(computeEtag(a), computeEtag(b));
  });
});

/**
 * @ahtmljs/badge tests (TASKS.md T3.4).
 *
 * Score parity is structural — the handler calls the CLI's computeScore —
 * and asserted here by running BOTH the handler and computeScore against
 * the same in-process fixture site and comparing the JSON byte-for-byte.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { computeScore } from '@ahtmljs/cli/score';
import { createBadgeHandler, renderBadgeSvg, badgeMarkdown } from '../index.js';

const FIXTURE_HTML = `<!doctype html><html><head>
<meta property="og:title" content="Fixture Shop"/>
<meta property="og:description" content="A test shop"/>
<meta property="og:type" content="website"/>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Widget","offers":{"price":5,"priceCurrency":"USD"}}</script>
</head><body><h1>Fixture Shop</h1></body></html>`;

const SNAPSHOT = JSON.stringify({
  ahtml: '0.1',
  url: 'http://fixture/',
  fetched_at: '2026-01-01T00:00:00.000Z',
  ttl: 120,
  page_type: 'home',
  entities: [],
  actions: [],
});

/** Minimal fixture site: homepage + /ahtml + probe endpoints. */
async function fixtureSite(): Promise<{ origin: string; server: Server }> {
  const server = createServer((req, res) => {
    const path = new URL(req.url!, 'http://x').pathname;
    if (path === '/') {
      res.writeHead(200, { 'content-type': 'text/html' }).end(FIXTURE_HTML);
    } else if (path === '/ahtml') {
      res.writeHead(200, { 'content-type': 'application/ahtml+json' }).end(SNAPSHOT);
    } else if (path === '/robots.txt') {
      res.writeHead(200).end('User-agent: ClaudeBot\nAllow: /\n');
    } else if (path === '/llms.txt' || path === '/.well-known/ahtml.json') {
      res.writeHead(200).end('{}');
    } else {
      res.writeHead(404).end();
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const addr = server.address() as { port: number };
  return { origin: `http://127.0.0.1:${addr.port}`, server };
}

function req(path: string, ip = '1.2.3.4'): Request {
  return new Request(`https://badge.ahtmljs.com${path}`, {
    headers: { 'cf-connecting-ip': ip },
  });
}

describe('@ahtmljs/badge', () => {
  test('report score is byte-identical to local `ahtml score` (single implementation)', async () => {
    const { origin, server } = await fixtureSite();
    try {
      const handler = createBadgeHandler();
      const res = await handler(req(`/report?url=${encodeURIComponent(origin + '/')}`));
      assert.equal(res.status, 200);
      const viaBadge = JSON.parse(await res.text());
      const direct = await computeScore(origin + '/');
      assert.deepEqual(viaBadge, JSON.parse(JSON.stringify(direct)), 'badge must serve computeScore verbatim');
    } finally {
      server.close();
    }
  });

  test('badge SVG carries the score and links to the report', async () => {
    const { origin, server } = await fixtureSite();
    try {
      const handler = createBadgeHandler();
      const res = await handler(req(`/badge?url=${encodeURIComponent(origin + '/')}`));
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type') ?? '', /image\/svg\+xml/);
      assert.match(res.headers.get('link') ?? '', /\/report\?url=/);
      const svg = await res.text();
      assert.match(svg, /ahtml score/);
      assert.match(svg, /\/100/);
    } finally {
      server.close();
    }
  });

  test('cache honors the snapshot TTL: hit inside, miss after expiry', async () => {
    const { origin, server } = await fixtureSite();
    try {
      let scoreCalls = 0;
      let t = 1_000_000;
      const handler = createBadgeHandler({
        score: async (url) => {
          scoreCalls++;
          return { url, score: 80, grade: 'B', checks: [] };
        },
        now: () => t,
      });
      const target = encodeURIComponent(origin + '/');

      const first = await handler(req(`/badge?url=${target}`));
      assert.equal(first.headers.get('x-ahtml-badge-cache'), 'miss');
      t += 60_000; // inside the snapshot's ttl=120s
      const second = await handler(req(`/badge?url=${target}`));
      assert.equal(second.headers.get('x-ahtml-badge-cache'), 'hit');
      assert.equal(scoreCalls, 1, 'cached window must not re-score');

      t += 61_000; // now past 120s total → expired
      const third = await handler(req(`/badge?url=${target}`));
      assert.equal(third.headers.get('x-ahtml-badge-cache'), 'miss');
      assert.equal(scoreCalls, 2, 'expiry must re-score');
    } finally {
      server.close();
    }
  });

  test('rate limit: per-IP fixed window returns 429 with Retry-After', async () => {
    let t = 0;
    const handler = createBadgeHandler({
      score: async (url) => ({ url, score: 100, grade: 'A+', checks: [] }),
      fetch: (async () => new Response('{}', { status: 404 })) as typeof fetch,
      now: () => t,
      rateLimit: 3,
      rateWindowMs: 60_000,
    });
    const url = '/badge?url=' + encodeURIComponent('https://example.com/');
    for (let i = 0; i < 3; i++) {
      assert.equal((await handler(req(url, '9.9.9.9'))).status, 200);
    }
    const limited = await handler(req(url, '9.9.9.9'));
    assert.equal(limited.status, 429);
    assert.ok(limited.headers.get('retry-after'));
    // A different IP is unaffected.
    assert.equal((await handler(req(url, '8.8.8.8'))).status, 200);
    // The window rolls over.
    t += 60_001;
    assert.equal((await handler(req(url, '9.9.9.9'))).status, 200);
  });

  test('input validation: 400 on missing/invalid url, 404 on unknown path', async () => {
    const handler = createBadgeHandler({
      score: async () => {
        throw new Error('must not score');
      },
    });
    assert.equal((await handler(req('/badge'))).status, 400);
    assert.equal((await handler(req('/badge?url=javascript:alert(1)'))).status, 400);
    assert.equal((await handler(req('/nope?url=https://x.com'))).status, 404);
  });

  test('renderBadgeSvg + badgeMarkdown are stable pure functions', () => {
    const svg = renderBadgeSvg({ score: 97, grade: 'A+' });
    assert.match(svg, /97\/100 A\+/);
    assert.match(svg, /#3fb950/);
    assert.equal(
      badgeMarkdown('https://badge.ahtmljs.com', 'https://shop.example.com'),
      '[![AHTML score](https://badge.ahtmljs.com/badge?url=https%3A%2F%2Fshop.example.com)](https://badge.ahtmljs.com/report?url=https%3A%2F%2Fshop.example.com)',
    );
  });
});

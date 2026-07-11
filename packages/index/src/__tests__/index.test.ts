/**
 * @ahtmljs/index — TASKS.md T6.1–T6.7 against a seeded 25-site fixture farm.
 * All origins are fake (https://site-N.example.com) behind an injectable
 * fetch, so the whole crawl is hermetic; only the T6.7 dogfood score test
 * stands up a real localhost server (computeScore fetches for real).
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { webcrypto } from 'node:crypto';
import {
  snapshot,
  toJson,
  toCompact,
  computeEtag,
  signSnapshot,
  validate,
  type Snapshot,
  type VerifyKey,
} from '@ahtmljs/schema';
import { InMemoryKvStore } from '@ahtmljs/kv/memory';
import { createIndex, type IndexEntry } from '../index.js';

/* ---------------------------------------------------------------------------
 * 25-site fixture farm
 * ------------------------------------------------------------------------- */

interface Site {
  origin: string;
  snap: Snapshot;
  json: string;
  etag: string;
  jws?: string;
  wellKnown: boolean;
  requests: string[]; // request log per site
  broken?: boolean;
}

const AT = '2026-01-01T00:00:00.000Z';
const PRODUCTS = ['Trail Shoe', 'Espresso Machine', 'Standing Desk', 'Wool Socks', 'Water Bottle'];

function makeSite(i: number): Snapshot {
  const origin = `https://site-${i}.example.com`;
  if (i < 10) {
    // shops selling products; 5–9 add a refundable checkout action
    const b = snapshot(`${origin}/`, 'product_detail')
      .fetchedAt(AT)
      .ttl(i === 0 ? 3600 : 60) // site-0 is TTL-fresh forever in test-time
      .policy({ agents_welcome: true })
      .add({
        id: `product:p${i}`,
        type: 'product',
        name: `${PRODUCTS[i % PRODUCTS.length]} ${i}`,
        price: { amount: 10 + i, currency: 'USD' },
      });
    if (i >= 5) {
      b.action({
        id: 'checkout',
        target: `product:p${i}`,
        category: 'transact',
        method: 'POST',
        execute_url: '/api/checkout',
        auth: 'required',
        cost: { amount: 10 + i, currency: 'USD', category: 'purchase' },
        reversible: { reversible: true, window: 'P14D', policy: 'full_refund' },
        side_effects: ['charge_card'],
        confirmation: 'required',
      });
    }
    return b.build();
  }
  if (i < 15) {
    return snapshot(`${origin}/`, 'document')
      .fetchedAt(AT)
      .ttl(60)
      .policy({ agents_welcome: true })
      .add({ id: `document:d${i}`, type: 'document', title: `Doc ${i}` })
      .build();
  }
  // 15–24: task boards with a non-reversible send action
  return snapshot(`${origin}/`, 'task_list')
    .fetchedAt(AT)
    .ttl(60)
    .policy({ agents_welcome: true })
    .add({ id: `task:t${i}`, type: 'task', title: `Task ${i}`, state: 'open' })
    .action({
      id: 'notify',
      category: 'send',
      method: 'POST',
      execute_url: '/api/notify',
      auth: 'none',
      side_effects: ['send_message'],
    })
    .build();
}

let sites: Map<string, Site>;
let trustedKeys: VerifyKey[];
let wrongJws: string;

async function buildFarm(): Promise<void> {
  const subtle = webcrypto.subtle;
  const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const rogue = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  trustedKeys = [{ alg: 'ES256', key: pair.publicKey }];

  sites = new Map();
  for (let i = 0; i < 25; i++) {
    const origin = `https://site-${i}.example.com`;
    const snap = makeSite(i);
    snap.etag = computeEtag(snap);
    const site: Site = {
      origin,
      snap,
      json: toJson(snap),
      etag: snap.etag,
      wellKnown: true,
      requests: [],
    };
    // 20–22 signed with the trusted key; 23 signed with a ROGUE key.
    if (i >= 20 && i <= 22) site.jws = await signSnapshot(snap, { alg: 'ES256', key: pair.privateKey });
    if (i === 23) site.jws = await signSnapshot(snap, { alg: 'ES256', key: rogue.privateKey });
    sites.set(origin, site);
  }
  wrongJws = (await signSnapshot(makeSite(0), { alg: 'ES256', key: rogue.privateKey }))!;
}

/** Injectable fetch routing the fake origins. */
const farmFetch: typeof fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : (input as Request).url);
  const site = sites.get(url.origin);
  if (!site) return new Response('no such site', { status: 502 });
  site.requests.push(url.pathname);
  if (url.pathname === '/.well-known/ahtml.json') {
    return site.wellKnown
      ? new Response(JSON.stringify({ ahtml: '0.1', site: site.origin }), { status: 200 })
      : new Response('gone', { status: 404 });
  }
  if (url.pathname === '/ahtml') {
    if (!site.wellKnown && site.broken) return new Response('gone', { status: 404 });
    const headers = new Headers(init?.headers);
    if (headers.get('if-none-match') === site.etag) {
      return new Response(null, { status: 304, headers: { etag: site.etag } });
    }
    const respHeaders: Record<string, string> = {
      'content-type': 'application/ahtml+json',
      etag: site.etag,
    };
    if (site.jws) respHeaders['x-ahtml-signature'] = site.jws;
    return new Response(site.broken ? '{"ahtml":"9.9"}' : site.json, { status: 200, headers: respHeaders });
  }
  return new Response('not found', { status: 404 });
};

const fixedScore = async (url: string) => ({ score: 90, grade: 'A' });

function makeIdx(nowRef: { t: number }) {
  return createIndex({
    kv: new InMemoryKvStore(),
    fetch: farmFetch,
    score: fixedScore,
    now: () => nowRef.t,
    trustedKeys,
  });
}

describe('@ahtmljs/index', () => {
  before(buildFarm);

  test('T6.3: valid sites index; invalid snapshot is rejected WITH the lint report', async () => {
    const idx = makeIdx({ t: Date.parse(AT) + 1000 });
    const ok = await idx.submit('https://site-1.example.com/');
    assert.equal(ok.ok, true);
    assert.equal(ok.entry!.status, 'indexed');

    // Break site-24's snapshot and submit it.
    sites.get('https://site-24.example.com')!.broken = true;
    const bad = await idx.submit('https://site-24.example.com/');
    assert.equal(bad.ok, false);
    assert.ok(bad.issues && bad.issues.length > 0, 'rejection must carry the lint report');
    assert.ok(bad.issues!.some((i) => i.path === 'ahtml'), 'report names the failing field');
    sites.get('https://site-24.example.com')!.broken = false;

    // No .well-known → rejected (AHTML is opt-in).
    sites.get('https://site-2.example.com')!.wellKnown = false;
    const optedOut = await idx.submit('https://site-2.example.com/');
    assert.equal(optedOut.ok, false);
    assert.match(optedOut.reason!, /well-known/);
    sites.get('https://site-2.example.com')!.wellKnown = true;
  });

  test('T6.2: unchanged site costs the origin exactly one 304; TTL-fresh costs zero', async () => {
    const nowRef = { t: Date.parse(AT) + 1000 };
    const idx = makeIdx(nowRef);
    await idx.submit('https://site-0.example.com/'); // ttl 3600
    await idx.submit('https://site-3.example.com/'); // ttl 60

    const s0 = sites.get('https://site-0.example.com')!;
    const s3 = sites.get('https://site-3.example.com')!;
    s0.requests.length = 0;
    s3.requests.length = 0;

    nowRef.t += 120_000; // 2 min: site-0 still fresh (1h ttl), site-3 stale (60s ttl)
    const stats = await idx.recrawl();
    assert.equal(stats.skippedFresh, 1, 'TTL-fresh site is not fetched at all');
    assert.equal(stats.unchanged, 1);
    assert.deepEqual(s0.requests, [], 'fresh site: zero requests');
    assert.deepEqual(s3.requests, ['/ahtml'], 'stale-but-unchanged site: exactly one conditional request');
  });

  test('T6.4: dropping .well-known delists within one re-crawl; so does agents_welcome:false', async () => {
    const nowRef = { t: Date.parse(AT) + 1000 };
    const idx = makeIdx(nowRef);
    await idx.submit('https://site-4.example.com/');
    await idx.submit('https://site-16.example.com/');

    // site-4 opts out entirely.
    const s4 = sites.get('https://site-4.example.com')!;
    s4.wellKnown = false;
    s4.broken = true;

    // site-16 flips agents_welcome to false.
    const s16 = sites.get('https://site-16.example.com')!;
    const flipped = JSON.parse(s16.json) as Snapshot;
    flipped.policy = { agents_welcome: false };
    const prevJson = s16.json;
    const prevEtag = s16.etag;
    s16.json = toJson(flipped);
    s16.etag = 'W/"flipped"';

    nowRef.t += 120_000;
    const stats = await idx.recrawl();
    assert.equal(stats.delisted, 2, 'both opt-outs delist in ONE cycle');
    const entries = await idx.entries(true);
    assert.equal(entries.find((e) => e.origin.includes('site-4'))!.status, 'delisted');
    assert.match(entries.find((e) => e.origin.includes('site-16'))!.delistReason!, /agents_welcome/);
    assert.deepEqual(await idx.query({}), [], 'delisted sites never surface in queries');

    s4.wellKnown = true;
    s4.broken = false;
    s16.json = prevJson;
    s16.etag = prevEtag;
  });

  test('T6.5: signature status is stored per entry and unsigned is NEVER verified', async () => {
    const idx = makeIdx({ t: Date.parse(AT) + 1000 });
    for (const i of [1, 20, 21, 22, 23]) await idx.submit(`https://site-${i}.example.com/`);
    const entries = await idx.entries();
    const byOrigin = new Map(entries.map((e) => [e.origin, e]));
    assert.equal(byOrigin.get('https://site-1.example.com')!.signatureStatus, 'unsigned');
    for (const i of [20, 21, 22]) {
      assert.equal(byOrigin.get(`https://site-${i}.example.com`)!.signatureStatus, 'verified_publisher');
    }
    assert.equal(
      byOrigin.get('https://site-23.example.com')!.signatureStatus,
      'invalid',
      'a signature that fails verification must NEVER read as verified',
    );
    // Property over the whole set: verified ⇒ had a jws that verified.
    for (const e of entries) {
      if (e.signatureStatus === 'verified_publisher') {
        assert.ok(sites.get(e.origin)!.jws, 'verified entries must have carried a signature');
      }
    }
    assert.deepEqual(
      (await idx.query({ verifiedOnly: true })).map((e) => e.origin).sort(),
      [20, 21, 22].map((i) => `https://site-${i}.example.com`),
    );
  });

  test('T6.6: e2e over the full 25-site farm — MCP + queries answer correctly', async () => {
    const idx = makeIdx({ t: Date.parse(AT) + 1000 });
    for (let i = 0; i < 25; i++) await idx.submit(`https://site-${i}.example.com/`);
    assert.equal((await idx.entries()).length, 25);

    // "which indexed sites offer action type checkout?" → sites 5–9.
    const checkout = await idx.query({ actionId: 'checkout' });
    assert.deepEqual(
      checkout.map((e) => e.origin).sort(),
      [5, 6, 7, 8, 9].map((i) => `https://site-${i}.example.com`),
    );
    // "find sites with refundable checkout actions"
    const refundable = await idx.query({ actionCategory: 'transact', reversible: true });
    assert.equal(refundable.length, 5);
    // "find sites that sell espresso machines"
    const espresso = await idx.query({ sells: 'espresso' });
    assert.ok(espresso.length >= 1);
    assert.ok(espresso.every((e) => e.productNames.some((n) => /Espresso/.test(n))));

    // MCP surface reuses snapshotsToMcp over the index's own snapshot.
    const mcp = await idx.indexToMcp('https://index.ahtmljs.com/');
    const toolNames = mcp.tools.map((t: { name: string }) => t.name);
    assert.ok(toolNames.some((n: string) => n.includes('search_sites')), `tools: ${toolNames.join(', ')}`);
    assert.ok(toolNames.some((n: string) => n.includes('sites_with_action')));
  });

  test('T6.7 (validity half): the index snapshot itself validates clean', async () => {
    const idx = makeIdx({ t: Date.parse(AT) + 1000 });
    for (let i = 0; i < 5; i++) await idx.submit(`https://site-${i}.example.com/`);
    const snap = await idx.buildIndexSnapshot('https://index.ahtmljs.com/');
    const errors = validate(snap).filter((i) => i.severity === 'error');
    assert.deepEqual(errors, []);
    assert.equal(snap.entities[0]!.type, 'dataset');
    assert.ok((snap.entities[0] as { row_count_total?: number }).row_count_total === 5);
  });
});

/* ---------------------------------------------------------------------------
 * T6.7 (score half): the index site scores 100 on the real `ahtml score`
 * ------------------------------------------------------------------------- */

describe('index dogfood scores 100 (T6.7)', () => {
  test('a served index site earns 100/100 from the canonical scorer', async () => {
    const { computeScore } = await import('@ahtmljs/cli/score');
    const idx = createIndex({
      kv: new InMemoryKvStore(),
      fetch: farmFetch,
      score: fixedScore,
      now: () => Date.parse(AT) + 1000,
      trustedKeys,
    });
    await buildFarm();
    for (let i = 0; i < 3; i++) await idx.submit(`https://site-${i}.example.com/`);
    const indexSnap = await idx.buildIndexSnapshot('http://placeholder/');

    const filler = 'The AHTML Index is the public registry of agent-readable sites. '.repeat(60);
    const html = `<!doctype html><html><head>
<title>AHTML Index</title>
<meta property="og:title" content="AHTML Index"/>
<meta property="og:description" content="Public registry of AHTML-enabled, agent-readable sites."/>
<meta property="og:type" content="website"/>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Dataset","name":"AHTML Index","description":"Registry of AHTML sites"}</script>
</head><body><h1>AHTML Index</h1><p>${filler}</p></body></html>`;

    const server = createServer((req, res) => {
      const path = new URL(req.url!, 'http://x').pathname;
      const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
      const snap = { ...indexSnap, url };
      if (path === '/') res.writeHead(200, { 'content-type': 'text/html' }).end(html);
      else if (path === '/robots.txt') res.writeHead(200).end('User-agent: GPTBot\nAllow: /\n\nUser-agent: ClaudeBot\nAllow: /\n');
      else if (path === '/llms.txt') res.writeHead(200).end('# AHTML Index\n');
      else if (path === '/.well-known/ahtml.json') res.writeHead(200).end(JSON.stringify({ ahtml: '0.1' }));
      else if (path === '/ahtml') res.writeHead(200, { 'content-type': 'application/ahtml+json' }).end(toJson(snap as Snapshot));
      else res.writeHead(404).end();
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    try {
      const result = await computeScore(`${origin}/`);
      const failing = result.checks.filter((c: { earned: number; points: number }) => c.earned < c.points);
      assert.equal(
        result.score,
        100,
        `index must dogfood at 100, got ${result.score} — failing: ${failing
          .map((c: { name: string; detail: string }) => `${c.name} (${c.detail})`)
          .join('; ')}`,
      );
    } finally {
      server.close();
    }
  });
});

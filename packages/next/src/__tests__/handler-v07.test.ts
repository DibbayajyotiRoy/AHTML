/**
 * v0.7.0 — handler streaming + Accept-Encoding (gzip) negotiation.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  snapshot,
  fromStream,
  STREAM_CONTENT_TYPE,
} from '@ahtmljs/schema';
import { createAHTMLRoute } from '../handler.js';
import type { AHTMLConfig } from '../index.js';

const config: AHTMLConfig = {
  site: 'https://test.example.com',
  default_ttl: 60,
  policy: { agents_welcome: true, rate_limit: '1000/min' },
};

function builder(n: number) {
  return async (segments: string[], req: Request) => {
    const b = snapshot(req.url, 'dataset');
    for (let i = 0; i < n; i++) {
      b.add({ id: `product:p-${i}`, type: 'product', name: `Item ${i}` });
    }
    return b.build();
  };
}

function makeCtx(...path: string[]) {
  return { params: Promise.resolve({ path: path.length ? path : undefined }) };
}

describe('createAHTMLRoute v0.7 — streaming', () => {
  test('streams when routeOpts.stream = true', async () => {
    const { GET } = createAHTMLRoute(builder(50), config, { stream: true });
    const res = await GET(new Request('https://test.example.com/ahtml/p'), makeCtx('p'));
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', new RegExp(STREAM_CONTENT_TYPE.replace(/[+]/g, '\\+')));
    assert.equal(res.headers.get('transfer-encoding'), 'chunked');
    const restored = await fromStream(res.body!);
    assert.equal(restored.entities.length, 50);
  });

  test('streams when entities exceed routeOpts.stream threshold', async () => {
    const { GET } = createAHTMLRoute(builder(100), config, { stream: 50 });
    const res = await GET(new Request('https://test.example.com/ahtml/p'), makeCtx('p'));
    assert.match(res.headers.get('content-type') ?? '', new RegExp(STREAM_CONTENT_TYPE.replace(/[+]/g, '\\+')));
  });

  test('does NOT stream when below threshold', async () => {
    const { GET } = createAHTMLRoute(builder(10), config, { stream: 50 });
    const res = await GET(new Request('https://test.example.com/ahtml/p'), makeCtx('p'));
    // default content-type, not the streaming one
    assert.doesNotMatch(res.headers.get('content-type') ?? '', new RegExp(STREAM_CONTENT_TYPE.replace(/[+]/g, '\\+')));
  });

  test('client can force streaming via Accept header', async () => {
    const { GET } = createAHTMLRoute(builder(5), config); // no stream config
    const res = await GET(
      new Request('https://test.example.com/ahtml/p', {
        headers: { accept: STREAM_CONTENT_TYPE },
      }),
      makeCtx('p'),
    );
    assert.match(res.headers.get('content-type') ?? '', new RegExp(STREAM_CONTENT_TYPE.replace(/[+]/g, '\\+')));
  });
});

describe('createAHTMLRoute v0.7 — Accept-Encoding negotiation', () => {
  test('returns gzip-encoded body when client offers gzip', async () => {
    const { GET } = createAHTMLRoute(builder(20), config);
    const res = await GET(
      new Request('https://test.example.com/ahtml/p', {
        headers: { 'accept-encoding': 'gzip' },
      }),
      makeCtx('p'),
    );
    assert.equal(res.headers.get('content-encoding'), 'gzip');
    assert.match(res.headers.get('vary') ?? '', /Accept-Encoding/);

    // Decompress and verify it's the same content.
    const raw = new Uint8Array(await res.arrayBuffer());
    const ds = new DecompressionStream('gzip');
    const stream = new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(raw); c.close(); },
    });
    const piped = stream.pipeThrough(ds as unknown as TransformStream<Uint8Array, Uint8Array>);
    const buf = await new Response(piped).text();
    assert.match(buf, /^@ahtml 0\.1/m);
  });

  test('returns identity when client offers nothing', async () => {
    const { GET } = createAHTMLRoute(builder(5), config);
    const res = await GET(new Request('https://test.example.com/ahtml/p'), makeCtx('p'));
    assert.equal(res.headers.get('content-encoding'), null);
  });

  test('honors q=0 refusal', async () => {
    const { GET } = createAHTMLRoute(builder(5), config);
    const res = await GET(
      new Request('https://test.example.com/ahtml/p', {
        headers: { 'accept-encoding': 'gzip;q=0' },
      }),
      makeCtx('p'),
    );
    assert.equal(res.headers.get('content-encoding'), null);
  });

  test('compression saves bytes on a 50-entity snapshot', async () => {
    const { GET: gz } = createAHTMLRoute(builder(50), config);
    const r1 = await gz(new Request('https://test.example.com/ahtml/p', {
      headers: { 'accept-encoding': 'gzip' },
    }), makeCtx('p'));
    const r2 = await gz(new Request('https://test.example.com/ahtml/p'), makeCtx('p'));
    const gzSize = (await r1.arrayBuffer()).byteLength;
    const idSize = (await r2.text()).length;
    assert.ok(gzSize < idSize, `gzip (${gzSize}B) should be smaller than identity (${idSize}B)`);
  });
});

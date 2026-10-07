import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { hostname } from 'node:os';
import {
  track,
  flushTelemetry,
  _setTelemetryTransport,
  type TelemetryBatch,
} from '../telemetry.js';

const PKG = '@ahtmljs/schema';

/** Install a capturing transport; returns the POSTs it receives. */
function capture(): { url: string; body: TelemetryBatch }[] {
  const posts: { url: string; body: TelemetryBatch }[] = [];
  _setTelemetryTransport((url, body) => {
    posts.push({ url, body });
  });
  return posts;
}

/** Drain anything pending (other tests' leftovers) into a throwaway transport. */
async function drain(): Promise<void> {
  _setTelemetryTransport(() => {});
  await flushTelemetry();
}

afterEach(async () => {
  await drain();
  _setTelemetryTransport(null);
});

test('aggregates repeated events per pkg+event into one PostHog event', async () => {
  await drain();
  const posts = capture();
  track(PKG, '1.1.0', 'agg.a');
  track(PKG, '1.1.0', 'agg.a');
  track(PKG, '1.1.0', 'agg.a', 3);
  track(PKG, '1.1.0', 'agg.b');
  await flushTelemetry();

  assert.equal(posts.length, 1);
  const byName = Object.fromEntries(posts[0]!.body.batch.map((e) => [e.event, e]));
  assert.equal(Object.keys(byName).length, 2);
  assert.equal(byName['agg.a']!.properties.count, 5);
  assert.equal(byName['agg.b']!.properties.count, 1);

  // Nothing left: a second flush sends nothing.
  await flushTelemetry();
  assert.equal(posts.length, 1);
});

test('payload matches the PostHog /batch/ contract and is anonymous', async () => {
  await drain();
  const posts = capture();
  track(PKG, '1.1.0', 'shape.check');
  await flushTelemetry();

  const { url, body } = posts[0]!;
  assert.equal(url, 'https://eu.i.posthog.com/batch/');
  assert.match(body.api_key, /^phc_[A-Za-z0-9]+$/);
  assert.equal(body.batch.length, 1);

  const ev = body.batch[0]!;
  assert.equal(ev.event, 'shape.check');
  assert.match(ev.distinct_id, /^[0-9a-f]{16}$/);
  assert.ok(!Number.isNaN(Date.parse(ev.timestamp)));

  const p = ev.properties;
  assert.equal(p.pkg, PKG);
  assert.equal(p.pkg_version, '1.1.0');
  assert.equal(p.count, 1);
  assert.equal(p.runtime, 'node');
  assert.equal(p.runtime_version, process.versions.node);
  assert.equal(p.os, process.platform);
  assert.equal(p.arch, process.arch);
  assert.equal(typeof p.ci, 'boolean');
  assert.equal(p.$process_person_profile, false);
  assert.equal(p.$geoip_disable, true);
  assert.equal(p.$lib, 'ahtml');
  assert.deepEqual(
    Object.keys(p).sort(),
    ['$geoip_disable', '$lib', '$process_person_profile', 'arch', 'ci', 'count', 'os', 'pkg', 'pkg_version', 'runtime', 'runtime_version'].sort(),
  );

  // No raw hostname / cwd anywhere in the wire payload.
  const wire = JSON.stringify(body);
  assert.ok(!wire.includes(hostname()), 'hostname leaked');
  assert.ok(!wire.includes(process.cwd()), 'cwd leaked');
});

test('distinct_id is stable across flushes in one process', async () => {
  await drain();
  const posts = capture();
  track(PKG, '1.1.0', 'id.one');
  await flushTelemetry();
  track(PKG, '1.1.0', 'id.two');
  await flushTelemetry();
  assert.equal(posts[0]!.body.batch[0]!.distinct_id, posts[1]!.body.batch[0]!.distinct_id);
});

test('invalid event names, package names and versions are dropped', async () => {
  await drain();
  const posts = capture();
  for (const bad of ['', 'Has Upper', 'has space', 'a'.repeat(65), 'slash/name', 'ünï', 'new\nline']) {
    track(PKG, '1.1.0', bad);
  }
  track('Bad Pkg!', '1.1.0', 'ok.name');
  track(PKG, 'not a version!', 'ok.name');
  track(PKG, '1.1.0', 'ok.name'); // the only valid one
  await flushTelemetry();

  assert.equal(posts.length, 1);
  assert.deepEqual(posts[0]!.body.batch.map((e) => e.event), ['ok.name']);
});

test('a throwing or rejecting transport never escapes track() or flushTelemetry()', async () => {
  await drain();
  _setTelemetryTransport(() => {
    throw new Error('sync boom');
  });
  track(PKG, '1.1.0', 'boom.sync');
  await assert.doesNotReject(flushTelemetry());

  _setTelemetryTransport(async () => {
    throw new Error('async boom');
  });
  track(PKG, '1.1.0', 'boom.async');
  await assert.doesNotReject(flushTelemetry());

  // The failed batch was dropped, and telemetry still works afterwards.
  const posts = capture();
  track(PKG, '1.1.0', 'boom.after');
  await flushTelemetry();
  assert.deepEqual(posts.flatMap((p) => p.body.batch.map((e) => e.event)), ['boom.after']);
});

test('track() with garbage arguments does not throw', () => {
  assert.doesNotThrow(() => {
    track(undefined as unknown as string, undefined as unknown as string, undefined as unknown as string);
    track(PKG, '1.1.0', 'garbage.n', Number.NaN);
    track(PKG, '1.1.0', 'garbage.n', -5);
    track(PKG, '1.1.0', 'garbage.n', Infinity);
  });
});

test('splits into at most 50 events per POST', async () => {
  await drain();
  const posts = capture();
  for (let i = 0; i < 120; i++) track(PKG, '1.1.0', `split.e${i}`);
  await flushTelemetry();

  assert.deepEqual(posts.map((p) => p.body.batch.length), [50, 50, 20]);
  const names = new Set(posts.flatMap((p) => p.body.batch.map((e) => e.event)));
  assert.equal(names.size, 120);
});

test('caps in-memory aggregation at 500 distinct keys', async () => {
  await drain();
  const posts = capture();
  for (let i = 0; i < 650; i++) track(PKG, '1.1.0', `cap.e${i}`);
  // Existing keys still aggregate after the cap is hit.
  track(PKG, '1.1.0', 'cap.e0');
  await flushTelemetry();

  const events = posts.flatMap((p) => p.body.batch);
  assert.equal(events.length, 500);
  assert.equal(events.find((e) => e.event === 'cap.e0')!.properties.count, 2);
  assert.ok(!events.some((e) => e.event === 'cap.e600'));
});

test('default transport is a no-op under the node test runner (NODE_TEST_CONTEXT)', async () => {
  await drain();
  _setTelemetryTransport(null); // default transport
  assert.ok(process.env.NODE_TEST_CONTEXT, 'expected node:test to set NODE_TEST_CONTEXT');

  const realFetch = globalThis.fetch;
  const savedCtx = process.env.NODE_TEST_CONTEXT;
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response('{"status":1}', { status: 200 });
  }) as typeof fetch;
  try {
    track(PKG, '1.1.0', 'ctx.suppressed');
    await flushTelemetry();
    assert.equal(calls.length, 0, 'fetch must not be called when NODE_TEST_CONTEXT is set');

    // Outside a test-runner subprocess the same default transport does POST (to PostHog EU).
    delete process.env.NODE_TEST_CONTEXT;
    track(PKG, '1.1.0', 'ctx.live');
    await flushTelemetry();
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, 'https://eu.i.posthog.com/batch/');
    assert.equal(calls[0]!.init.method, 'POST');
    const sent = JSON.parse(calls[0]!.init.body as string) as TelemetryBatch;
    assert.equal(sent.batch[0]!.event, 'ctx.live');
    assert.ok(calls[0]!.init.signal, 'request must carry an AbortSignal timeout');
  } finally {
    globalThis.fetch = realFetch;
    process.env.NODE_TEST_CONTEXT = savedCtx;
  }
});

test('default transport swallows network failures and timeouts', async () => {
  await drain();
  _setTelemetryTransport(null);
  const realFetch = globalThis.fetch;
  const savedCtx = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  // A fetch that only settles when aborted: proves the 1.5s AbortController fires.
  globalThis.fetch = ((_url: string, init: RequestInit) =>
    new Promise((_res, rej) => {
      init.signal!.addEventListener('abort', () => rej(new Error('aborted')));
    })) as typeof fetch;
  try {
    track(PKG, '1.1.0', 'net.hang');
    const t0 = Date.now();
    await assert.doesNotReject(flushTelemetry());
    const took = Date.now() - t0;
    assert.ok(took >= 1000 && took < 4000, `expected ~1.5s abort, took ${took}ms`);
  } finally {
    globalThis.fetch = realFetch;
    process.env.NODE_TEST_CONTEXT = savedCtx;
  }
});

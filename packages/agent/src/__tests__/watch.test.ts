import { test, describe, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot, toCompact, computeEtag, type Snapshot, type SemanticChange } from '@ahtmljs/schema';
import { AHTMLClient } from '../client.js';

const URL_ = 'https://x.com/ahtml/p';

function snap(amount: number, extra: { name?: string } = {}): Snapshot {
  const s = snapshot(URL_, 'product_detail')
    .ttl(3600) // fresh for an hour: proves watch()/changes() bypass the TTL short-circuit
    .add({
      id: 'product:p',
      type: 'product',
      name: extra.name ?? 'Widget',
      price: { amount, currency: 'USD' },
    })
    .build();
  s.etag = computeEtag(s);
  return s;
}

/** Origin double: honours `?since=<etag>` and `If-None-Match` with 304, else serves the current snapshot. */
function origin(initial: Snapshot) {
  let current = initial;
  const calls: Array<{ url: string; inm?: string }> = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const inm = (init?.headers as Record<string, string> | undefined)?.['if-none-match'];
    calls.push({ url, inm });
    const since = new URL(url).searchParams.get('since');
    if (since === current.etag || inm === current.etag) {
      return new Response(null, { status: 304, headers: { etag: current.etag! } });
    }
    return new Response(toCompact(current), {
      status: 200,
      headers: { 'content-type': 'application/ahtml+text', etag: current.etag! },
    });
  }) as unknown as typeof fetch;
  return {
    fetch: fetchFn,
    calls,
    publish(next: Snapshot) {
      current = next;
    },
  };
}

/** Let the in-flight poll (pure microtasks with the mocked fetch) settle. */
async function settle() {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
}

/**
 * Node 18's `mock.timers.enable` takes an array (`['setTimeout']`);
 * Node ≥20.4 takes `{ apis: [...] }`. Try the modern signature first,
 * fall back to the legacy one so the suite passes on all CI matrix versions.
 */
function enableTimers(): void {
  try {
    (mock.timers.enable as unknown as (opts: { apis: string[] }) => void)({ apis: ['setTimeout'] });
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === 'ERR_INVALID_ARG_TYPE') {
      (mock.timers.enable as unknown as (apis: string[]) => void)(['setTimeout']);
    } else {
      throw e;
    }
  }
}

describe('AHTMLClient.changes()', () => {
  test('first fetch -> [], then price change -> price.changed, then unchanged -> []', async () => {
    const o = origin(snap(100));
    const client = new AHTMLClient({ fetch: o.fetch });

    assert.deepEqual(await client.changes(URL_), []);

    o.publish(snap(80));
    const changes = await client.changes(URL_);
    assert.equal(changes.length, 1);
    assert.equal(changes[0]!.kind, 'price.changed');
    assert.deepEqual(
      [changes[0]!.severity, (changes[0] as { pctChange: number }).pctChange],
      ['notable', -20],
    );

    assert.deepEqual(await client.changes(URL_), []);
  });

  test('revalidates with the origin even while the cached snapshot is within its TTL', async () => {
    const o = origin(snap(100));
    const client = new AHTMLClient({ fetch: o.fetch });
    await client.fetch(URL_);
    assert.equal(o.calls.length, 1);
    await client.fetch(URL_); // TTL-fresh: served from cache, no network
    assert.equal(o.calls.length, 1);
    await client.changes(URL_);
    assert.equal(o.calls.length, 2, 'changes() must hit the network');
    assert.match(o.calls[1]!.url, /since=/, 'and must be conditional');
  });

  test('diffs against the cache populated by a plain fetch()', async () => {
    const o = origin(snap(100));
    const client = new AHTMLClient({ fetch: o.fetch });
    await client.fetch(URL_);
    o.publish(snap(100, { name: 'Widget v2' }));
    const changes = await client.changes(URL_);
    assert.deepEqual(changes.map((c) => c.kind), ['field.changed']);
  });
});

describe('AHTMLClient.watch()', () => {
  afterEach(() => mock.timers.reset());

  test('first poll is a silent baseline; 304 stays silent; a change fires onChange once with (changes, next, prev)', async () => {
    enableTimers();
    const o = origin(snap(100));
    const client = new AHTMLClient({ fetch: o.fetch });
    const seen: Array<{ changes: SemanticChange[]; next: Snapshot; prev: Snapshot }> = [];
    const stop = client.watch(URL_, (changes, next, prev) => seen.push({ changes, next, prev }), { intervalMs: 5_000 });

    await settle();
    assert.equal(o.calls.length, 1, 'immediate baseline fetch');
    assert.equal(seen.length, 0);

    mock.timers.tick(5_000);
    await settle();
    assert.equal(o.calls.length, 2);
    assert.match(o.calls[1]!.url, /since=/, 'poll is conditional');
    assert.equal(seen.length, 0, '304 -> no callback');

    o.publish(snap(70));
    mock.timers.tick(5_000);
    await settle();
    assert.equal(seen.length, 1);
    const hit = seen[0]!;
    assert.equal(hit.changes[0]!.kind, 'price.changed');
    assert.equal((hit.next.entities[0] as { price: { amount: number } }).price.amount, 70);
    assert.equal((hit.prev.entities[0] as { price: { amount: number } }).price.amount, 100);

    mock.timers.tick(5_000);
    await settle();
    assert.equal(seen.length, 1, 'no further callbacks once caught up');
    stop();
  });

  test('a 200 with identical content (origin without 304 support) is silent', async () => {
    enableTimers();
    const s = snap(100);
    let calls = 0;
    const f = (async () => {
      calls++;
      return new Response(toCompact(s), {
        headers: { 'content-type': 'application/ahtml+text', etag: s.etag! },
      });
    }) as unknown as typeof fetch;
    const client = new AHTMLClient({ fetch: f });
    let fired = 0;
    const stop = client.watch(URL_, () => fired++, { intervalMs: 5_000 });
    await settle();
    mock.timers.tick(5_000);
    await settle();
    assert.equal(calls, 2);
    assert.equal(fired, 0);
    stop();
  });

  test('interval defaults to 60s and is clamped to a 5s minimum', async () => {
    enableTimers();
    const o = origin(snap(100));
    const fast = new AHTMLClient({ fetch: o.fetch });
    const stopFast = fast.watch(URL_, () => {}, { intervalMs: 10 });
    await settle();
    assert.equal(o.calls.length, 1);
    mock.timers.tick(4_999);
    await settle();
    assert.equal(o.calls.length, 1, 'clamped: nothing before 5s');
    mock.timers.tick(1);
    await settle();
    assert.equal(o.calls.length, 2);
    stopFast();

    const o2 = origin(snap(100));
    const dflt = new AHTMLClient({ fetch: o2.fetch });
    const stopDefault = dflt.watch(URL_, () => {});
    await settle();
    mock.timers.tick(59_999);
    await settle();
    assert.equal(o2.calls.length, 1, 'default interval is 60s');
    mock.timers.tick(1);
    await settle();
    assert.equal(o2.calls.length, 2);
    stopDefault();
  });

  test('stop function ends polling', async () => {
    enableTimers();
    const o = origin(snap(100));
    const client = new AHTMLClient({ fetch: o.fetch });
    const stop = client.watch(URL_, () => {}, { intervalMs: 5_000 });
    await settle();
    stop();
    mock.timers.tick(60_000);
    await settle();
    assert.equal(o.calls.length, 1);
  });

  test('AbortSignal ends polling (and a pre-aborted signal never starts)', async () => {
    enableTimers();
    const o = origin(snap(100));
    const client = new AHTMLClient({ fetch: o.fetch });
    const ctrl = new AbortController();
    let fired = 0;
    client.watch(URL_, () => fired++, { intervalMs: 5_000, signal: ctrl.signal });
    await settle();
    assert.equal(o.calls.length, 1);

    o.publish(snap(1));
    ctrl.abort();
    mock.timers.tick(60_000);
    await settle();
    assert.equal(o.calls.length, 1, 'no polls after abort');
    assert.equal(fired, 0);

    const pre = new AbortController();
    pre.abort();
    const o2 = origin(snap(100));
    new AHTMLClient({ fetch: o2.fetch }).watch(URL_, () => {}, { signal: pre.signal });
    await settle();
    assert.equal(o2.calls.length, 0);
  });

  test('errors and throwing callbacks do not stop the watcher', async () => {
    enableTimers();
    const o = origin(snap(100));
    let failing = false;
    const f = (async (input: string | URL | Request, init?: RequestInit) => {
      if (failing) throw new Error('boom');
      return o.fetch(input, init);
    }) as unknown as typeof fetch;
    const client = new AHTMLClient({ fetch: f });
    let fired = 0;
    const stop = client.watch(
      URL_,
      () => {
        fired++;
        throw new Error('callback bug');
      },
      { intervalMs: 5_000 },
    );
    await settle();

    failing = true;
    mock.timers.tick(5_000);
    await settle();
    failing = false;

    o.publish(snap(50));
    mock.timers.tick(5_000);
    await settle();
    assert.equal(fired, 1, 'recovered after the failed poll and still delivered the change');

    o.publish(snap(40));
    mock.timers.tick(5_000);
    await settle();
    assert.equal(fired, 2, 'a throwing callback did not kill the watcher');
    stop();
  });

  test('the poll timer is unref()ed so it cannot hold a Node process open', async () => {
    // Intentionally mock-timer-free: Node 18's mocked setTimeout returns a
    // number (no .unref), while Node 20+ returns a Timeout. Stubbing
    // setTimeout with a fake handle tests the real contract — watch() must
    // call .unref() on whatever handle it gets — on every Node version.
    const realSet = globalThis.setTimeout;
    const realClear = globalThis.clearTimeout;
    let unrefs = 0;
    const fakeHandle = {
      unref() {
        unrefs++;
      },
    };
    globalThis.setTimeout = ((fn: () => void, ms?: number, ...args: unknown[]) => {
      if (ms === 5_000) return fakeHandle as unknown as ReturnType<typeof setTimeout>;
      return (realSet as (...a: never[]) => ReturnType<typeof setTimeout>)(
        fn as never,
        ms as never,
        ...(args as never[]),
      );
    }) as unknown as typeof setTimeout;
    // clearTimeout(fakeHandle) must not throw when stop() runs.
    globalThis.clearTimeout = ((h: unknown) => {
      if (h === (fakeHandle as unknown)) return;
      return (realClear as (h: unknown) => void)(h);
    }) as unknown as typeof clearTimeout;
    try {
      const o = origin(snap(100));
      const stop = new AHTMLClient({ fetch: o.fetch }).watch(URL_, () => {}, { intervalMs: 5_000 });
      await settle();
      assert.ok(unrefs >= 1, 'watch() must unref its poll timer');
      stop();
    } finally {
      globalThis.setTimeout = realSet;
      globalThis.clearTimeout = realClear;
    }
  });
});

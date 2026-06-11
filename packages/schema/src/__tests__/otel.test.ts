/**
 * v0.9.0 — optional OpenTelemetry tracing helper.
 *
 * These tests cover the no-op fallback path: when `@opentelemetry/api`
 * is not installed in the test environment, `trace()` must pass values
 * through unchanged, propagate thrown errors verbatim, and `addEvent()`
 * / `setStatus()` must silently do nothing.
 *
 * NOTE: We deliberately do NOT install `@opentelemetry/api` as a dev
 * dependency, so the OTel-active path is exercised manually in
 * downstream apps that opt in. A full SDK-backed integration test is
 * planned for v0.9.x once we add an opt-in test fixture under
 * `packages/schema/test-fixtures/otel-sdk/` — see TODO below.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  trace,
  traceSync,
  addEvent,
  setStatus,
  validate,
  lint,
  verifySnapshot,
  snapshot,
} from '../index.js';

describe('otel — no-op fallback when @opentelemetry/api is absent', () => {
  test('trace() returns the value of a sync fn', async () => {
    const result = await trace('test.sync', () => 42);
    assert.equal(result, 42);
  });

  test('trace() returns the value of an async fn', async () => {
    const result = await trace('test.async', async () => {
      await new Promise((r) => setTimeout(r, 1));
      return 'hello';
    });
    assert.equal(result, 'hello');
  });

  test('trace() propagates thrown errors unchanged', async () => {
    const boom = new Error('boom');
    await assert.rejects(
      () =>
        trace('test.throws', () => {
          throw boom;
        }),
      (err) => err === boom,
    );
  });

  test('trace() propagates async rejections unchanged', async () => {
    const boom = new Error('async-boom');
    await assert.rejects(
      () =>
        trace('test.rejects', async () => {
          throw boom;
        }),
      (err) => err === boom,
    );
  });

  test('trace() accepts attrs without touching them when OTel is absent', async () => {
    const result = await trace('test.attrs', () => 'ok', {
      'ahtml.url': 'https://example.com',
      'ahtml.count': 3,
      'ahtml.flag': true,
      'ahtml.obj': { nested: true },
    });
    assert.equal(result, 'ok');
  });

  test('addEvent() is a silent no-op when OTel is absent', () => {
    assert.doesNotThrow(() => addEvent('test.event', { k: 'v' }));
    assert.doesNotThrow(() => addEvent('test.event'));
  });

  test('setStatus() is a silent no-op when OTel is absent', () => {
    assert.doesNotThrow(() => setStatus('ok'));
    assert.doesNotThrow(() => setStatus('error', 'something broke'));
  });
});

describe('otel — traceSync no-op fallback when @opentelemetry/api is absent', () => {
  test('traceSync() returns the value synchronously (not a Promise)', () => {
    const result = traceSync('test.sync', () => 42);
    assert.equal(result, 42);
    assert.ok(!(result as unknown instanceof Promise));
  });

  test('traceSync() propagates thrown errors unchanged', () => {
    const boom = new Error('boom');
    assert.throws(
      () =>
        traceSync('test.throws', () => {
          throw boom;
        }),
      (err) => err === boom,
    );
  });

  test('traceSync() accepts attrs without touching them when OTel is absent', () => {
    const result = traceSync('test.attrs', () => 'ok', {
      'ahtml.url': 'https://example.com',
      'ahtml.count': 3,
      'ahtml.obj': { nested: true },
    });
    assert.equal(result, 'ok');
  });
});

describe('otel — instrumented entry points (ahtml.validate / ahtml.lint / ahtml.verify_signature)', () => {
  // These public APIs are wrapped in spans (v0.9.x). With OTel absent the
  // wrappers must be transparent: same results, same sync-ness, same errors.
  const snap = snapshot('https://example.com/p/demo', 'product_detail')
    .ttl(60)
    .add({
      id: 'product:demo',
      type: 'product',
      name: 'Demo',
      price: { amount: 1, currency: 'USD' },
    })
    .build();

  test('validate() stays synchronous and reports issues through the span wrapper', () => {
    const ok = validate(snap);
    assert.ok(Array.isArray(ok));
    assert.equal(ok.filter((i) => i.severity === 'error').length, 0);

    const bad = validate({ ahtml: 'nope' });
    assert.ok(Array.isArray(bad));
    assert.ok(bad.some((i) => i.severity === 'error'));
  });

  test('lint() stays synchronous and reports warnings through the span wrapper', () => {
    const warnings = lint(snap);
    assert.ok(Array.isArray(warnings));
    // This snapshot has no policy — the linter must still flag it.
    assert.ok(warnings.some((w) => w.rule === 'no-policy'));
  });

  test('verifySnapshot() returns structured failures through the span wrapper', async () => {
    // Malformed JWS fails before any crypto, so the key is never touched.
    const fakeKey = { alg: 'ES256' as const, key: {} as CryptoKey };
    const res = await verifySnapshot(snap, 'not-a-jws', { trustedKeys: [fakeKey] });
    assert.equal(res.ok, false);
  });

  test('verifySnapshot() propagates programmer errors through the span wrapper', async () => {
    await assert.rejects(
      () => verifySnapshot(snap, 'a..b', { trustedKeys: [] }),
      /at least one trusted key/,
    );
  });
});

describe('otel — SDK-active path (skipped, requires opt-in SDK install)', () => {
  // TODO(v0.9.x): wire an opt-in test fixture that installs
  // `@opentelemetry/api` + `@opentelemetry/sdk-trace-base` with an
  // InMemorySpanExporter, then verify:
  //   - trace() creates a span named `name`
  //   - attrs are written via span.setAttribute()
  //   - thrown errors call span.recordException() and set ERROR status
  //   - span.end() is called exactly once
  //   - addEvent() / setStatus() target the active span
  test.skip('creates a real span when @opentelemetry/api is installed', () => {
    // Intentionally empty — see TODO above.
  });
});

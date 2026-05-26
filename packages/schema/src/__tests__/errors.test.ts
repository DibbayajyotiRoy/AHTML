/**
 * v0.6.0 — unified error taxonomy.
 *
 * Every code in `AHTMLErrorCode` has a default hint, can be constructed
 * via `makeError()`, narrows via `AHTMLError.is()`, and serializes
 * deterministically via `toJSON()`. Every package using these errors
 * imports from here.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  AHTMLError,
  DEFAULT_HINTS,
  makeError,
  validateStrict,
  fromCompact,
  fromJson,
  applyDiff,
  InvalidDiffError,
  snapshot,
  type AHTMLErrorCode,
} from '../index.js';

describe('AHTMLError — taxonomy invariants', () => {
  const ALL_CODES: AHTMLErrorCode[] = [
    'SCHEMA_INVALID',
    'DIFF_INVALID',
    'COMPACT_PARSE',
    'JSON_PARSE',
    'ETAG_MISMATCH',
    'NETWORK',
    'HTTP_STATUS',
    'AUTH_REQUIRED',
    'POLICY_DENIED',
    'RATE_LIMITED',
    'TIMEOUT',
    'CACHE_POISONED',
    'SIGNATURE_INVALID',
  ];

  test('every code has a non-empty default hint', () => {
    for (const c of ALL_CODES) {
      const hint = DEFAULT_HINTS[c];
      assert.equal(typeof hint, 'string', `${c} hint must be a string`);
      assert.ok(hint.length > 10, `${c} hint must be substantive: ${hint}`);
    }
  });

  test('makeError() stamps the default hint when none provided', () => {
    const e = makeError({ code: 'AUTH_REQUIRED', message: 'no creds' });
    assert.equal(e.hint, DEFAULT_HINTS.AUTH_REQUIRED);
  });

  test('makeError() prefers caller-supplied hint over the default', () => {
    const e = makeError({ code: 'RATE_LIMITED', message: 'slow down', hint: 'wait 5s' });
    assert.equal(e.hint, 'wait 5s');
  });

  test('NETWORK / TIMEOUT / RATE_LIMITED default to retryable=true', () => {
    assert.equal(new AHTMLError({ code: 'NETWORK', message: 'x' }).retryable, true);
    assert.equal(new AHTMLError({ code: 'TIMEOUT', message: 'x' }).retryable, true);
    assert.equal(new AHTMLError({ code: 'RATE_LIMITED', message: 'x' }).retryable, true);
  });

  test('SCHEMA_INVALID / AUTH_REQUIRED / POLICY_DENIED default to retryable=false', () => {
    assert.equal(new AHTMLError({ code: 'SCHEMA_INVALID', message: 'x' }).retryable, false);
    assert.equal(new AHTMLError({ code: 'AUTH_REQUIRED', message: 'x' }).retryable, false);
    assert.equal(new AHTMLError({ code: 'POLICY_DENIED', message: 'x' }).retryable, false);
  });

  test('explicit retryable override wins over the default', () => {
    const e = new AHTMLError({ code: 'NETWORK', message: 'x', retryable: false });
    assert.equal(e.retryable, false);
  });

  test('AHTMLError.is() narrows correctly', () => {
    const e: unknown = new AHTMLError({ code: 'RATE_LIMITED', message: 'x' });
    assert.equal(AHTMLError.is(e), true);
    assert.equal(AHTMLError.is(e, 'RATE_LIMITED'), true);
    assert.equal(AHTMLError.is(e, 'NETWORK'), false);
    assert.equal(AHTMLError.is(new Error('x')), false);
    assert.equal(AHTMLError.is(null), false);
    assert.equal(AHTMLError.is('string'), false);
  });

  test('toJSON() emits a stable, logger-friendly shape', () => {
    const e = new AHTMLError({
      code: 'HTTP_STATUS',
      status: 503,
      message: 'unavailable',
      hint: 'retry shortly',
      path: 'entities[0].price',
      retryAfterMs: 1500,
      context: 'https://x.com/p',
      cause: new Error('upstream timeout'),
    });
    const j = e.toJSON();
    assert.deepEqual(j, {
      name: 'AHTMLError',
      code: 'HTTP_STATUS',
      message: 'unavailable',
      status: 503,
      retryable: false,
      hint: 'retry shortly',
      path: 'entities[0].price',
      retryAfterMs: 1500,
      context: 'https://x.com/p',
      cause: { name: 'Error', message: 'upstream timeout' },
    });
  });

  test('toJSON() omits undefined optional fields', () => {
    const e = new AHTMLError({ code: 'TIMEOUT', message: 'x' });
    const j = e.toJSON() as Record<string, unknown>;
    assert.equal(j.hint, undefined);
    assert.equal(j.status, undefined);
    assert.equal(j.path, undefined);
    assert.equal(j.retryAfterMs, undefined);
    assert.equal(j.context, undefined);
    assert.equal(j.cause, undefined);
  });

  test('cause chain preserves the original error', () => {
    const root = new TypeError('json went south');
    const e = new AHTMLError({ code: 'JSON_PARSE', message: 'parse failed', cause: root });
    assert.equal(e.cause, root);
  });
});

describe('validateStrict()', () => {
  test('returns the snapshot on success', () => {
    const s = snapshot('https://x.com', 'home').build();
    const out = validateStrict(s);
    assert.equal(out.url, 'https://x.com');
  });

  test('throws AHTMLError(SCHEMA_INVALID) on the first error', () => {
    const bad = { ahtml: '0.1', entities: [], actions: [] };
    try {
      validateStrict(bad);
      assert.fail('should have thrown');
    } catch (err) {
      assert.ok(AHTMLError.is(err, 'SCHEMA_INVALID'));
      const e = err as AHTMLError;
      assert.match(e.message, /url|fetched_at|page_type/);
      assert.ok(e.hint);
      assert.ok(Array.isArray(e.cause));
    }
  });
});

describe('fromCompact() / fromJson() typed parser errors', () => {
  test('fromJson() throws JSON_PARSE with cause on malformed JSON', () => {
    try {
      fromJson('{ not valid');
      assert.fail('should throw');
    } catch (err) {
      assert.ok(AHTMLError.is(err, 'JSON_PARSE'));
      const e = err as AHTMLError;
      assert.ok(e.hint);
      assert.ok(e.cause instanceof SyntaxError);
    }
  });

  test('fromCompact() rejects non-string input with COMPACT_PARSE', () => {
    try {
      fromCompact(123 as unknown as string);
      assert.fail('should throw');
    } catch (err) {
      assert.ok(AHTMLError.is(err, 'COMPACT_PARSE'));
    }
  });
});

describe('applyDiff() — DIFF_INVALID', () => {
  test('throws InvalidDiffError on malformed change; instanceof AHTMLError holds', () => {
    const prev = snapshot('https://x.com', 'home').build();
    const bad = {
      ahtml: '0.1' as const,
      url: prev.url,
      // missing required product.name — triggers a severity:'error' issue
      changes: [{ op: 'add' as const, entity: { id: 'product:p', type: 'product' as const } as never }],
    };
    try {
      applyDiff(prev, bad);
      assert.fail('should throw');
    } catch (err) {
      // Both legacy and new instanceof checks must work.
      assert.ok(err instanceof InvalidDiffError);
      assert.ok(err instanceof AHTMLError);
      assert.ok(AHTMLError.is(err, 'DIFF_INVALID'));
      const e = err as InvalidDiffError;
      // Back-compat shape preserved
      assert.equal(e.op, 'add');
      assert.ok(Array.isArray(e.reasons));
      assert.ok(e.hint);
    }
  });
});

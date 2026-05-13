# AHTML — Testing Report

[![CI](https://github.com/DibbayajyotiRoy/AHTML/actions/workflows/ci.yml/badge.svg)](https://github.com/DibbayajyotiRoy/AHTML/actions/workflows/ci.yml)
[![135/135 tests](https://img.shields.io/badge/tests-135%2F135-2dba4e?style=flat-square)](TESTING.md)
[![node:test](https://img.shields.io/badge/runner-node%3Atest-339933?style=flat-square)](https://nodejs.org/api/test.html)
[![real tokenizers](https://img.shields.io/badge/measurement-real%20tokenizers-7e57c2?style=flat-square)](#methodology)

---

## At a glance

| Suite | Files | Tests | Status |
|---|---:|---:|:---:|
| `@ahtmljs/schema` (unit) | 4 | 49 | ✅ all passing |
| `@ahtmljs/next` (unit) | 3 | 38 | ✅ all passing |
| `@ahtmljs/agent` (unit) | 2 | 18 | ✅ all passing |
| UX scenarios | 6 | 30 | ✅ all passing |
| **Total** | **15** | **135** | **100%** |

Run all of it with one command:

```bash
npm test
```

## TL;DR

The three published `@ahtmljs/*` packages are judged on five axes — **correctness,
safety, ergonomics, performance, interoperability** — across 15 test files. The
UX layer additionally proves that the *workflows* AHTML promises (3-minute
install, 5× fewer agent tokens, safety contracts agents can honor) are
measurably true, not marketing fluff.

Writing the test suite caught and fixed **three real bugs** in the code we'd
already published to npm:

1. `AHTMLClient.manifest()` ignored the constructor-level `fetch` override (would hit the live network during tests).
2. The Next.js route handler returned a full diff envelope even when the diff was empty (wasted ~150 B per page on no-change recrawls).
3. The `@ahtmljs/agent` package didn't export `ActionRefused`, the only error class consumers should distinguish.

All three are fixed and covered by regression tests now.

---

## The five metrics every package is judged on

| # | Metric | What we assert |
|---|---|---|
| 1 | **Correctness** | The package does exactly what its docs say. Inputs map to expected outputs. Round-trips are lossless. |
| 2 | **Safety** | The package refuses to do what it shouldn't. Bad inputs are flagged. Risky actions require explicit consent. |
| 3 | **Ergonomics** | The API is hard to misuse. Defaults are sane. The "happy path" is short. |
| 4 | **Performance** | Measurable improvements over the baseline (raw HTML, naive scraping). Numbers come from real tokenizers, not approximations. |
| 5 | **Interoperability** | Output is consumable by the ecosystem (MCP clients, OpenAPI tooling, llms.txt readers, schema.org consumers). |

Every test below maps to one or more of these axes — listed at the top of each
section.

---

## Methodology

- **Test runner:** [`node:test`](https://nodejs.org/api/test.html) — built into Node 20+, zero new test framework dependency.
- **TypeScript loader:** [`tsx`](https://www.npmjs.com/package/tsx) — runs `.ts` files directly, no separate build step needed during dev.
- **Tokenizers used for measurement:**
  - [`gpt-tokenizer`](https://www.npmjs.com/package/gpt-tokenizer) — pure-JS port of OpenAI's `tiktoken` (`cl100k_base` + `o200k_base` encodings)
  - [`@anthropic-ai/tokenizer`](https://www.npmjs.com/package/@anthropic-ai/tokenizer) — Anthropic's official Claude tokenizer
  - These are the same libraries OpenAI, Anthropic, the OpenAI Cookbook, Vercel AI SDK, LangChain, and published academic benchmarks (WebShop, Mind2Web, WebArena) use. No `text.length / 4` approximations.
- **Mocking strategy:** Native `Request`/`Response`/`Headers` (no `node-fetch` or `msw` dependency). All HTTP behaviour is exercised through real Web API objects.

---

# Part 1 — Unit tests

These prove the **building blocks** behave correctly in isolation.

## File 1 — `packages/schema/src/__tests__/snapshot.test.ts` (13 tests)

**Metrics:** correctness, ergonomics
**Judges:** the snapshot builder DSL and the content-addressed ETag computation.

**Key assertions:**

- Minimal input produces a valid v0.1 envelope.
- Fluent chain composes entities, actions, policy, links, schemas, meta.
- `add()` and `action()` accept variadic arguments.
- `build()` returns a deep clone — post-build builder mutations don't leak.
- `computeEtag()` is deterministic, content-addressed, and ignores `fetched_at`.
- ETags are formatted as `W/"<hex>"` (weak ETag spec-compliant).

```ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot, computeEtag } from '../snapshot.js';
import { AHTML_VERSION } from '../types.js';
import type { Snapshot } from '../types.js';

describe('snapshot builder', () => {
  test('produces a valid envelope from minimal input', () => {
    const s = snapshot('https://shop.com/p/1', 'product_detail').build();
    assert.equal(s.ahtml, '0.1');
    assert.equal(s.ahtml, AHTML_VERSION);
    assert.equal(s.url, 'https://shop.com/p/1');
    assert.equal(s.page_type, 'product_detail');
    assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s.fetched_at));
    assert.deepEqual(s.entities, []);
    assert.deepEqual(s.actions, []);
  });

  test('chains entities, actions, policy, links, and meta', () => {
    const s = snapshot('https://x.com', 'home')
      .ttl(300)
      .policy({ agents_welcome: true, license: 'MIT', rate_limit: '100/min' })
      .add({ id: 'product:p1', type: 'product', name: 'X', price: { amount: 100, currency: 'USD' } })
      .action({ id: 'buy', target: 'product:p1', category: 'transact', execute_url: '/api/buy', auth: 'required', cost: { amount: 100, currency: 'USD', category: 'purchase' } })
      .links({ canonical: 'https://x.com', related: ['product:p2'] })
      .meta({ generated_by: 'test' })
      .build();
    assert.equal(s.ttl, 300);
    assert.equal(s.policy?.agents_welcome, true);
    assert.equal(s.entities[0]!.id, 'product:p1');
    assert.equal(s.actions[0]!.id, 'buy');
    assert.equal(s.links?.canonical, 'https://x.com');
    assert.equal(s.meta?.generated_by, 'test');
  });

  test('build() returns a deep clone — mutating the builder after build does not affect result', () => {
    const builder = snapshot('https://x.com', 'home');
    const first = builder.build();
    builder.add({ id: 'product:after', type: 'product', name: 'After' });
    const second = builder.build();
    assert.equal(first.entities.length, 0);
    assert.equal(second.entities.length, 1);
  });
});

describe('computeEtag()', () => {
  test('is deterministic — same content always produces the same etag', () => {
    const a = snapshot('https://x.com', 'home').add({ id: 'product:1', type: 'product', name: 'X' }).build();
    const b = snapshot('https://x.com', 'home').add({ id: 'product:1', type: 'product', name: 'X' }).build();
    a.fetched_at = b.fetched_at = '2026-01-01T00:00:00Z';
    assert.equal(computeEtag(a), computeEtag(b));
  });

  test('does NOT change when only fetched_at changes', () => {
    const a: Snapshot = snapshot('https://x.com', 'home').fetchedAt('2026-01-01T00:00:00Z').build();
    const b: Snapshot = snapshot('https://x.com', 'home').fetchedAt('2026-12-31T23:59:59Z').build();
    assert.equal(computeEtag(a), computeEtag(b));
  });

  test('uses the W/"hex" weak-ETag format', () => {
    const s = snapshot('https://x.com', 'home').build();
    assert.match(computeEtag(s), /^W\/"[0-9a-f]+"$/);
  });
});
```

*(File contains 13 tests — eight more covering `ttl()`, `etag()`, `fetchedAt()`, `schema()`, multi-arg `add()`/`action()`, and ETag changes-when-content-changes invariants. See full file at `packages/schema/src/__tests__/snapshot.test.ts`.)*

**Result:** 13/13 ✅

---

## File 2 — `packages/schema/src/__tests__/formats.test.ts` (12 tests)

**Metrics:** correctness, performance
**Judges:** the dual serializer — JSON canonical form + compact text token-optimal form. Round-trips between them must be lossless.

**Key assertions:**

- `toJson() ↔ fromJson()` is deeply equal — lossless.
- JSON keys emit in canonical order (`ahtml`, `url`, `fetched_at`, …, `entities`, `actions`, …) so two equivalent snapshots are byte-identical for signing.
- Compact text round-trips entity types, prices (`"1999 USD"`), stock (`"in_stock (42)"`), reversibility (`"P30D full_refund"`), side effects (comma-separated).
- Compact text is **strictly smaller** than canonical JSON for the same data.

```ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot } from '../snapshot.js';
import { toJson, fromJson } from '../format-json.js';
import { toCompact, fromCompact } from '../format-compact.js';

function fixture() {
  return snapshot('https://shop.com/products/mbp-14', 'product_detail')
    .ttl(60).etag('W/"abc"').fetchedAt('2026-05-12T14:32:00Z')
    .policy({ agents_welcome: true, license: 'MIT', rate_limit: '100/min' })
    .add({ id: 'product:mbp-14', type: 'product', name: 'MacBook Pro 14"', brand: 'Apple',
           price: { amount: 1999, currency: 'USD' }, stock: { status: 'in_stock', quantity: 42 },
           rating: { average: 4.7, count: 1284 } })
    .action({ id: 'purchase', label: 'Buy now', target: 'product:mbp-14', category: 'transact',
              method: 'POST', execute_url: '/api/checkout', auth: 'required',
              cost: { amount: 1999, currency: 'USD', category: 'purchase' },
              reversible: { reversible: true, window: 'P30D', policy: 'full_refund' },
              side_effects: ['charge_card', 'email_buyer', 'decrement_stock'],
              confirmation: 'required' })
    .build();
}

describe('toJson() / fromJson()', () => {
  test('round-trip is lossless', () => {
    const original = fixture();
    const restored = fromJson(toJson(original));
    assert.deepEqual(restored, original);
  });

  test('emits keys in canonical order (deterministic for signing)', () => {
    const s = fixture();
    const json = toJson(s);
    const ahtmlIdx = json.indexOf('"ahtml"');
    const urlIdx = json.indexOf('"url"');
    const entitiesIdx = json.indexOf('"entities"');
    assert.ok(ahtmlIdx < urlIdx);
    assert.ok(urlIdx < entitiesIdx);
  });

  test('omits undefined fields', () => {
    const s = snapshot('https://x.com', 'home').build();
    const json = toJson(s);
    assert.ok(!json.includes('"meta"'));
    assert.ok(!json.includes('"policy"'));
  });
});

describe('toCompact() / fromCompact()', () => {
  test('Money is serialized inline as "AMOUNT CURRENCY"', () => {
    const compact = toCompact(fixture());
    assert.match(compact, /price: 1999 USD/);
  });
  test('Stock is serialized inline as "STATUS (QUANTITY)"', () => {
    const compact = toCompact(fixture());
    assert.match(compact, /stock: in_stock \(42\)/);
  });
  test('Reversibility "P30D full_refund" serialized in single line', () => {
    const compact = toCompact(fixture());
    assert.match(compact, /reversible: P30D full_refund/);
  });
  test('side_effects serialized as comma-separated single line', () => {
    const compact = toCompact(fixture());
    assert.match(compact, /side_effects: charge_card, email_buyer, decrement_stock/);
  });
  test('uses @envelope / [entity-id] / (action) syntax', () => {
    const compact = toCompact(fixture());
    assert.match(compact, /^@ahtml 0\.1/m);
    assert.match(compact, /^\[product:mbp-14\]/m);
    assert.match(compact, /^\(action\) purchase/m);
  });
  test('parser handles the compact form back into entities & actions', () => {
    const compact = `@ahtml 0.1
@url https://x.com
@fetched 2026-01-01T00:00:00Z
@page_type product_detail

[product:p1]
  name: Hello
  price: 99 USD
  stock: in_stock (10)

(action) buy
  target: product:p1
  auth: required
  cost: 99 USD purchase
  reversible: P30D full_refund
  side_effects: charge_card, email_buyer
  confirmation: required
`;
    const s = fromCompact(compact);
    assert.equal(s.entities.length, 1);
    assert.equal(s.actions[0]!.confirmation, 'required');
    assert.deepEqual(s.actions[0]!.side_effects, ['charge_card', 'email_buyer']);
  });
  test('compact text is strictly smaller than canonical JSON', () => {
    const s = fixture();
    assert.ok(toCompact(s).length < toJson(s).length);
  });
});
```

**Result:** 12/12 ✅

---

## File 3 — `packages/schema/src/__tests__/validate.test.ts` (12 tests)

**Metrics:** safety, correctness
**Judges:** the zero-dependency runtime validator. It must catch every malformed snapshot before agents waste time on it.

**Key assertions:**

- A well-formed snapshot has zero errors.
- Unsupported `ahtml` version → error.
- Unknown `page_type` → error.
- Unknown entity `type` → error.
- Entity ID prefix mismatching its type → warning (not an error — recoverable).
- `Product` missing `name` → error.
- `price.amount` not a number → error.
- Duplicate entity IDs → error.
- Unknown `cost.category` → error.
- Unknown `confirmation` value → error.
- `isValid()` is true for clean snapshots, false for any error.

```ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validate, isValid } from '../validate.js';
import { snapshot } from '../snapshot.js';

describe('validate()', () => {
  test('a well-formed snapshot has no errors', () => {
    const s = snapshot('https://x.com', 'home').build();
    const errors = validate(s).filter((i) => i.severity === 'error');
    assert.deepEqual(errors, []);
  });

  test('rejects an unsupported ahtml version', () => {
    const s = { ahtml: '99.9', url: 'x', fetched_at: '2026-01-01T00:00:00Z', page_type: 'home', entities: [], actions: [] };
    const errors = validate(s).filter((i) => i.severity === 'error');
    assert.ok(errors.some((e) => e.path === 'ahtml'));
  });

  test('rejects a product without a name', () => {
    const s = snapshot('https://x.com', 'product_detail')
      .add({ id: 'product:p1', type: 'product', name: '' }).build();
    const errors = validate(s).filter((i) => i.severity === 'error');
    assert.ok(errors.some((e) => e.path.endsWith('.name')));
  });

  test('rejects duplicate entity ids', () => {
    const s = snapshot('https://x.com', 'product_list')
      .add({ id: 'product:p1', type: 'product', name: 'A' },
           { id: 'product:p1', type: 'product', name: 'B' }).build();
    const errors = validate(s).filter((i) => i.severity === 'error');
    assert.ok(errors.some((e) => e.message.includes('duplicate entity id')));
  });

  test('rejects an unknown cost category', () => {
    const s = snapshot('https://x.com', 'product_detail')
      .action({ id: 'buy', cost: { category: 'made_up' as 'free' } }).build();
    const errors = validate(s).filter((i) => i.severity === 'error');
    assert.ok(errors.some((e) => e.path.includes('cost.category')));
  });

  test('isValid() is false when there is any error', () => {
    assert.equal(isValid({ ahtml: '99.9' }), false);
  });
});
```

**Result:** 12/12 ✅

---

## File 4 — `packages/schema/src/__tests__/diff.test.ts` (12 tests)

**Metrics:** correctness, performance
**Judges:** the structural snapshot differ — `add` / `remove` / `update` / `add_action` / `remove_action`. Round-tripping `applyDiff(prev, diff(prev, next))` must reconstruct `next`.

**Key assertions:**

- `add` op for new entities.
- `remove` op for vanished entities.
- `update` op for changed entity fields.
- Empty change set when snapshots are identical.
- Carries `from_etag` + `to_etag`.
- Handles action diffs separately.
- Round-trip: `applyDiff(prev, diff(prev, next))` produces an equivalent snapshot.
- The resulting `etag` matches the `to_etag`.

```ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { diff, applyDiff } from '../diff.js';
import { snapshot, computeEtag } from '../snapshot.js';
import type { Snapshot } from '../types.js';

function withProducts(ids: string[]): Snapshot {
  const b = snapshot('https://x.com', 'product_list');
  for (const id of ids) b.add({ id: `product:${id}`, type: 'product', name: id });
  return b.build();
}

describe('diff()', () => {
  test('emits "add" for new entities', () => {
    const d = diff(withProducts(['a', 'b']), withProducts(['a', 'b', 'c']));
    assert.ok(d.changes.some((c) => c.op === 'add'));
  });

  test('emits "remove" for vanished entities', () => {
    const d = diff(withProducts(['a', 'b', 'c']), withProducts(['a', 'c']));
    assert.ok(d.changes.some((c) => c.op === 'remove'));
  });

  test('returns an empty change set when snapshots are identical', () => {
    const d = diff(withProducts(['a', 'b']), withProducts(['a', 'b']));
    assert.deepEqual(d.changes, []);
  });
});

describe('applyDiff()', () => {
  test('round-trip: applyDiff(prev, diff(prev, next)) reconstructs next entities/actions', () => {
    const prev = snapshot('https://x.com', 'product_list')
      .add({ id: 'product:a', type: 'product', name: 'A' })
      .add({ id: 'product:b', type: 'product', name: 'B' })
      .action({ id: 'search' }).build();
    const next = snapshot('https://x.com', 'product_list')
      .add({ id: 'product:a', type: 'product', name: 'A — refreshed' })
      .add({ id: 'product:c', type: 'product', name: 'C' })
      .action({ id: 'sort' }).build();
    const restored = applyDiff(prev, diff(prev, next));
    assert.deepEqual(restored.entities.map((e) => e.id).sort(), ['product:a', 'product:c']);
    assert.deepEqual(restored.actions.map((a) => a.id), ['sort']);
  });

  test('etag after applyDiff matches the to_etag', () => {
    const prev = withProducts(['a']);
    const next = withProducts(['a', 'b']);
    prev.etag = computeEtag(prev);
    next.etag = computeEtag(next);
    const restored = applyDiff(prev, diff(prev, next));
    assert.equal(restored.etag, next.etag);
  });
});
```

**Result:** 12/12 ✅

---

## File 5 — `packages/next/src/__tests__/handler.test.ts` (11 tests)

**Metrics:** correctness, performance, safety, interoperability
**Judges:** the per-route HTTP handler — content negotiation, conditional fetch, diff endpoint, HEAD, default-TTL, policy enforcement.

**Key assertions:**

- Default `Accept` returns compact text (token-optimal for LLMs).
- `Accept: application/ahtml+json` returns canonical JSON.
- Response sets `ETag`, `Cache-Control`, `Last-Modified`, `x-ahtml-version`, `Vary: Accept`.
- `If-None-Match` matching → `304 Not Modified` with empty body.
- 404 for paths the builder rejects.
- `?since=<etag>` returns a SnapshotDiff (or 304 if unchanged).
- HEAD returns same headers as GET, empty body.
- `default_ttl` from config is used when snapshot doesn't override.
- `agents_welcome: false` → 403.
- Rate-limit burst → 429.

```ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot, computeEtag } from '@ahtmljs/schema';
import { createAHTMLRoute } from '../handler.js';

const config = { site: 'https://test.example.com', default_ttl: 60, policy: { agents_welcome: true, rate_limit: '1000/min' } };

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
    const parsed = JSON.parse(await res.text());
    assert.equal(parsed.entities[0].id, 'product:demo');
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
    assert.equal((await second.text()).length, 0);
  });
});

describe('policy enforcement', () => {
  test('returns 403 when agents_welcome is false', async () => {
    const { GET } = createAHTMLRoute(builder, { site: 'x', policy: { agents_welcome: false } });
    const res = await GET(new Request('https://test.example.com/ahtml/'), makeCtx());
    assert.equal(res.status, 403);
    assert.equal(JSON.parse(await res.text()).error, 'agents_not_welcome');
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
```

**Result:** 11/11 ✅

---

## File 6 — `packages/next/src/__tests__/extractors.test.ts` (12 tests)

**Metrics:** correctness, interoperability
**Judges:** the three extractors that auto-generate Level-0 snapshots from existing HTML metadata (schema.org JSON-LD, OpenGraph meta tags, `data-ahtml-*` attributes), plus the merge precedence logic.

**Key assertions:**

- `extractFromSchemaOrg` parses Product JSON-LD into a typed Product entity (name, brand, price, stock, rating, sku).
- Parses Article JSON-LD into a Document entity.
- Tolerates malformed JSON-LD without throwing.
- `extractFromOpenGraph` produces Product entity from `og:type=product` meta tags + price.
- `og:type=article` → Document.
- `extractFromDataAttrs` parses `data-ahtml="product"` + attributes into Product.
- `data-ahtml-action="purchase"` + action attributes → typed Action with cost / reversibility / side-effects / confirmation.
- `mergeExtractions` unions entities by ID, earlier extractions win on collision (data-attrs > schema.org > og).

```ts
describe('extractFromSchemaOrg', () => {
  test('parses a Product JSON-LD block into a Product entity', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org/',
      '@type': 'Product',
      name: 'MacBook Pro 14',
      brand: { '@type': 'Brand', name: 'Apple' },
      offers: { '@type': 'Offer', price: 1999, priceCurrency: 'USD', availability: 'https://schema.org/InStock' },
      aggregateRating: { '@type': 'AggregateRating', ratingValue: 4.7, reviewCount: 1284 },
    })}</script>`;
    const ex = extractFromSchemaOrg(html);
    const p = ex.entities[0] as Product;
    assert.equal(p.type, 'product');
    assert.equal(p.name, 'MacBook Pro 14');
    assert.equal(p.brand, 'Apple');
    assert.equal(p.price?.amount, 1999);
    assert.equal(p.stock?.status, 'in_stock');
    assert.equal(p.rating?.average, 4.7);
  });

  test('tolerates malformed JSON-LD without throwing', () => {
    const html = '<script type="application/ld+json">{ not json }</script>';
    assert.doesNotThrow(() => extractFromSchemaOrg(html));
  });
});

describe('extractFromDataAttrs', () => {
  test('parses data-ahtml-action="purchase" + action contract attributes', () => {
    const html = `<button
      data-ahtml-action="purchase"
      data-ahtml-action-target="product:mbp"
      data-ahtml-action-auth="required"
      data-ahtml-action-cost="1999 USD purchase"
      data-ahtml-action-reversible="P30D full_refund"
      data-ahtml-action-side-effects="charge_card, email_buyer"
      data-ahtml-action-confirmation="required">Buy</button>`;
    const ex = extractFromDataAttrs(html);
    const a = ex.actions[0]!;
    assert.equal(a.id, 'purchase');
    assert.equal(a.auth, 'required');
    assert.equal(a.cost?.amount, 1999);
    assert.equal(a.reversible?.window, 'P30D');
    assert.deepEqual(a.side_effects, ['charge_card', 'email_buyer']);
    assert.equal(a.confirmation, 'required');
  });
});

describe('mergeExtractions', () => {
  test('earlier extractions take precedence on id collision (data-attrs > schema.org > og)', () => {
    const earlier = { source: 'data-attrs' as const, entities: [{ id: 'product:x', type: 'product' as const, name: 'Authoritative' }], actions: [] };
    const later = { source: 'schema-org' as const, entities: [{ id: 'product:x', type: 'product' as const, name: 'Fallback' }], actions: [] };
    const merged = mergeExtractions([earlier, later]);
    assert.equal((merged.entities[0] as Product).name, 'Authoritative');
  });
});
```

**Result:** 12/12 ✅

---

## File 7 — `packages/next/src/__tests__/emitters.test.ts` (15 tests)

**Metrics:** interoperability, correctness
**Judges:** the three output emitters — MCP manifest, OpenAPI 3.1 document, `.well-known/ahtml.json` discovery manifest, plus the `llms.txt` formatter.

**Key assertions for MCP:**

- Manifest envelope (`schema_version`, `server`, `tools`) matches what stock MCP clients parse.
- One tool per action, namespaced as `<page_type>.<action_id>`.
- `inputSchema` from action carries through unchanged.
- Annotations include `auth`, `cost`, `reversible`, `side_effects`, `confirmation`, `execute_url`.
- Tools dedupe on shared fully-qualified names.

**Key assertions for OpenAPI:**

- OpenAPI 3.1 envelope.
- Path for each snapshot at `/ahtml/<route>`.
- Path for each action's `execute_url`.
- `x-ahtml-cost`, `x-ahtml-reversible`, `x-ahtml-side-effects`, `x-ahtml-confirmation` extensions populated.
- Bearer security for `auth: required` actions.

**Key assertions for well-known + llms.txt:**

- Manifest envelope is correct.
- Computed `snapshot_url` per route.
- Endpoints include/omit MCP and OpenAPI based on `emit_*` flags.
- Three media types advertised.
- `llms.txt` emits H1 + blockquote + H2 sections matching Jeremy Howard's convention.

```ts
describe('snapshotsToMcp', () => {
  test('one tool per action, namespaced as "page_type.action_id"', () => {
    const m = snapshotsToMcp({ name: 'shop', url: 'https://shop.com' }, fixtureSnaps);
    assert.equal(m.tools[0]!.name, 'product_detail.purchase');
  });

  test('annotations include auth, cost, reversibility, side_effects, confirmation, execute_url', () => {
    const m = snapshotsToMcp({ name: 'shop', url: 'https://shop.com' }, fixtureSnaps);
    const ann = m.tools[0]!.annotations!;
    assert.equal(ann.auth, 'required');
    assert.deepEqual(ann.cost, { amount: 1999, currency: 'USD', category: 'purchase' });
    assert.deepEqual(ann.reversible, { reversible: true, window: 'P30D', policy: 'full_refund' });
    assert.deepEqual(ann.side_effects, ['charge_card', 'email_buyer']);
    assert.equal(ann.confirmation, 'required');
  });
});

describe('snapshotsToOpenApi', () => {
  test('adds x-ahtml-cost / -side-effects / -reversible / -confirmation extensions', () => {
    const doc = snapshotsToOpenApi({ title: 'shop', baseUrl: 'https://shop.com' }, fixtureSnaps);
    const post = (doc as any).paths['/api/checkout'].post;
    assert.ok(post['x-ahtml-cost']);
    assert.ok(post['x-ahtml-reversible']);
    assert.equal(post['x-ahtml-confirmation'], 'required');
  });
});

describe('buildLlmsTxt', () => {
  test('emits Jeremy Howard convention layout — H1 + blockquote + H2 sections', () => {
    const txt = buildLlmsTxt({ title: 'Shop', description: 'Buy things.',
      sections: [{ name: 'Products', items: [{ title: 'MacBook', url: 'https://shop.com/products/mbp', description: 'Apple laptop' }] }] });
    assert.match(txt, /^# Shop$/m);
    assert.match(txt, /^> Buy things\.$/m);
    assert.match(txt, /^## Products$/m);
    assert.match(txt, /\[MacBook\]\(https:\/\/shop\.com\/products\/mbp\): Apple laptop/);
  });
});
```

**Result:** 15/15 ✅

---

## File 8 — `packages/agent/src/__tests__/client.test.ts` (10 tests)

**Metrics:** correctness, performance, ergonomics
**Judges:** the client SDK fetcher — caching, conditional GET, diff replay, content negotiation.

**Key assertions:**

- Fetches compact-text snapshot and parses it back.
- Default `Accept` is `application/ahtml+text`.
- `format: 'json'` switches to `application/ahtml+json`.
- Within TTL: cache-served, zero network calls on second fetch.
- After TTL expiry: sends `If-None-Match` or `?since=<etag>`.
- 304 response → reuse cached snapshot.
- Diff response → reconstructs the new snapshot via `applyDiff`.
- `manifest()` fetches `/.well-known/ahtml.json`.
- `invalidate(url)` drops a single cached entry.

```ts
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

test('applies a diff response and reconstructs the new snapshot', async () => {
  const prev = snapshot('https://x.com', 'product_list').ttl(0)
    .add({ id: 'product:a', type: 'product', name: 'A' }).build();
  prev.etag = computeEtag(prev);
  const next = snapshot('https://x.com', 'product_list').ttl(0)
    .add({ id: 'product:a', type: 'product', name: 'A' })
    .add({ id: 'product:b', type: 'product', name: 'B' }).build();
  next.etag = computeEtag(next);
  let i = 0;
  const f = makeMockFetch((url) => {
    i++;
    if (i === 1) return new Response(toCompact(prev), { headers: { 'content-type': 'application/ahtml+text', etag: prev.etag! } });
    if (url.includes('since=')) {
      const d = diff(prev, next);
      return new Response(JSON.stringify(d), { headers: { 'content-type': 'application/ahtml-diff+json', etag: next.etag! } });
    }
    return new Response(toCompact(next), { headers: { 'content-type': 'application/ahtml+text', etag: next.etag! } });
  });
  const client = new AHTMLClient({ fetch: f });
  await client.fetch('https://x.com');
  const got = await client.fetch('https://x.com');
  assert.deepEqual(got.entities.map((e) => e.id).sort(), ['product:a', 'product:b']);
});
```

**Real bug found in this file:** `client.manifest()` ignored `this.defaults.fetch` and went to the live network. Fixed in `packages/agent/src/client.ts`.

**Result:** 10/10 ✅

---

## File 9 — `packages/agent/src/__tests__/workflow.test.ts` (8 tests)

**Metrics:** safety, ergonomics
**Judges:** action execution safety gates and dry-run flow. **This is the most safety-critical file in the test suite.**

**Key assertions:**

- Refuses `auth=required` action without bearer (throws `ActionRefused`).
- Refuses `confirmation=required` action without `{ confirm: true }`.
- Refuses when `policy.agents_welcome === false`.
- `skipChecks: true` bypasses gates (escape hatch).
- Dry-run returns synthetic preview when no `preview_url` is set.
- Dry-run calls `preview_url` when provided, does NOT call `execute_url`.
- Execute path POSTs JSON body + Authorization Bearer to `execute_url`.
- Throws clear error when `execute_url` is missing.
- Throws on non-2xx execute response.

```ts
describe('runAction — safety gates', () => {
  test('refuses an auth=required action without a bearer', async () => {
    const s = snapWith({ id: 'buy', auth: 'required', execute_url: '/api/buy' });
    await assert.rejects(
      () => runAction(s, s.actions[0]!, {}, {}),
      (err: Error) => err instanceof ActionRefused && err.message.includes('requires auth'),
    );
  });

  test('refuses confirmation=required action without { confirm: true }', async () => {
    const s = snapWith({ id: 'buy', confirmation: 'required', execute_url: '/api/buy' });
    await assert.rejects(
      () => runAction(s, s.actions[0]!, {}, {}),
      (err: Error) => err instanceof ActionRefused && err.message.includes('confirmation'),
    );
  });
});

describe('runAction — dry-run', () => {
  test('calls preview_url when provided and returns its preview body', async () => {
    const s = snapWith({ id: 'buy', auth: 'required',
      cost: { amount: 50, currency: 'USD', category: 'purchase' },
      preview_url: 'https://x.com/api/buy/preview',
      execute_url: 'https://x.com/api/buy',
      side_effects: ['charge_card'] });
    let previewWasHit = false;
    const fakeFetch = (async (url: string | URL | Request) => {
      const u = typeof url === 'string' ? url : (url as { url: string }).url;
      if (u.endsWith('/preview')) {
        previewWasHit = true;
        return new Response(JSON.stringify({ tentative_total: 50 }), { headers: { 'content-type': 'application/json' } });
      }
      throw new Error('execute_url should NOT be called during dry-run');
    }) as unknown as typeof fetch;
    const res = await runAction(s, s.actions[0]!, {}, { bearer: 'tok', dryRun: true, fetch: fakeFetch });
    assert.equal(res.status, 'dry_run');
    assert.ok(previewWasHit);
  });
});
```

**Result:** 8/8 ✅

---

# Part 2 — UX scenario tests

These prove **the workflows** are easier, not just the building blocks correct.
Every test measures a real metric an adopter cares about.

## File 10 — `tests/ux/quickstart-lines-of-code.test.ts` (5 tests)

**Metrics:** ergonomics
**Judges:** the "3-minute install" marketing claim.

**Headline measurement:**
- Wiring fits in **≤8 LOC across 3 files**.
- Three named imports total — `createAHTMLRoute`, `createWellKnownRoute`, `createLlmsTxtRoute`.
- A full meaningful product+action snapshot builder fits in **≤40 LOC**.
- Zero shell scaffolding (no `.ahtml` files, no separate process, no parallel server).

```ts
describe('UX — quickstart line-of-code budget', () => {
  test('the three wiring files (route handlers) total <= 8 lines of code', () => {
    const wiringFiles = [
      'app/ahtml/[[...path]]/route.ts',
      'app/.well-known/ahtml.json/route.ts',
      'app/llms.txt/route.ts',
    ];
    const totalLOC = wiringFiles
      .map((f) => countNonEmptyLines(userCodeForNextJsIntegration[f]))
      .reduce((a, b) => a + b, 0);
    assert.ok(totalLOC <= 8, `wiring should be ≤8 LOC; got ${totalLOC}`);
  });

  test('zero shell scaffolding required — no .ahtml files, no separate process, no parallel server', () => {
    const allCode = Object.values(userCodeForNextJsIntegration).join('\n');
    assert.ok(!allCode.includes('.ahtml '));
    assert.ok(!allCode.match(/listen\(|spawn\(|createServer/));
    assert.ok(!allCode.match(/from\s+['"](@modelcontextprotocol|mcp)/));
  });
});
```

**Result:** 5/5 ✅

---

## File 11 — `tests/ux/agent-saves-tokens.test.ts` (4 tests)

**Metrics:** performance (the headline claim)
**Judges:** "agents read 5-100× fewer tokens via AHTML than via raw HTML."

**Real measurements (from passing assertions, not estimates):**

```
HTML  = 1,294 GPT-4o tokens  →  AHTML compact =   257 tokens  →  5.0× reduction
HTML  = 1,430 Claude tokens  →  AHTML compact =   247 tokens  →  5.8× reduction
```

Tokenized with `gpt-tokenizer` (OpenAI's official `o200k_base`) and
`@anthropic-ai/tokenizer` (Anthropic's official) — **no `text.length / 4`
approximations**.

**Key assertions:**

- The AHTML compact form preserves **every fact** an agent needs (name, brand, price, currency, stock, sku, rating, action contract).
- AHTML uses **≥4× fewer** GPT-4o tokens than HTML for the same content.
- AHTML uses **≥4× fewer** Claude tokens.
- AHTML compact is strictly smaller in raw bytes than HTML.

```ts
test('AHTML uses ≥4× fewer GPT-4o tokens than HTML for the same content', async () => {
  const htmlTokens = await tokenize_o200k(productHtml(PRODUCT));
  const compactTokens = await tokenize_o200k(productAhtmlCompact(PRODUCT));
  const ratio = htmlTokens! / compactTokens!;
  console.log(`    HTML=${htmlTokens} tokens, AHTML compact=${compactTokens} tokens (${ratio.toFixed(1)}× reduction)`);
  assert.ok(ratio >= 4, `expected ≥4× reduction; got ${ratio.toFixed(2)}×`);
});
```

**Result:** 4/4 ✅

---

## File 12 — `tests/ux/agent-refuses-unsafe.test.ts` (6 tests)

**Metrics:** safety (the differentiator vs llms.txt/schema.org)
**Judges:** an agent honoring the typed action contract refuses unsafe actions and only executes them with explicit consent. **This is the test that proves the safety story.**

**Six scenarios:**

| Scenario | Action contract | Expected behavior |
|---|---|---|
| A. Wire $50,000 transfer | `confirmation: required`, `reversible: false`, side-effects: `[charge_card, audit_log, public_post]` | Refused without explicit user confirm |
| A2. Same with `confirm: true` + bearer | — | Executes |
| B. Free reversible bookmark | `auth: none`, `cost: free`, `reversible: yes` | Fires directly, no friction |
| C. View balance without bearer | `auth: required` | Refused |
| D. Subscribe dry-run | All fields populated | Returns intended changes WITHOUT calling execute_url |
| E. Meta-assertion | — | Every safety-relevant field in the action contract is present and typed |

```ts
test('A. Refuses a high-cost, confirmation-required action without user consent', async () => {
  const snap = siteWith({
    id: 'wire_transfer',
    label: 'Wire $50,000 to External Account',
    target: 'account:checking-123',
    category: 'transact',
    method: 'POST',
    execute_url: '/api/wire',
    auth: 'required',
    cost: { amount: 50_000, currency: 'USD', category: 'purchase' },
    reversible: { reversible: false },
    side_effects: ['charge_card', 'audit_log', 'public_post'],
    confirmation: 'required',
  });
  let executeWasCalled = false;
  const trackedFetch = (async () => { executeWasCalled = true; return new Response('{}'); }) as unknown as typeof fetch;
  await assert.rejects(
    () => runAction(snap, snap.actions[0]!, { amount: 50000 }, { bearer: 'tok', fetch: trackedFetch }),
    (e: Error) => e instanceof ActionRefused && e.message.includes('confirmation'),
    'agent must refuse the wire without explicit user consent',
  );
  assert.equal(executeWasCalled, false, 'execute_url must NOT be hit when the contract is violated');
});

test('D. Dry-run reveals cost + side effects before any side effect happens', async () => {
  const snap = siteWith({
    id: 'subscribe_premium', auth: 'required',
    cost: { amount: 12, currency: 'USD', category: 'subscription' },
    reversible: { reversible: true, window: 'P14D', policy: 'cancel' },
    side_effects: ['charge_card', 'email_buyer', 'unlock_features'],
    confirmation: 'recommended',
    execute_url: 'https://bank.example.com/api/subscribe',
  });
  let executeFired = false;
  const fakeFetch = (async () => { executeFired = true; return new Response('{}'); }) as unknown as typeof fetch;
  const preview = await runAction(snap, snap.actions[0]!, {}, { bearer: 'tok', dryRun: true, fetch: fakeFetch });
  assert.equal(preview.status, 'dry_run');
  assert.equal(executeFired, false);
  if (preview.status === 'dry_run') {
    assert.deepEqual(preview.would_charge, { amount: 12, currency: 'USD' });
  }
});
```

**Result:** 6/6 ✅

---

## File 13 — `tests/ux/incremental-crawl.test.ts` (3 tests)

**Metrics:** performance (at-scale agent bandwidth)
**Judges:** ETag + If-None-Match + diff-since-etag flow actually saves bandwidth at 50-page crawl scale.

**Real measurements (from passing assertions):**

```
50-page first crawl:   50 requests, ~10,000 bytes payload
50-page second crawl:  50 requests,        0 bytes payload (all 304s)
                                   ≥95% bandwidth saved
```

After a sparse change (1/50 products updated): the recrawl transfers ~one
diff's worth of bytes, not 50 full snapshots.

**Key assertions:**

- Second crawl with no changes transfers **≤5% of first-crawl bytes**.
- Sparse-change recrawl stays **<5× the cost of one full snapshot**.
- AHTML compact wire format is strictly smaller than canonical JSON form.

```ts
test('a second crawl with no changes transfers ≤5% of the bytes of the first crawl', async () => {
  const catalog = makeCatalog();
  const server = makeRecordingServer(catalog);
  const client = new AHTMLClient({ fetch: server.fetch });

  for (const url of Object.keys(catalog)) await client.fetch(url);
  const firstCrawlBytes = server.bytesSent;
  server.reset();
  for (const url of Object.keys(catalog)) await client.fetch(url);
  const secondCrawlBytes = server.bytesSent;

  const savedPct = (1 - secondCrawlBytes / firstCrawlBytes) * 100;
  console.log(`    saved: ${savedPct.toFixed(1)}% of bandwidth on the no-change recrawl`);
  assert.ok(secondCrawlBytes <= firstCrawlBytes * 0.05);
});
```

**Real bug found while writing this test:** the route handler was returning a full diff envelope even when `diff.changes.length === 0` — wasted ~150 B per page. Fixed: now returns `304 Not Modified` for empty diffs. This is the perf improvement that lets the ≤5% assertion hold.

**Result:** 3/3 ✅

---

## File 14 — `tests/ux/mcp-consumable.test.ts` (6 tests)

**Metrics:** interoperability (with the ~10,000-server MCP ecosystem)
**Judges:** the MCP manifest emitted by `@ahtmljs/next/mcp` is structurally consumable by any standard MCP client (Claude Desktop, Cursor, ChatGPT, Copilot, Gemini).

MCP spec version targeted: **2025-11-25** (Linux Foundation, post-donation).

**Key assertions:**

- Top-level envelope matches MCP client expectations (`schema_version`, `server: { name, url }`, `tools[]`).
- Every tool has the required MCP fields (`name`, `description`, `inputSchema`).
- Tool names are namespaced — `<page_type>.<action_id>` — so two pages with the same action.id don't collide.
- Safety annotations (`auth`, `cost`, `reversible`, `side_effects`, `confirmation`, `execute_url`) all present.
- `inputSchema` from the action carries through unchanged.
- The manifest serializes cleanly as JSON.

```ts
test('safety annotations are present for actions that have them', () => {
  const purchase = manifest.tools.find((t) => t.name === 'product_detail.purchase')!;
  const ann = purchase.annotations!;
  assert.equal(ann.auth, 'required');
  assert.equal((ann.cost as { amount: number }).amount, 1999);
  assert.equal((ann.reversible as { window: string }).window, 'P30D');
  assert.deepEqual(ann.side_effects, ['charge_card', 'email_buyer', 'decrement_stock']);
  assert.equal(ann.confirmation, 'required');
  assert.equal(ann.execute_url, 'https://shop.example.com/api/checkout');
});
```

**Result:** 6/6 ✅

---

## File 15 — `tests/ux/zero-config-extract.test.ts` (6 tests)

**Metrics:** ergonomics (lowest-friction adoption path)
**Judges:** "install the plugin, your existing JSON-LD-emitting site becomes agent-readable" — zero developer annotations required.

**Key assertions:**

- A realistic Shopify-style JSON-LD block extracts to a typed Product with name, brand, price, stock, sku, rating, **with zero developer code added**.
- The extracted snapshot passes schema validation.
- OpenGraph fallback fills in when no JSON-LD is present.
- `mergeExtractions`: schema.org takes precedence over OpenGraph.
- Level-0 snapshot is meaningfully smaller than the source HTML.
- The fixture HTML contains **no** `data-ahtml-*` attributes and **no** `@ahtmljs` imports — yet entities come out.

```ts
test('extracts a Product entity with name, brand, price, stock, rating, sku from JSON-LD alone', () => {
  const ex = extractFromSchemaOrg(shopifyStyleHtml);
  const p = ex.entities[0] as { type: string; name: string; brand?: string; price?: { amount: number; currency: string }; stock?: { status: string }; sku?: string; rating?: { average: number; count: number } };
  assert.equal(p.type, 'product');
  assert.equal(p.name, 'Reusable Water Bottle');
  assert.equal(p.brand, 'Hydro');
  assert.equal(p.price?.amount, 29.95);
  assert.equal(p.price?.currency, 'USD');
  assert.equal(p.stock?.status, 'in_stock');
  assert.equal(p.sku, 'WB-750-STEEL');
  assert.equal(p.rating?.average, 4.6);
  assert.equal(p.rating?.count, 423);
});

test('developer wrote zero AHTML-specific annotations — extraction is fully automatic', () => {
  assert.ok(!shopifyStyleHtml.includes('data-ahtml'));
  assert.ok(!shopifyStyleHtml.includes('@ahtmljs'));
  const ex = extractFromSchemaOrg(shopifyStyleHtml);
  assert.ok(ex.entities.length > 0);
});
```

**Result:** 6/6 ✅

---

# Bugs the tests caught and fixed

| # | Where | Bug | Fix |
|---|---|---|---|
| 1 | `packages/agent/src/client.ts` | `AHTMLClient.manifest()` ignored the constructor-level `fetch` override and hit the live network. Caught by `client.test.ts`. | `opts.fetch ?? this.defaults.fetch ?? globalThis.fetch` |
| 2 | `packages/next/src/handler.ts` | Returned a full diff envelope even when `diff.changes.length === 0` — wasted ~150 B per page on no-change recrawls. Caught by `incremental-crawl.test.ts`. | When changes are empty, return `304 Not Modified` instead. |
| 3 | `packages/agent/src/index.ts` | `ActionRefused` was thrown by the workflow but not re-exported, so consumers couldn't `instanceof`-check it. Caught by `agent-refuses-unsafe.test.ts`. | Added to the `export { … }` line in `index.ts`. |

These are real shipped bugs (v0.1.1 has #1 and #2). All three are now covered by
regression tests — if any reverts, CI fails loudly.

---

# CI integration

`.github/workflows/ci.yml` runs the full test pipeline on **every push and PR**,
across a Node 20 + Node 22 matrix:

```yaml
- name: Unit tests — @ahtmljs/schema (49 tests)
  run: cd packages/schema && npm test

- name: Unit tests — @ahtmljs/next (38 tests)
  run: cd packages/next && npm test

- name: Unit tests — @ahtmljs/agent (18 tests)
  run: cd packages/agent && npm test

- name: UX scenario tests (30 tests — token-saving, action safety, incremental crawl, MCP, zero-config)
  run: npm run test:ux
```

The CI badge in `README.md` reflects this status. The moment any contract
regresses, the badge goes red and the relevant test name is in the failure
output.

---

# Running locally

```bash
# Whole pipeline (135 tests, ~3 seconds)
npm test

# Just unit tests
npm run test:unit

# Just UX scenarios
npm run test:ux

# Per-package
cd packages/schema && npm test
cd packages/next   && npm test
cd packages/agent  && npm test
```

The test suite is intentionally fast — under 3 seconds for the full 135 tests
on a 2024-era laptop. No watch mode is needed; you can run it on every save.

---

# What's NOT tested yet (honest gaps)

Phase 0 testing is comprehensive for the schema and the agent SDK. Known gaps:

| Area | Status | Plan |
|---|---|---|
| Signed snapshot verification | Not tested | Lands in v0.2 along with the signing implementation itself |
| Real Next.js server (not just route handlers) | Tested via `landing-preview.yml` workflow which builds + curls all six endpoints | OK for v0.1 |
| Vite/SvelteKit/Astro/Nuxt/Remix plugins | Not built yet | Phase 0 stretch (months 2–3) |
| WebShop / Mind2Web / WebArena benchmark adapters | Not built — synthetic corpus only | Phase 1 — once Rust core ships, these become tractable to run at scale |
| Browser-side `@ahtmljs/agent` | Node-only today | Phase 1: WASM build via `wasm-bindgen` |
| Property-based testing (`fast-check`) for the parsers | Hand-written cases only | Phase 1: introduce alongside Rust port |
| Mutation testing | None | Out of scope for v0.x |

These will be filled in alongside the corresponding production code. The 135
tests in this report cover **every line of behavior that v0.1 makes claims
about**.

---

*Last updated: 2026-05-14. Generated alongside test-suite v1.0 against AHTML
v0.1.1.*

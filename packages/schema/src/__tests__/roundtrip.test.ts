/**
 * Compact-format round-trip — v0.5.0.
 *
 * Every field `toCompact()` writes survives `fromCompact()` losslessly.
 * The fourteen `test.todo` entries that documented the v0.4.0 gap are now
 * passing assertions; if any regress, that's a release blocker.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot, toCompact, fromCompact, toJson } from '../index.js';
import type {
  Product,
  Document,
  Task,
  Profile,
  Dataset,
  Conversation,
  Action,
} from '../types.js';

describe('compact round-trip — baseline (envelope + simple entities/actions)', () => {
  test('envelope: ahtml / url / fetched_at / page_type / ttl / etag', () => {
    const a = snapshot('https://x.com/p', 'product_detail').ttl(60).etag('W/"abc"').build();
    const b = fromCompact(toCompact(a));
    assert.equal(b.ahtml, '0.1');
    assert.equal(b.url, 'https://x.com/p');
    assert.equal(b.page_type, 'product_detail');
    assert.equal(b.ttl, 60);
    assert.equal(b.etag, 'W/"abc"');
  });

  test('product: id, name, brand, price, stock, sku, rating', () => {
    const a = snapshot('https://x.com/p', 'product_detail')
      .add({
        id: 'product:p',
        type: 'product',
        name: 'MacBook Pro 14"',
        brand: 'Apple',
        price: { amount: 1999, currency: 'USD' },
        stock: { status: 'in_stock', quantity: 42 },
        sku: 'MBP14-M3',
        rating: { average: 4.7, count: 1200 },
      })
      .build();
    const b = fromCompact(toCompact(a));
    const p = b.entities[0] as Product;
    assert.equal(p.id, 'product:p');
    assert.equal(p.name, 'MacBook Pro 14"');
    assert.equal(p.brand, 'Apple');
    assert.deepEqual(p.price, { amount: 1999, currency: 'USD' });
    assert.deepEqual(p.stock, { status: 'in_stock', quantity: 42 });
    assert.equal(p.sku, 'MBP14-M3');
    assert.deepEqual(p.rating, { average: 4.7, count: 1200 });
  });

  test('action: id, label, target, method, side_effects, confirmation, reversible, cost', () => {
    const a = snapshot('https://x.com/p', 'product_detail')
      .action({
        id: 'buy',
        label: 'Buy now',
        target: 'product:p',
        method: 'POST',
        side_effects: ['charge_card', 'email_buyer'],
        confirmation: 'required',
        reversible: { reversible: true, window: 'P30D', policy: 'full_refund' },
        cost: { amount: 1999, currency: 'USD', category: 'purchase' },
      })
      .build();
    const b = fromCompact(toCompact(a));
    const act = b.actions[0]!;
    assert.equal(act.id, 'buy');
    assert.equal(act.label, 'Buy now');
    assert.equal(act.target, 'product:p');
    assert.equal(act.method, 'POST');
    assert.deepEqual(act.side_effects, ['charge_card', 'email_buyer']);
    assert.equal(act.confirmation, 'required');
    assert.equal(act.reversible?.reversible, true);
    assert.equal(act.reversible?.window, 'P30D');
    assert.equal(act.reversible?.policy, 'full_refund');
    assert.equal(act.cost?.amount, 1999);
    assert.equal(act.cost?.currency, 'USD');
    assert.equal(act.cost?.category, 'purchase');
  });
});

describe('compact round-trip — v0.5.0 worklist (now passing)', () => {
  test('product.description / category / list_price / attributes / images', () => {
    const a = snapshot('https://x.com/p', 'product_detail')
      .add({
        id: 'product:p',
        type: 'product',
        name: 'Widget',
        description: 'A really good widget for daily use.',
        category: 'category:widgets',
        price: { amount: 19, currency: 'USD' },
        list_price: { amount: 29, currency: 'USD' },
        images: [
          { url: 'https://cdn.x/p/1.jpg' },
          { url: 'https://cdn.x/p/2.jpg' },
        ],
        attributes: {
          color: 'red',
          weight_grams: 250,
          giftable: true,
        },
      })
      .build();
    const b = fromCompact(toCompact(a));
    const p = b.entities[0] as Product;
    assert.equal(p.description, 'A really good widget for daily use.');
    assert.equal(p.category, 'category:widgets');
    assert.deepEqual(p.list_price, { amount: 29, currency: 'USD' });
    assert.deepEqual(p.images, [
      { url: 'https://cdn.x/p/1.jpg' },
      { url: 'https://cdn.x/p/2.jpg' },
    ]);
    assert.deepEqual(p.attributes, {
      color: 'red',
      weight_grams: 250,
      giftable: true,
    });
  });

  test('product.images with metadata preserve alt / width / height', () => {
    const a = snapshot('https://x.com/p', 'product_detail')
      .add({
        id: 'product:p',
        type: 'product',
        name: 'Widget',
        images: [
          { url: 'https://cdn.x/p/1.jpg', alt: 'Front view', width: 800, height: 600 },
          { url: 'https://cdn.x/p/2.jpg' },
        ],
      })
      .build();
    const b = fromCompact(toCompact(a));
    const p = b.entities[0] as Product;
    assert.deepEqual(p.images, [
      { url: 'https://cdn.x/p/1.jpg', alt: 'Front view', width: 800, height: 600 },
      { url: 'https://cdn.x/p/2.jpg' },
    ]);
  });

  test('product.variants', () => {
    const a = snapshot('https://x.com/p', 'product_detail')
      .add({
        id: 'product:p',
        type: 'product',
        name: 'T-Shirt',
        variants: [
          {
            id: 'product:p:s',
            name: 'Small',
            price: { amount: 19, currency: 'USD' },
            stock: { status: 'in_stock', quantity: 10 },
            attributes: { size: 'S' },
          },
          {
            id: 'product:p:m',
            name: 'Medium',
            price: { amount: 19, currency: 'USD' },
            stock: { status: 'low_stock', quantity: 2 },
            attributes: { size: 'M' },
          },
        ],
      })
      .build();
    const b = fromCompact(toCompact(a));
    const p = b.entities[0] as Product;
    assert.equal(p.variants?.length, 2);
    assert.deepEqual(p.variants![0], {
      id: 'product:p:s',
      name: 'Small',
      price: { amount: 19, currency: 'USD' },
      stock: { status: 'in_stock', quantity: 10 },
      attributes: { size: 'S' },
    });
    assert.deepEqual(p.variants![1]!.stock, { status: 'low_stock', quantity: 2 });
  });

  test('document.author / summary / tags / language / word_count', () => {
    const a = snapshot('https://x.com/post', 'article')
      .add({
        id: 'document:d',
        type: 'document',
        title: 'A Post',
        author: ['Alice', 'Bob'],
        summary: 'Three sentences.',
        tags: ['ai', 'protocols', 'agents'],
        language: 'en',
        word_count: 942,
      })
      .build();
    const b = fromCompact(toCompact(a));
    const d = b.entities[0] as Document;
    assert.deepEqual(d.author, ['Alice', 'Bob']);
    assert.equal(d.summary, 'Three sentences.');
    assert.deepEqual(d.tags, ['ai', 'protocols', 'agents']);
    assert.equal(d.language, 'en');
    assert.equal(d.word_count, 942);
  });

  test('document.content multi-line block scalar', () => {
    const a = snapshot('https://x.com/post', 'article')
      .add({
        id: 'document:d',
        type: 'document',
        title: 'A Post',
        content: 'Paragraph one.\n\nParagraph two with a colon: still works.',
      })
      .build();
    const b = fromCompact(toCompact(a));
    const d = b.entities[0] as Document;
    assert.equal(d.content, 'Paragraph one.\n\nParagraph two with a colon: still works.');
  });

  test('document.chunks', () => {
    const a = snapshot('https://x.com/post', 'article')
      .add({
        id: 'document:d',
        type: 'document',
        title: 'A Post',
        content: 'Hello world',
        chunks: [
          { id: 'document:d#c1', byte_range: [0, 6], parent: 'document:d', anchor: '#intro', heading: 'Intro' },
          { id: 'document:d#c2', byte_range: [6, 11], parent: 'document:d', prev: 'document:d#c1', tokens: 1 },
        ],
      })
      .build();
    const b = fromCompact(toCompact(a));
    const d = b.entities[0] as Document;
    assert.equal(d.chunks?.length, 2);
    assert.deepEqual(d.chunks![0], {
      id: 'document:d#c1',
      byte_range: [0, 6],
      parent: 'document:d',
      anchor: '#intro',
      heading: 'Intro',
    });
    assert.equal(d.chunks![1]!.tokens, 1);
  });

  test('task.priority / due_at / labels / description', () => {
    const a = snapshot('https://x.com/t', 'task_detail')
      .add({
        id: 'task:t',
        type: 'task',
        title: 'Ship v0.5',
        state: 'in_progress',
        priority: 'urgent',
        due_at: '2026-05-25T00:00:00Z',
        labels: ['release', 'schema'],
        description: 'Round-trip every field.',
      })
      .build();
    const b = fromCompact(toCompact(a));
    const t = b.entities[0] as Task;
    assert.equal(t.priority, 'urgent');
    assert.equal(t.due_at, '2026-05-25T00:00:00Z');
    assert.deepEqual(t.labels, ['release', 'schema']);
    assert.equal(t.description, 'Round-trip every field.');
  });

  test('profile.email / homepage / handle / bio / avatar / verified / attributes', () => {
    const a = snapshot('https://x.com/u', 'profile')
      .add({
        id: 'profile:u',
        type: 'profile',
        name: 'Alice Anderson',
        kind: 'person',
        handle: '@alice',
        email: 'alice@example.com',
        homepage: 'https://alice.dev',
        bio: 'Builds things.',
        verified: true,
        avatar: { url: 'https://cdn.x/u.jpg', alt: 'Alice', width: 256, height: 256 },
        attributes: { city: 'Berlin', role: 'engineer' },
      })
      .build();
    const b = fromCompact(toCompact(a));
    const p = b.entities[0] as Profile;
    assert.equal(p.email, 'alice@example.com');
    assert.equal(p.homepage, 'https://alice.dev');
    assert.equal(p.handle, '@alice');
    assert.equal(p.bio, 'Builds things.');
    assert.equal(p.verified, true);
    assert.deepEqual(p.avatar, { url: 'https://cdn.x/u.jpg', alt: 'Alice', width: 256, height: 256 });
    assert.deepEqual(p.attributes, { city: 'Berlin', role: 'engineer' });
  });

  test('dataset entity (parseEntity used to return null)', () => {
    const a = snapshot('https://x.com/d', 'dataset')
      .add({
        id: 'dataset:sales',
        type: 'dataset',
        name: 'Sales by region',
        description: 'Q1 sales.',
        row_count_total: 4,
        columns: [
          { key: 'region', label: 'Region', type: 'string' },
          { key: 'revenue', label: 'Revenue', type: 'number' },
          { key: 'updated_at', label: 'Updated', type: 'datetime', format: 'iso8601' },
        ],
        rows: [
          ['EMEA', 100000, '2026-05-01T00:00:00Z'],
          ['NA', 250000, '2026-05-01T00:00:00Z'],
        ],
      })
      .build();
    const b = fromCompact(toCompact(a));
    const d = b.entities[0] as Dataset;
    assert.equal(d.name, 'Sales by region');
    assert.equal(d.description, 'Q1 sales.');
    assert.equal(d.row_count_total, 4);
    assert.equal(d.columns.length, 3);
    assert.deepEqual(d.columns[2], { key: 'updated_at', label: 'Updated', type: 'datetime', format: 'iso8601' });
    assert.deepEqual(d.rows, [
      ['EMEA', 100000, '2026-05-01T00:00:00Z'],
      ['NA', 250000, '2026-05-01T00:00:00Z'],
    ]);
  });

  test('conversation entity (parseEntity used to return null)', () => {
    const a = snapshot('https://x.com/chat', 'conversation')
      .add({
        id: 'conversation:thread-1',
        type: 'conversation',
        title: 'Bug report #42',
        participants: ['profile:alice', 'profile:bob'],
        message_count_total: 3,
        messages: [
          { id: 'm1', author: 'profile:alice', posted_at: '2026-05-01T10:00:00Z', content: 'Hi, broken thing.' },
          { id: 'm2', author: 'profile:bob', posted_at: '2026-05-01T10:05:00Z', content: 'Looking now.', reply_to: 'm1' },
        ],
      })
      .build();
    const b = fromCompact(toCompact(a));
    const c = b.entities[0] as Conversation;
    assert.equal(c.title, 'Bug report #42');
    assert.deepEqual(c.participants, ['profile:alice', 'profile:bob']);
    assert.equal(c.message_count_total, 3);
    assert.equal(c.messages.length, 2);
    assert.equal(c.messages[1]!.reply_to, 'm1');
    assert.equal(c.messages[0]!.content, 'Hi, broken thing.');
  });

  test('action.category / execute_url / preview_url / rate_limit / input / output', () => {
    const a = snapshot('https://x.com/p', 'product_detail')
      .action({
        id: 'buy',
        label: 'Buy',
        target: 'product:p',
        category: 'transact',
        method: 'POST',
        execute_url: '/api/checkout',
        preview_url: '/api/checkout/preview',
        rate_limit: '5/min',
        input: { type: 'object', properties: { qty: { type: 'number' } }, required: ['qty'] },
        output: { type: 'object', properties: { order_id: { type: 'string' } } },
      })
      .build();
    const b = fromCompact(toCompact(a));
    const act = b.actions[0]!;
    assert.equal(act.category, 'transact');
    assert.equal(act.execute_url, '/api/checkout');
    assert.equal(act.preview_url, '/api/checkout/preview');
    assert.equal(act.rate_limit, '5/min');
    assert.deepEqual(act.input, { type: 'object', properties: { qty: { type: 'number' } }, required: ['qty'] });
    assert.deepEqual(act.output, { type: 'object', properties: { order_id: { type: 'string' } } });
  });

  test('action.auth in object form { scheme, scopes }', () => {
    const a = snapshot('https://x.com/p', 'product_detail')
      .action({
        id: 'buy',
        target: 'product:p',
        auth: { scheme: 'oauth2', scopes: ['cart:write', 'orders:create'] },
      })
      .build();
    const b = fromCompact(toCompact(a));
    const auth = b.actions[0]!.auth;
    assert.ok(typeof auth === 'object' && auth !== null);
    assert.equal((auth as { scheme: string }).scheme, 'oauth2');
    assert.deepEqual((auth as { scopes?: string[] }).scopes, ['cart:write', 'orders:create']);
  });

  test('action.target in array form (multi-target actions)', () => {
    const a = snapshot('https://x.com/cart', 'other')
      .action({
        id: 'add-bundle',
        target: ['product:a', 'product:b', 'product:c'],
        method: 'POST',
      })
      .build();
    const b = fromCompact(toCompact(a));
    assert.deepEqual(b.actions[0]!.target, ['product:a', 'product:b', 'product:c']);
  });

  test('@links block (self / canonical / parent / next / prev / related)', () => {
    const a = snapshot('https://x.com/list', 'product_list').build();
    a.links = {
      self: 'https://x.com/list',
      canonical: 'https://x.com/list?page=1',
      parent: 'https://x.com/',
      next: { cursor: 'p2', url: 'https://x.com/list?page=2', expected: 50, total: 1000 },
      prev: { cursor: 'p0', url: 'https://x.com/list?page=0' },
      related: ['product:a', 'product:b'],
    };
    const b = fromCompact(toCompact(a));
    assert.equal(b.links?.self, 'https://x.com/list');
    assert.equal(b.links?.canonical, 'https://x.com/list?page=1');
    assert.equal(b.links?.parent, 'https://x.com/');
    assert.deepEqual(b.links?.next, {
      cursor: 'p2',
      url: 'https://x.com/list?page=2',
      expected: 50,
      total: 1000,
    });
    assert.deepEqual(b.links?.prev, { cursor: 'p0', url: 'https://x.com/list?page=0' });
    assert.deepEqual(b.links?.related, ['product:a', 'product:b']);
  });

  test('@schemas block (per-snapshot JSON Schema registry)', () => {
    const a = snapshot('https://x.com/', 'home').build();
    a.schemas = {
      Order: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      Address: { type: 'object', properties: { city: { type: 'string' } } },
    };
    const b = fromCompact(toCompact(a));
    assert.deepEqual(b.schemas, a.schemas);
  });

  test('@meta block with non-numeric string/boolean values', () => {
    const a = snapshot('https://x.com/', 'home').build();
    a.meta = {
      snapshot_bytes: 1234,
      compression_ratio: 0.42,
      generated_by: 'ahtml-next/0.5.0',
      experimental: true,
      disabled: false,
      tags: ['edge', 'cached'],
    };
    const b = fromCompact(toCompact(a));
    assert.equal(b.meta?.snapshot_bytes, 1234);
    assert.equal(b.meta?.compression_ratio, 0.42);
    assert.equal(b.meta?.generated_by, 'ahtml-next/0.5.0');
    assert.equal(b.meta?.experimental, true);
    assert.equal(b.meta?.disabled, false);
    assert.deepEqual(b.meta?.tags, ['edge', 'cached']);
  });

  test('@policy: caching / actions_require / terms_url / attribution_required / republish', () => {
    const a = snapshot('https://x.com/', 'home')
      .policy({
        agents_welcome: true,
        license: 'CC-BY-4.0',
        rate_limit: '100/min',
        actions_require: 'oauth2',
        contact: 'mailto:ops@x.com',
        terms_url: 'https://x.com/terms',
        attribution_required: true,
        republish: 'attribution_only',
        caching: { allowed: true, ttl: 300 },
      })
      .build();
    const b = fromCompact(toCompact(a));
    assert.equal(b.policy?.agents_welcome, true);
    assert.equal(b.policy?.license, 'CC-BY-4.0');
    assert.equal(b.policy?.rate_limit, '100/min');
    assert.equal(b.policy?.actions_require, 'oauth2');
    assert.equal(b.policy?.contact, 'mailto:ops@x.com');
    assert.equal(b.policy?.terms_url, 'https://x.com/terms');
    assert.equal(b.policy?.attribution_required, true);
    assert.equal(b.policy?.republish, 'attribution_only');
    assert.deepEqual(b.policy?.caching, { allowed: true, ttl: 300 });
  });
});

describe('compact round-trip — property fuzz', () => {
  // Deterministic PRNG so failures are reproducible without snapshotting input.
  function rng(seed: number) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0x100000000;
    };
  }

  function pick<T>(r: () => number, xs: readonly T[]): T {
    return xs[Math.floor(r() * xs.length)]!;
  }

  function buildRandom(seed: number) {
    const r = rng(seed);
    const s = snapshot(
      `https://x.com/p/${seed}`,
      pick(r, ['home', 'product_detail', 'article', 'task_detail', 'dataset', 'conversation'] as const),
    );

    const nProducts = Math.floor(r() * 3);
    for (let i = 0; i < nProducts; i++) {
      const p: Product = {
        id: `product:p${seed}-${i}`,
        type: 'product',
        name: `Product ${i}`,
      };
      if (r() > 0.5) p.price = { amount: Math.floor(r() * 10000), currency: pick(r, ['USD', 'EUR', 'GBP']) };
      if (r() > 0.5) p.stock = { status: pick(r, ['in_stock', 'low_stock', 'out_of_stock'] as const), quantity: Math.floor(r() * 1000) };
      if (r() > 0.5) p.brand = pick(r, ['Acme', 'Globex', 'Initech']);
      if (r() > 0.5) p.description = 'a product description';
      if (r() > 0.7) p.attributes = { color: pick(r, ['red', 'blue', 'green']), weight: Math.floor(r() * 1000), giftable: r() > 0.5 };
      s.add(p);
    }

    const nActions = Math.floor(r() * 3);
    for (let i = 0; i < nActions; i++) {
      const a: Action = { id: `act${seed}-${i}` };
      if (r() > 0.5) a.label = `Action ${i}`;
      if (r() > 0.5) a.method = pick(r, ['GET', 'POST', 'PUT', 'DELETE'] as const);
      if (r() > 0.5) a.category = pick(r, ['read', 'create', 'transact'] as const);
      if (r() > 0.5) a.execute_url = `/api/${i}`;
      if (r() > 0.5) a.rate_limit = `${1 + Math.floor(r() * 100)}/min`;
      if (r() > 0.5) a.auth = pick(r, ['none', 'optional', 'required'] as const);
      if (r() > 0.8) a.auth = { scheme: 'oauth2', scopes: ['read:x', 'write:x'] };
      s.action(a);
    }

    if (r() > 0.5) s.ttl(Math.floor(r() * 3600));
    if (r() > 0.5) s.policy({ agents_welcome: r() > 0.3, license: 'MIT', rate_limit: '60/min' });
    return s.build();
  }

  // toJson() only sorts top-level keys, so entity-interior key order can drift
  // without semantic change. Recursively sort to compare snapshots structurally.
  function stable(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(stable);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as object).sort()) {
        out[k] = stable((v as Record<string, unknown>)[k]);
      }
      return out;
    }
    return v;
  }

  test('1000 randomized snapshots survive toCompact(fromCompact(.)) at structural parity', () => {
    let failed = 0;
    let firstFailure: { seed: number; before: string; after: string } | null = null;
    for (let seed = 1; seed <= 1000; seed++) {
      const a = buildRandom(seed);
      const b = fromCompact(toCompact(a));
      const before = JSON.stringify(stable(a));
      const after = JSON.stringify(stable(b));
      if (before !== after) {
        failed++;
        if (!firstFailure) firstFailure = { seed, before, after };
      }
    }
    assert.equal(
      failed,
      0,
      firstFailure
        ? `seed ${firstFailure.seed} drifted on round-trip\n--- before ---\n${firstFailure.before}\n--- after ---\n${firstFailure.after}`
        : 'no failures',
    );
  });

  test('idempotent: toCompact(fromCompact(toCompact(.))) === toCompact(.)', () => {
    let failed = 0;
    let firstFailure: { seed: number; a: string; b: string } | null = null;
    for (let seed = 1; seed <= 200; seed++) {
      const s = buildRandom(seed);
      const a = toCompact(s);
      const b = toCompact(fromCompact(a));
      if (a !== b) {
        failed++;
        if (!firstFailure) firstFailure = { seed, a, b };
      }
    }
    assert.equal(
      failed,
      0,
      firstFailure
        ? `seed ${firstFailure.seed} drifted on idempotent re-emit\n--- first ---\n${firstFailure.a}\n--- second ---\n${firstFailure.b}`
        : 'no failures',
    );
  });
});

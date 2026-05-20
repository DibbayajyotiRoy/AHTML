import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot } from '@ahtmljs/schema';
import { snapshotsToMcp } from '../mcp.js';
import { snapshotsToOpenApi } from '../openapi.js';
import { buildManifest } from '../well-known.js';
import { buildLlmsTxt } from '../llms-txt.js';
import type { AHTMLConfig } from '../index.js';

const fixtureSnaps = [
  snapshot('https://shop.com/products/mbp', 'product_detail')
    .add({ id: 'product:mbp', type: 'product', name: 'MacBook' })
    .action({
      id: 'purchase',
      target: 'product:mbp',
      category: 'transact',
      method: 'POST',
      execute_url: '/api/checkout',
      auth: 'required',
      cost: { amount: 1999, currency: 'USD', category: 'purchase' },
      reversible: { reversible: true, window: 'P30D', policy: 'full_refund' },
      side_effects: ['charge_card', 'email_buyer'],
      confirmation: 'required',
      input: { type: 'object', properties: { sku: { type: 'string' } } },
    })
    .build(),
];

describe('snapshotsToMcp', () => {
  test('emits an MCP manifest with the expected envelope', () => {
    const m = snapshotsToMcp({ name: 'shop.com', url: 'https://shop.com' }, fixtureSnaps);
    assert.equal(m.schema_version, '0.1');
    assert.equal(m.server.name, 'shop.com');
    assert.equal(m.server.url, 'https://shop.com');
    assert.ok(Array.isArray(m.tools));
  });

  test('one tool per action, namespaced as "page_type.action_id"', () => {
    const m = snapshotsToMcp({ name: 'shop', url: 'https://shop.com' }, fixtureSnaps);
    assert.equal(m.tools.length, 1);
    assert.equal(m.tools[0]!.name, 'product_detail.purchase');
  });

  test('inputSchema is carried through', () => {
    const m = snapshotsToMcp({ name: 'shop', url: 'https://shop.com' }, fixtureSnaps);
    const schema = m.tools[0]!.inputSchema as { type: string; properties?: { sku?: unknown } };
    assert.equal(schema.type, 'object');
    assert.ok(schema.properties?.sku !== undefined);
  });

  test('annotations include auth, cost, reversibility, side_effects, confirmation, execute_url', () => {
    const m = snapshotsToMcp({ name: 'shop', url: 'https://shop.com' }, fixtureSnaps);
    const ann = m.tools[0]!.annotations!;
    assert.equal(ann.auth, 'required');
    assert.deepEqual(ann.cost, { amount: 1999, currency: 'USD', category: 'purchase' });
    assert.deepEqual(ann.reversible, { reversible: true, window: 'P30D', policy: 'full_refund' });
    assert.deepEqual(ann.side_effects, ['charge_card', 'email_buyer']);
    assert.equal(ann.confirmation, 'required');
    assert.equal(ann.execute_url, '/api/checkout');
  });

  test('deduplicates tools that share the same fully-qualified name', () => {
    const dup = [...fixtureSnaps, ...fixtureSnaps];
    const m = snapshotsToMcp({ name: 'shop', url: 'https://shop.com' }, dup);
    assert.equal(m.tools.length, 1);
  });
});

describe('snapshotsToOpenApi', () => {
  test('emits an OpenAPI 3.1 document with paths for snapshots + action execute_urls', () => {
    const doc = snapshotsToOpenApi({ title: 'shop', baseUrl: 'https://shop.com' }, fixtureSnaps) as Record<string, unknown>;
    assert.equal(doc.openapi, '3.1.0');
    const paths = doc.paths as Record<string, Record<string, { 'x-ahtml-cost'?: unknown; 'x-ahtml-side-effects'?: unknown; responses?: Record<string, { description: string }> }>>;
    assert.ok(paths['/ahtml/products/mbp']);
    assert.ok(paths['/api/checkout']);
  });

  test('adds x-ahtml-cost / -side-effects / -reversible / -confirmation extensions', () => {
    const doc = snapshotsToOpenApi({ title: 'shop', baseUrl: 'https://shop.com' }, fixtureSnaps) as { paths: Record<string, Record<string, Record<string, unknown>>> };
    const post = doc.paths['/api/checkout']!.post!;
    assert.ok(post['x-ahtml-cost']);
    assert.ok(post['x-ahtml-side-effects']);
    assert.ok(post['x-ahtml-reversible']);
    assert.equal(post['x-ahtml-confirmation'], 'required');
  });

  test('adds bearer security to actions whose auth is "required"', () => {
    const doc = snapshotsToOpenApi({ title: 'shop', baseUrl: 'https://shop.com' }, fixtureSnaps) as { paths: Record<string, Record<string, { security?: Array<Record<string, unknown>> }>> };
    const post = doc.paths['/api/checkout']!.post!;
    assert.ok(Array.isArray(post.security));
    assert.ok(post.security![0]!.bearer !== undefined);
  });

  test('honors info.version when supplied (regression: v0.4.0)', () => {
    const doc = snapshotsToOpenApi(
      { title: 'shop', baseUrl: 'https://shop.com', version: '3.14.0' },
      fixtureSnaps,
    ) as { info: { version: string } };
    assert.equal(doc.info.version, '3.14.0');
  });

  test('defaults info.version to 1.0.0, not the AHTML schema version (regression: v0.4.0)', () => {
    const doc = snapshotsToOpenApi({ title: 'shop', baseUrl: 'https://shop.com' }, fixtureSnaps) as { info: { version: string } };
    assert.notEqual(doc.info.version, '0.1');
    assert.equal(doc.info.version, '1.0.0');
  });

  test('uses the declared auth scheme (oauth2 with scopes) — not always bearer (regression: v0.4.0)', () => {
    const snaps = [
      snapshot('https://shop.com/x', 'product_detail')
        .add({ id: 'product:x', type: 'product', name: 'X' })
        .action({
          id: 'order',
          execute_url: '/api/order',
          method: 'POST',
          auth: { scheme: 'oauth2', scopes: ['orders.write', 'profile.read'] },
        })
        .build(),
    ];
    const doc = snapshotsToOpenApi({ title: 'shop', baseUrl: 'https://shop.com' }, snaps) as {
      paths: Record<string, Record<string, { security?: Array<Record<string, string[]>> }>>;
      components: { securitySchemes?: Record<string, { type: string }> };
    };
    const post = doc.paths['/api/order']!.post!;
    assert.deepEqual(post.security, [{ oauth2: ['orders.write', 'profile.read'] }]);
    assert.equal(doc.components.securitySchemes?.oauth2?.type, 'oauth2');
    assert.equal(doc.components.securitySchemes?.bearer, undefined);
  });

  test('omits security entirely when auth is "none" or missing (regression: v0.4.0)', () => {
    const snaps = [
      snapshot('https://shop.com', 'home')
        .action({ id: 'view', execute_url: '/api/view', method: 'GET' })
        .build(),
    ];
    const doc = snapshotsToOpenApi({ title: 'shop', baseUrl: 'https://shop.com' }, snaps) as {
      paths: Record<string, Record<string, { security?: unknown }>>;
    };
    assert.equal(doc.paths['/api/view']!.get!.security, undefined);
  });
});

describe('buildManifest (/.well-known/ahtml.json)', () => {
  const config: AHTMLConfig = {
    site: 'https://shop.com',
    policy: { agents_welcome: true, license: 'MIT' },
    routes: [
      { path: '/', page_type: 'home' },
      { path: '/products/mbp', page_type: 'product_detail' },
    ],
  };

  test('envelope is well-formed', () => {
    const m = buildManifest(config);
    assert.equal(m.ahtml, '0.1');
    assert.equal(m.site, 'https://shop.com');
    assert.ok(m.snapshot_url_template.includes('{path}'));
  });

  test('routes carry computed snapshot_url', () => {
    const m = buildManifest(config);
    const route = m.routes!.find((r) => r.path === '/products/mbp')!;
    assert.equal(route.snapshot_url, 'https://shop.com/ahtml/products/mbp');
  });

  test('endpoints include mcp + openapi when emit_* is true by default', () => {
    const m = buildManifest(config);
    assert.equal(m.endpoints.mcp, 'https://shop.com/ahtml/mcp.json');
    assert.equal(m.endpoints.openapi, 'https://shop.com/ahtml/openapi.json');
  });

  test('omits mcp/openapi when emit_mcp/emit_openapi is false', () => {
    const m = buildManifest({ ...config, emit_mcp: false, emit_openapi: false });
    assert.equal(m.endpoints.mcp, undefined);
    assert.equal(m.endpoints.openapi, undefined);
  });

  test('advertises the three media types under "formats"', () => {
    const m = buildManifest(config);
    const types = m.formats.map((f) => f.media_type);
    assert.ok(types.includes('application/ahtml+text'));
    assert.ok(types.includes('application/ahtml+json'));
    assert.ok(types.includes('application/ahtml-diff+json'));
  });
});

describe('buildLlmsTxt', () => {
  test('emits Jeremy Howard convention layout — H1 + blockquote + H2 sections', () => {
    const txt = buildLlmsTxt({
      title: 'Shop',
      description: 'Buy things.',
      sections: [
        {
          name: 'Products',
          items: [
            { title: 'MacBook', url: 'https://shop.com/products/mbp', description: 'Apple laptop' },
          ],
        },
      ],
    });
    assert.match(txt, /^# Shop$/m);
    assert.match(txt, /^> Buy things\.$/m);
    assert.match(txt, /^## Products$/m);
    assert.match(txt, /\[MacBook\]\(https:\/\/shop\.com\/products\/mbp\): Apple laptop/);
  });

  test('appends a "Machine-readable" pointer to ahtml_manifest_url when provided', () => {
    const txt = buildLlmsTxt({
      title: 'Shop',
      ahtml_manifest_url: 'https://shop.com/.well-known/ahtml.json',
    });
    assert.match(txt, /## Machine-readable/);
    assert.match(txt, /AHTML manifest/);
  });
});

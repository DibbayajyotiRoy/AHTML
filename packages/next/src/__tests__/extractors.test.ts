import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { extractFromSchemaOrg } from '../extractors/schema-org.js';
import { extractFromOpenGraph } from '../extractors/opengraph.js';
import { extractFromDataAttrs } from '../extractors/data-attrs.js';
import { mergeExtractions } from '../extractors/merge.js';
import type { Product, Document } from '@ahtmljs/schema';

describe('extractFromSchemaOrg', () => {
  test('parses a Product JSON-LD block into a Product entity', () => {
    const html = `<html><head><script type="application/ld+json">
${JSON.stringify({
  '@context': 'https://schema.org/',
  '@type': 'Product',
  name: 'MacBook Pro 14',
  brand: { '@type': 'Brand', name: 'Apple' },
  description: 'M3 chip, 18GB RAM',
  sku: 'MBP14-M3',
  offers: { '@type': 'Offer', price: 1999, priceCurrency: 'USD', availability: 'https://schema.org/InStock' },
  aggregateRating: { '@type': 'AggregateRating', ratingValue: 4.7, reviewCount: 1284 },
})}
</script></head></html>`;
    const ex = extractFromSchemaOrg(html);
    assert.equal(ex.source, 'schema-org');
    assert.equal(ex.entities.length, 1);
    const p = ex.entities[0] as Product;
    assert.equal(p.type, 'product');
    assert.equal(p.name, 'MacBook Pro 14');
    assert.equal(p.brand, 'Apple');
    assert.equal(p.price?.amount, 1999);
    assert.equal(p.price?.currency, 'USD');
    assert.equal(p.stock?.status, 'in_stock');
    assert.equal(p.rating?.average, 4.7);
    assert.equal(p.rating?.count, 1284);
  });

  test('parses an Article JSON-LD into a Document entity', () => {
    const html = `<script type="application/ld+json">
${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'AHTML 0.1 ships',
  author: { '@type': 'Person', name: 'Dibba' },
  datePublished: '2026-05-12T00:00:00Z',
  description: 'It launched.',
  inLanguage: 'en',
})}
</script>`;
    const ex = extractFromSchemaOrg(html);
    const d = ex.entities[0] as Document;
    assert.equal(d.type, 'document');
    assert.equal(d.title, 'AHTML 0.1 ships');
    assert.equal(d.author, 'Dibba');
    assert.equal(d.published_at, '2026-05-12T00:00:00Z');
    assert.equal(d.language, 'en');
  });

  test('returns empty extraction when no JSON-LD blocks are present', () => {
    const ex = extractFromSchemaOrg('<html><body><p>no schema</p></body></html>');
    assert.deepEqual(ex.entities, []);
  });

  test('tolerates malformed JSON-LD without throwing', () => {
    const html = '<script type="application/ld+json">{ not json }</script>';
    assert.doesNotThrow(() => extractFromSchemaOrg(html));
  });
});

describe('extractFromOpenGraph', () => {
  test('og:type=product produces a Product entity with price + image', () => {
    const html = `
<meta property="og:type" content="product" />
<meta property="og:title" content="MacBook Pro 14" />
<meta property="og:image" content="https://cdn.example.com/mbp.jpg" />
<meta property="product:price:amount" content="1999" />
<meta property="product:price:currency" content="USD" />`;
    const ex = extractFromOpenGraph(html);
    const p = ex.entities[0] as Product;
    assert.equal(p.type, 'product');
    assert.equal(p.name, 'MacBook Pro 14');
    assert.equal(p.price?.amount, 1999);
    assert.equal(p.price?.currency, 'USD');
    assert.equal(p.images?.[0]?.url, 'https://cdn.example.com/mbp.jpg');
  });

  test('og:type=article produces a Document entity', () => {
    const html = `
<meta property="og:type" content="article" />
<meta property="og:title" content="Why AHTML" />
<meta property="og:description" content="A short essay" />
<meta property="article:author" content="Dibba" />
<meta property="article:published_time" content="2026-05-12T00:00:00Z" />`;
    const ex = extractFromOpenGraph(html);
    const d = ex.entities[0] as Document;
    assert.equal(d.type, 'document');
    assert.equal(d.title, 'Why AHTML');
    assert.equal(d.author, 'Dibba');
    assert.equal(d.published_at, '2026-05-12T00:00:00Z');
  });

  test('falls back to "website" og:type as a Document', () => {
    const ex = extractFromOpenGraph(`
<meta property="og:title" content="Home" />
<meta property="og:description" content="Welcome" />`);
    assert.equal(ex.entities[0]!.type, 'document');
  });
});

describe('extractFromDataAttrs', () => {
  test('parses data-ahtml="product" + price/stock attributes', () => {
    const html = `
<article
  data-ahtml="product"
  data-ahtml-id="product:mbp"
  data-ahtml-name="MacBook"
  data-ahtml-price="1999 USD"
  data-ahtml-stock="in_stock (42)"
  data-ahtml-sku="MBP-14">
  Hi
</article>`;
    const ex = extractFromDataAttrs(html);
    const p = ex.entities[0] as Product;
    assert.equal(p.id, 'product:mbp');
    assert.equal(p.name, 'MacBook');
    assert.equal(p.price?.amount, 1999);
    assert.equal(p.stock?.quantity, 42);
    assert.equal(p.sku, 'MBP-14');
  });

  test('parses data-ahtml-action="purchase" + action contract attributes', () => {
    const html = `
<button
  data-ahtml-action="purchase"
  data-ahtml-action-target="product:mbp"
  data-ahtml-action-auth="required"
  data-ahtml-action-cost="1999 USD purchase"
  data-ahtml-action-reversible="P30D full_refund"
  data-ahtml-action-side-effects="charge_card, email_buyer"
  data-ahtml-action-confirmation="required">Buy</button>`;
    const ex = extractFromDataAttrs(html);
    assert.equal(ex.actions.length, 1);
    const a = ex.actions[0]!;
    assert.equal(a.id, 'purchase');
    assert.equal(a.target, 'product:mbp');
    assert.equal(a.auth, 'required');
    assert.equal(a.cost?.amount, 1999);
    assert.equal(a.reversible?.window, 'P30D');
    assert.deepEqual(a.side_effects, ['charge_card', 'email_buyer']);
    assert.equal(a.confirmation, 'required');
  });
});

describe('mergeExtractions', () => {
  test('union of entities by id', () => {
    const a = { source: 'data-attrs' as const, entities: [{ id: 'product:a', type: 'product' as const, name: 'A' }], actions: [] };
    const b = { source: 'schema-org' as const, entities: [{ id: 'product:b', type: 'product' as const, name: 'B' }], actions: [] };
    const merged = mergeExtractions([a, b]);
    assert.deepEqual(merged.entities.map((e) => e.id).sort(), ['product:a', 'product:b']);
  });

  test('earlier extractions take precedence on id collision (data-attrs > schema.org > og)', () => {
    const earlier = { source: 'data-attrs' as const, entities: [{ id: 'product:x', type: 'product' as const, name: 'Authoritative' }], actions: [] };
    const later = { source: 'schema-org' as const, entities: [{ id: 'product:x', type: 'product' as const, name: 'Fallback' }], actions: [] };
    const merged = mergeExtractions([earlier, later]);
    assert.equal((merged.entities[0] as Product).name, 'Authoritative');
  });
});

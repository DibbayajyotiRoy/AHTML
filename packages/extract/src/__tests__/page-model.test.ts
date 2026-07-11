/**
 * TASKS.md T1.1 — the framework-neutral page model round-trips a fixture
 * page from raw HTML through the built-in pipeline.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { pageFromHtml, createExtractor } from '../index.js';
import type { Product } from '@ahtmljs/schema';

const FIXTURE_URL = 'https://shop.example.com/p/mbp-14';

// One page carrying all four extraction sources, with conflicting `name`
// values so merge precedence is observable end-to-end.
const FIXTURE_HTML = `<!doctype html>
<html>
<head>
  <meta property="og:title" content="OG Title (lowest precedence)">
  <meta property="og:type" content="product">
  <script type="application/ld+json">
  {
    "@type": "Product",
    "name": "MacBook Pro 14 (JSON-LD)",
    "sku": "MBP14-LD",
    "offers": { "price": 1999, "priceCurrency": "USD", "availability": "https://schema.org/InStock" }
  }
  </script>
</head>
<body>
  <article
    data-ahtml="product"
    data-ahtml-id="product:macbook-pro-14-json-ld"
    data-ahtml-name="MacBook Pro 14 (data-attrs)"
    data-ahtml-price="1899 USD">
    <button
      data-ahtml-action="purchase"
      data-ahtml-action-auth="required"
      data-ahtml-action-target="product:macbook-pro-14-json-ld">Buy</button>
  </article>
</body>
</html>`;

describe('PageModel (T1.1)', () => {
  test('pageFromHtml builds a model and rejects relative URLs', () => {
    const page = pageFromHtml(FIXTURE_URL, FIXTURE_HTML, { framework: 'test' });
    assert.equal(page.url, FIXTURE_URL);
    assert.equal(page.html, FIXTURE_HTML);
    assert.equal(page.framework, 'test');
    assert.throws(() => pageFromHtml('/p/mbp-14', FIXTURE_HTML), /must be absolute/);
  });

  test('fixture page round-trips through the built-in pipeline', () => {
    const extractor = createExtractor();
    const result = extractor.extract(pageFromHtml(FIXTURE_URL, FIXTURE_HTML));

    const product = result.entities.find((e) => e.type === 'product') as Product;
    assert.ok(product, 'a product entity must be extracted');
    // data-attrs (priority 400) must beat JSON-LD (300) and OpenGraph (100).
    assert.equal(product.name, 'MacBook Pro 14 (data-attrs)');
    assert.deepEqual(product.price, { amount: 1899, currency: 'USD' });
    // Fields only JSON-LD knows still survive the merge.
    assert.equal(product.sku, 'MBP14-LD');

    const purchase = result.actions.find((a) => a.id === 'purchase');
    assert.ok(purchase, 'the data-attrs action must be extracted');
    assert.equal(purchase!.auth, 'required');
  });

  test('route.page_type is the fallback when no plugin infers one', () => {
    const extractor = createExtractor();
    const page = pageFromHtml('https://example.com/docs', '<html><body>plain</body></html>', {
      route: { path: '/docs', page_type: 'document' },
    });
    assert.equal(extractor.extract(page).page_type, 'document');
  });
});

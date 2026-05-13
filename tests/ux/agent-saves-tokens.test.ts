/**
 * UX test #2 — agent crawling AHTML uses dramatically fewer tokens than
 * scraping HTML for the same content.
 *
 * This is the *headline marketing claim* — and the assertion that defends
 * it. If real-world HTML compression drifts below ~3× the test fails and
 * we know to revisit the schema (or our marketing).
 *
 * Methodology: identical product data rendered two ways:
 *   1. A realistic HTML product page (with nav, footer, JSON-LD, OG, analytics scripts).
 *   2. The same product data as an AHTML compact snapshot.
 *
 * Both serialized strings get tokenized with `gpt-tokenizer` (OpenAI's
 * tiktoken o200k_base — the encoding GPT-4o / o-series uses) and
 * `@anthropic-ai/tokenizer` (Anthropic's official Claude tokenizer).
 *
 * No char/4 approximations — the same tokenizers OpenAI and Anthropic use
 * internally.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot, toCompact } from '@ahtmljs/schema';

interface ProductData {
  id: string;
  name: string;
  brand: string;
  price: number;
  list_price: number;
  qty: number;
  sku: string;
  rating: number;
  review_count: number;
  description: string;
}

const PRODUCT: ProductData = {
  id: 'mbp-14-m3',
  name: 'MacBook Pro 14" M3',
  brand: 'Apple',
  price: 1999,
  list_price: 2199,
  qty: 42,
  sku: 'MBP14-M3-512',
  rating: 4.7,
  review_count: 1284,
  description: '14-inch M3 with 18 GB unified memory and 512 GB SSD.',
};

function productHtml(p: ProductData): string {
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org/',
    '@type': 'Product',
    name: p.name,
    sku: p.sku,
    brand: { '@type': 'Brand', name: p.brand },
    description: p.description,
    aggregateRating: { '@type': 'AggregateRating', ratingValue: p.rating, reviewCount: p.review_count },
    offers: { '@type': 'Offer', price: p.price, priceCurrency: 'USD', availability: 'https://schema.org/InStock' },
  });
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${p.name} — TechMart</title>
<meta name="description" content="${p.description}" />
<meta property="og:type" content="product" />
<meta property="og:title" content="${p.name}" />
<meta property="og:image" content="https://cdn.example.com/${p.id}.jpg" />
<meta property="og:price:amount" content="${p.price}" />
<meta property="og:price:currency" content="USD" />
<meta name="twitter:card" content="product" />
<meta name="twitter:title" content="${p.name}" />
<link rel="canonical" href="https://shop.example.com/products/${p.id}" />
<link rel="preconnect" href="https://cdn.example.com" />
<link rel="stylesheet" href="/static/css/main.css" />
<link rel="stylesheet" href="/static/css/product.css" />
<script type="application/ld+json">${jsonLd}</script>
<script>(function(){window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','GA_TRACKING_ID');})();</script>
<script>(function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){(i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)})(window,document,'script','https://www.google-analytics.com/analytics.js','ga');ga('create','UA-XXXXXX-X','auto');ga('send','pageview');</script>
</head><body>
<header class="site-header"><div class="container">
  <a href="/" class="logo">TechMart</a>
  <nav><ul>
    <li><a href="/c/laptops">Laptops</a></li>
    <li><a href="/c/phones">Phones</a></li>
    <li><a href="/c/tablets">Tablets</a></li>
    <li><a href="/c/wearables">Wearables</a></li>
    <li><a href="/c/audio">Audio</a></li>
    <li><a href="/c/business">Business</a></li>
    <li><a href="/c/education">Education</a></li>
  </ul></nav>
  <div class="utility-nav"><a href="/account">Account</a><a href="/cart">Cart (3)</a></div>
</div></header>
<main class="pdp container">
  <h1>${p.name}</h1>
  <p class="brand">${p.brand}</p>
  <div class="rating"><span class="stars">★★★★☆</span><a href="#reviews">${p.rating} (${p.review_count.toLocaleString()} reviews)</a></div>
  <div class="price"><span class="now">$${p.price.toLocaleString()}</span><span class="was">$${p.list_price.toLocaleString()}</span></div>
  <p>${p.description}</p>
  <div class="availability">In stock — ${p.qty} available</div>
  <form action="/api/cart/items" method="post">
    <button type="submit" class="btn-primary">Add to cart</button>
    <button type="button" class="btn-secondary">Buy now</button>
  </form>
</main>
<footer class="site-footer"><div class="container"><div class="footer-grid">
  <div><h4>Shop</h4><ul><li><a href="/c/laptops">Laptops</a></li><li><a href="/c/phones">Phones</a></li><li><a href="/c/tablets">Tablets</a></li><li><a href="/c/audio">Audio</a></li><li><a href="/refurbished">Refurbished</a></li></ul></div>
  <div><h4>Services</h4><ul><li><a href="/financing">Financing</a></li><li><a href="/trade-in">Trade-in</a></li><li><a href="/business">Business</a></li><li><a href="/education">Education</a></li><li><a href="/support">Support</a></li></ul></div>
  <div><h4>Account</h4><ul><li><a href="/orders">Orders</a></li><li><a href="/wishlist">Wishlist</a></li><li><a href="/saved">Saved</a></li><li><a href="/addresses">Addresses</a></li></ul></div>
  <div><h4>Company</h4><ul><li><a href="/about">About</a></li><li><a href="/careers">Careers</a></li><li><a href="/press">Press</a></li><li><a href="/contact">Contact</a></li></ul></div>
</div></div></footer>
</body></html>`;
}

function productAhtmlCompact(p: ProductData): string {
  const snap = snapshot(`https://shop.example.com/products/${p.id}`, 'product_detail')
    .ttl(60)
    .policy({ agents_welcome: true, license: 'CC-BY-4.0', rate_limit: '100/min' })
    .add({
      id: `product:${p.id}`,
      type: 'product',
      name: p.name,
      brand: p.brand,
      description: p.description,
      price: { amount: p.price, currency: 'USD' },
      list_price: { amount: p.list_price, currency: 'USD' },
      stock: { status: 'in_stock', quantity: p.qty },
      sku: p.sku,
      rating: { average: p.rating, count: p.review_count },
    })
    .action({
      id: 'purchase',
      target: `product:${p.id}`,
      category: 'transact',
      method: 'POST',
      execute_url: '/api/checkout',
      auth: 'required',
      cost: { amount: p.price, currency: 'USD', category: 'purchase' },
      reversible: { reversible: true, window: 'P30D', policy: 'full_refund' },
      side_effects: ['charge_card', 'email_buyer', 'decrement_stock'],
      confirmation: 'required',
    })
    .build();
  return toCompact(snap);
}

async function tokenize_o200k(text: string): Promise<number | null> {
  try {
    const mod = (await import('gpt-tokenizer/encoding/o200k_base' as string)) as { encode(s: string): number[] };
    return mod.encode(text).length;
  } catch {
    return null;
  }
}

async function tokenize_claude(text: string): Promise<number | null> {
  try {
    const mod = (await import('@anthropic-ai/tokenizer' as string)) as { countTokens(s: string): number };
    return mod.countTokens(text);
  } catch {
    return null;
  }
}

describe('UX — agent token cost (real tokenizers)', () => {
  const html = productHtml(PRODUCT);
  const compact = productAhtmlCompact(PRODUCT);

  test('the AHTML compact form preserves every fact an agent needs', () => {
    // Agent must be able to find: name, brand, price, currency, stock, sku, rating, action contract
    for (const required of [
      PRODUCT.name,
      PRODUCT.brand,
      String(PRODUCT.price),
      'USD',
      PRODUCT.sku,
      String(PRODUCT.rating),
      String(PRODUCT.qty),
      'purchase',
      'confirmation: required',
      'reversible: P30D',
      'side_effects:',
    ]) {
      assert.ok(
        compact.includes(required),
        `AHTML compact form must include "${required}" so an agent can parse it deterministically`,
      );
    }
  });

  test('AHTML uses ≥4× fewer GPT-4o tokens than HTML for the same content', async () => {
    const htmlTokens = await tokenize_o200k(html);
    const compactTokens = await tokenize_o200k(compact);
    if (htmlTokens === null || compactTokens === null) {
      console.warn('  (skipped — gpt-tokenizer not installed)');
      return;
    }
    const ratio = htmlTokens / compactTokens;
    console.log(`    HTML=${htmlTokens} tokens, AHTML compact=${compactTokens} tokens (${ratio.toFixed(1)}× reduction)`);
    assert.ok(
      ratio >= 4,
      `expected ≥4× reduction; got ${ratio.toFixed(2)}× (HTML=${htmlTokens}, AHTML=${compactTokens})`,
    );
  });

  test('AHTML uses ≥4× fewer Claude tokens than HTML for the same content', async () => {
    const htmlTokens = await tokenize_claude(html);
    const compactTokens = await tokenize_claude(compact);
    if (htmlTokens === null || compactTokens === null) {
      console.warn('  (skipped — @anthropic-ai/tokenizer not installed)');
      return;
    }
    const ratio = htmlTokens / compactTokens;
    console.log(`    HTML=${htmlTokens} tokens (Claude), AHTML compact=${compactTokens} (${ratio.toFixed(1)}× reduction)`);
    assert.ok(
      ratio >= 4,
      `expected ≥4× reduction (Claude); got ${ratio.toFixed(2)}× (HTML=${htmlTokens}, AHTML=${compactTokens})`,
    );
  });

  test('AHTML compact is strictly smaller in raw bytes than the HTML', () => {
    const htmlBytes = Buffer.byteLength(html, 'utf8');
    const compactBytes = Buffer.byteLength(compact, 'utf8');
    console.log(`    HTML=${htmlBytes} bytes, AHTML compact=${compactBytes} bytes (${(htmlBytes / compactBytes).toFixed(1)}×)`);
    assert.ok(compactBytes < htmlBytes / 4);
  });
});

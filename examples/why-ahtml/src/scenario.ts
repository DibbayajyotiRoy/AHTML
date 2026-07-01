/**
 * One flagship page — a product detail — expressed four ways:
 *
 *   1. productHtml()      the page a browser downloads today (nav, footer,
 *                         analytics, schema.org, related-product rail — the
 *                         real chrome an agent pays tokens for).
 *   2. productMarkdown()  the "readable markdown" an HTML→MD converter yields
 *                         (Cloudflare auto-markdown, Jina Reader, llms.txt).
 *                         Clean prose — but the typed action contract is gone.
 *   3. toCompact(snap)    AHTML's token-optimal wire form.
 *   4. toJson(snap)       AHTML's canonical, signable JSON.
 *
 * Rows 2–4 are all "LLM-friendly." The benchmark's thesis is that only AHTML
 * carries what the agent needs to *act*: cost, reversibility, side-effects,
 * confirmation, auth, freshness — plus a signature and a price.
 */

import { snapshot, type Snapshot } from '@ahtmljs/schema';

export const PAGE_URL = 'https://shop.example.com/products/aurora-14-laptop';

interface ProductData {
  slug: string;
  name: string;
  brand: string;
  sku: string;
  price: number;
  currency: string;
  qty: number;
  rating: number;
  reviews: number;
}

const PRODUCT: ProductData = {
  slug: 'aurora-14-laptop',
  name: 'Aurora 14 Laptop (M-series, 1TB)',
  brand: 'Northwind',
  sku: 'NW-AUR14-1TB',
  price: 1799,
  currency: 'USD',
  qty: 37,
  rating: 4.7,
  reviews: 2143,
};

/** The AHTML snapshot — the single source every wire format derives from. */
export function productSnapshot(): Snapshot {
  const p = PRODUCT;
  return snapshot(PAGE_URL, 'product_detail')
    .ttl(60)
    .policy({
      agents_welcome: true,
      license: 'CC-BY-4.0',
      rate_limit: '100/min',
      contact: 'agents@shop.example.com',
      // v0.9.5 — declared crawl permissions (Content Signals / RSL 1.0).
      content_signals: { search: 'allowed', ai_input: 'allowed', ai_train: 'denied' },
    })
    .add({
      id: `product:${p.slug}`,
      type: 'product',
      name: p.name,
      brand: p.brand,
      sku: p.sku,
      price: { amount: p.price, currency: p.currency },
      stock: { status: p.qty > 0 ? 'in_stock' : 'out_of_stock', quantity: p.qty },
      rating: { average: p.rating, count: p.reviews },
    })
    .action({
      id: 'purchase',
      label: 'Buy now',
      target: `product:${p.slug}`,
      category: 'transact',
      execute_url: '/api/checkout',
      method: 'POST',
      auth: 'required',
      // v0.9.5 — a priced action: what it costs AND how to pay for it.
      cost: { amount: p.price, currency: p.currency, category: 'purchase', rails: ['x402'] },
      reversible: { reversible: true, window: 'P30D', policy: 'full_refund' },
      side_effects: ['charge_card', 'email_buyer', 'decrement_stock'],
      confirmation: 'required',
    })
    .action({
      id: 'view_specs',
      label: 'View full specifications',
      target: `product:${p.slug}`,
      category: 'read',
      execute_url: '/api/products/aurora-14-laptop/specs',
      method: 'GET',
      cost: { category: 'free' },
    })
    .build();
}

/** The bloated HTML a browser (and today's scraping agent) actually loads. */
export function productHtml(): string {
  const p = PRODUCT;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${p.name} — ${p.brand} Store</title>
<meta name="description" content="Buy the ${p.name} from ${p.brand}. ${p.rating}★ from ${p.reviews} reviews. Free 30-day returns.">
<meta property="og:type" content="product">
<meta property="og:title" content="${p.name}">
<meta property="og:price:amount" content="${p.price}">
<meta property="og:price:currency" content="${p.currency}">
<link rel="stylesheet" href="/assets/app.4f9a1c.css">
<link rel="preconnect" href="https://www.googletagmanager.com">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"${p.name}","brand":{"@type":"Brand","name":"${p.brand}"},"sku":"${p.sku}","aggregateRating":{"@type":"AggregateRating","ratingValue":"${p.rating}","reviewCount":"${p.reviews}"},"offers":{"@type":"Offer","price":"${p.price}","priceCurrency":"${p.currency}","availability":"https://schema.org/InStock"}}
</script>
<script>(function(){window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-XXXXXXX');gtag('event','view_item',{currency:'${p.currency}',value:${p.price},items:[{item_id:'${p.sku}',item_name:'${p.name}',item_brand:'${p.brand}',price:${p.price}}]});})();</script>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXX"></script>
<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','000000000000000');fbq('track','PageView');</script>
</head>
<body>
<header class="site-header">
  <a class="logo" href="/">${p.brand}</a>
  <nav class="primary-nav" aria-label="Primary">
    <a href="/laptops">Laptops</a><a href="/desktops">Desktops</a><a href="/tablets">Tablets</a>
    <a href="/accessories">Accessories</a><a href="/deals">Deals</a><a href="/support">Support</a>
  </nav>
  <form class="search" role="search" action="/search"><input type="search" name="q" placeholder="Search 12,000+ products"><button>Search</button></form>
  <div class="header-actions"><a href="/account">Account</a><a href="/cart" class="cart">Cart (0)</a></div>
</header>
<nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/laptops">Laptops</a> / <span>${p.name}</span></nav>
<main class="pdp">
  <section class="gallery"><img src="/img/aurora14/hero.jpg" alt="${p.name}" width="720" height="540"><div class="thumbs"><img src="/img/aurora14/1.jpg" alt=""><img src="/img/aurora14/2.jpg" alt=""><img src="/img/aurora14/3.jpg" alt=""></div></section>
  <section class="buybox">
    <h1>${p.name}</h1>
    <div class="rating">${p.rating} ★★★★★ <a href="#reviews">(${p.reviews} reviews)</a></div>
    <div class="price">$${p.price.toLocaleString()}<span class="currency">${p.currency}</span></div>
    <div class="availability in-stock">In stock — ${p.qty} available. Ships today.</div>
    <ul class="highlights"><li>14-inch Liquid Retina display</li><li>M-series chip, 16-core GPU</li><li>1TB SSD · 18GB unified memory</li><li>Up to 21 hours battery</li></ul>
    <form action="/cart/add" method="post"><input type="hidden" name="sku" value="${p.sku}"><button type="submit" class="buy">Add to cart</button></form>
    <p class="returns">Free 30-day returns · Full refund policy</p>
  </section>
</main>
<section id="related" class="related"><h2>Customers also viewed</h2>
  <ul><li><a href="/products/aurora-16">Aurora 16 Laptop</a></li><li><a href="/products/gale-tablet">Gale Tablet 11</a></li><li><a href="/products/breeze-mouse">Breeze Wireless Mouse</a></li><li><a href="/products/dock-pro">Northwind Dock Pro</a></li></ul>
</section>
<section id="reviews" class="reviews"><h2>${p.reviews} reviews</h2>
  <article class="review"><strong>Anya R.</strong> ★★★★★ <p>Blazing fast exports and the battery genuinely lasts a workday.</p></article>
  <article class="review"><strong>Marcus T.</strong> ★★★★☆ <p>Beautiful screen. Wish it came with more ports out of the box.</p></article>
</section>
<footer class="site-footer">
  <div class="cols">
    <div><h3>Shop</h3><a href="/laptops">Laptops</a><a href="/desktops">Desktops</a><a href="/deals">Deals</a><a href="/gift-cards">Gift cards</a></div>
    <div><h3>Support</h3><a href="/support">Help center</a><a href="/returns">Returns</a><a href="/warranty">Warranty</a><a href="/contact">Contact</a></div>
    <div><h3>Company</h3><a href="/about">About</a><a href="/careers">Careers</a><a href="/press">Press</a><a href="/sustainability">Sustainability</a></div>
    <div><h3>Legal</h3><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/cookies">Cookie settings</a><a href="/accessibility">Accessibility</a></div>
  </div>
  <p class="copyright">© 2026 ${p.brand}, Inc. All rights reserved.</p>
</footer>
<script src="/assets/app.4f9a1c.js" defer></script>
<script>(function(){var i=document.createElement('script');i.async=true;i.src='https://js.intercomcdn.com/widget.js';document.head.appendChild(i);})();</script>
</body>
</html>`;
}

/**
 * The "readable markdown" an HTML→MD converter (Cloudflare auto-markdown,
 * Jina Reader) or a hand-written llms.txt produces. Clean and cheap — but
 * notice what's missing: no machine-readable price object, no return window,
 * no side-effects, no confirmation requirement, no way to *invoke* the sale.
 */
export function productMarkdown(): string {
  const p = PRODUCT;
  return `# ${p.name}

**Brand:** ${p.brand}
**Rating:** ${p.rating} out of 5 (${p.reviews} reviews)
**Price:** $${p.price.toLocaleString()} ${p.currency}
**Availability:** In stock — ${p.qty} available, ships today.

## Highlights

- 14-inch Liquid Retina display
- M-series chip, 16-core GPU
- 1TB SSD, 18GB unified memory
- Up to 21 hours battery

Free 30-day returns. [Add to cart](/cart/add).

## Customers also viewed

- Aurora 16 Laptop
- Gale Tablet 11
- Breeze Wireless Mouse
`;
}

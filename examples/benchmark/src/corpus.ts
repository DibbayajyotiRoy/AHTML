/**
 * Corpus builder.
 *
 * For each archetype we define a single source-of-truth data object,
 * then render it four ways: raw HTML (with realistic noise), llms.txt
 * markdown, AHTML compact text, and AHTML canonical JSON.
 *
 * The HTML side intentionally includes the chrome that real pages
 * carry — nav, footer, schema.org JSON-LD, OpenGraph meta, inline
 * tracking scripts, ad slots, related-content rails, comment stubs —
 * because that is what an LLM scraper actually pays tokens for today.
 */

import {
  snapshot,
  toCompact,
  toJson,
  computeEtag,
  type Snapshot,
} from '@ahtmljs/schema';

// =====================================================================
// Source-of-truth data
// =====================================================================

interface ProductData {
  id: string;
  name: string;
  brand: string;
  description: string;
  long_description: string;
  price: number;
  list_price: number;
  currency: string;
  stock_qty: number;
  sku: string;
  category: string;
  rating: number;
  review_count: number;
  related_ids: string[];
}

interface ArticleData {
  id: string;
  title: string;
  author: string;
  author_bio: string;
  published: string;
  summary: string;
  body: string;
  word_count: number;
  tags: string[];
  related_titles: string[];
}

interface DashboardData {
  workspace: string;
  user: string;
  tasks: Array<{
    id: string;
    title: string;
    state: 'open' | 'in_progress' | 'blocked' | 'done';
    priority: 'low' | 'medium' | 'high' | 'urgent';
    assignee: string;
    due: string | null;
  }>;
}

// =====================================================================
// Sample data
// =====================================================================

const PRODUCT: ProductData = {
  id: 'mbp-14-m3-512-black',
  name: 'MacBook Pro 14" M3 — 512GB Space Black',
  brand: 'Apple',
  description:
    '14-inch laptop with M3 chip, 8-core CPU, 10-core GPU, 18GB unified memory, 512GB SSD storage.',
  long_description:
    'The 14-inch MacBook Pro with the Apple M3 chip delivers the next generation of professional performance. ' +
    'The M3 brings a faster CPU and GPU, advanced display engine, and hardware-accelerated ray tracing for ' +
    'pro apps and games. Liquid Retina XDR display with ProMotion, up to 24-hour battery life, MagSafe 3 ' +
    'charging, three Thunderbolt 4 ports, HDMI, SDXC, and a headphone jack with advanced support for ' +
    'high-impedance headphones. Available in Space Black or Silver.',
  price: 1999,
  list_price: 2199,
  currency: 'USD',
  stock_qty: 42,
  sku: 'MBP14-M3-512-SB',
  category: 'laptops',
  rating: 4.7,
  review_count: 1284,
  related_ids: ['mbp-16-m3-1tb', 'mbp-14-m3-1tb', 'mba-15-m3'],
};

const ARTICLE: ArticleData = {
  id: 'why-agents-need-ahtml',
  title: 'Why agents need a new HTML',
  author: 'Dibbayajyoti Roy',
  author_bio:
    'Dibbayajyoti Roy writes about the agent web and the infrastructure underneath it. He is the creator of AHTML.',
  published: '2026-05-12T08:00:00Z',
  summary:
    'HTML optimized the web for browsers. The agent web needs a new contract: typed semantics, typed actions, signed provenance.',
  body:
    'The web that browsers see and the web that agents see are two different things. ' +
    'Browsers see pixels. Agents see tokens. ' +
    'When an autonomous shopping agent loads a product page, it pays for every byte of nav chrome, ' +
    'analytics script, ad slot, and footer link the page carries — none of which contribute to the ' +
    'decision the agent needs to make. ' +
    'A single Shopify product page can run to 300 KB of HTML and ten thousand tokens, of which roughly ' +
    'one percent — name, price, stock — is the part the agent needs. ' +
    'Schema.org JSON-LD was a step in the right direction. It describes what a thing is. It does not ' +
    'describe what you can do with it. ' +
    'AHTML extends the contract: typed entities, typed actions, typed costs, typed reversibility, ' +
    'typed side effects, typed policy. ' +
    'And signed provenance, so an agent can tell the real store from a phishing clone. ' +
    'The compiler emits HTML for browsers, MCP for tool-using agents, OpenAPI for programmatic clients, ' +
    'JSON-LD for search engines, and llms.txt as a compatibility shim. ' +
    'One source. Every protocol downstream. ' +
    'The 100x token reduction is the headline. The real product is the contract.',
  word_count: 184,
  tags: ['agents', 'web', 'ahtml', 'protocols', 'mcp'],
  related_titles: [
    'What MCP is and why it won',
    'Why llms.txt stalled at 10%',
    'The agent-readable web',
  ],
};

const DASHBOARD: DashboardData = {
  workspace: 'AHTML Core',
  user: 'roy',
  tasks: [
    { id: 't-001', title: 'Lock the snapshot schema for v0.1', state: 'in_progress', priority: 'urgent', assignee: 'roy', due: '2026-05-15' },
    { id: 't-002', title: 'Ship benchmark report', state: 'in_progress', priority: 'high', assignee: 'roy', due: '2026-05-14' },
    { id: 't-003', title: 'Write SPEC.md', state: 'open', priority: 'high', assignee: 'roy', due: '2026-05-16' },
    { id: 't-004', title: 'First Shopify adopter outreach', state: 'open', priority: 'medium', assignee: 'roy', due: '2026-05-20' },
    { id: 't-005', title: 'Port hot path to Rust', state: 'blocked', priority: 'medium', assignee: 'roy', due: null },
    { id: 't-006', title: 'Tree-sitter grammar for .ahtml', state: 'open', priority: 'low', assignee: 'roy', due: null },
    { id: 't-007', title: 'VS Code extension', state: 'open', priority: 'low', assignee: 'roy', due: null },
    { id: 't-008', title: 'Landing page', state: 'in_progress', priority: 'high', assignee: 'roy', due: '2026-05-13' },
    { id: 't-009', title: 'Show HN post draft', state: 'open', priority: 'medium', assignee: 'roy', due: null },
    { id: 't-010', title: 'Logo + wordmark', state: 'done', priority: 'low', assignee: 'roy', due: null },
  ],
};

// =====================================================================
// HTML renderers — realistic noise included
// =====================================================================

function productHtml(p: ProductData): string {
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org/',
    '@type': 'Product',
    name: p.name,
    sku: p.sku,
    brand: { '@type': 'Brand', name: p.brand },
    description: p.description,
    aggregateRating: { '@type': 'AggregateRating', ratingValue: p.rating, reviewCount: p.review_count },
    offers: {
      '@type': 'Offer',
      price: p.price,
      priceCurrency: p.currency,
      availability: 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: 'TechMart' },
    },
  });
  const nav = siteNav();
  const footer = siteFooter();
  const reviews = sampleReviews().map(
    (r) => `
      <article class="review">
        <header class="review-head">
          <span class="reviewer">${r.name}</span>
          <span class="stars">★★★★★</span>
          <time>${r.date}</time>
        </header>
        <p>${r.body}</p>
      </article>
    `,
  ).join('\n');
  const related = p.related_ids.map(
    (id) => `
      <li class="related-card">
        <a href="/products/${id}">
          <img src="/cdn/${id}.jpg" loading="lazy" alt="${id}" />
          <h3>${id.replace(/-/g, ' ')}</h3>
          <span class="price">$ —</span>
        </a>
      </li>
    `,
  ).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
<title>${p.name} — TechMart</title>
<meta name="description" content="${p.description}" />
<meta name="robots" content="index, follow" />
<meta name="theme-color" content="#000000" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black" />
<meta property="og:type" content="product" />
<meta property="og:title" content="${p.name}" />
<meta property="og:description" content="${p.description}" />
<meta property="og:image" content="https://cdn.example.com/${p.id}.jpg" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="1200" />
<meta property="og:price:amount" content="${p.price}" />
<meta property="og:price:currency" content="${p.currency}" />
<meta property="og:availability" content="in stock" />
<meta property="product:brand" content="${p.brand}" />
<meta property="product:category" content="${p.category}" />
<meta name="twitter:card" content="product" />
<meta name="twitter:site" content="@techmart" />
<meta name="twitter:title" content="${p.name}" />
<meta name="twitter:description" content="${p.description}" />
<meta name="twitter:image" content="https://cdn.example.com/${p.id}.jpg" />
<link rel="canonical" href="https://shop.example.com/products/${p.id}" />
<link rel="preconnect" href="https://cdn.example.com" crossorigin />
<link rel="preconnect" href="https://www.google-analytics.com" />
<link rel="preconnect" href="https://www.googletagmanager.com" />
<link rel="dns-prefetch" href="https://js.stripe.com" />
<link rel="dns-prefetch" href="https://api.intercom.io" />
<link rel="stylesheet" href="/static/css/main.b6d3.css" />
<link rel="stylesheet" href="/static/css/product.4af2.css" />
<link rel="stylesheet" href="/static/css/reviews.9ce1.css" />
<link rel="preload" as="image" href="https://cdn.example.com/${p.id}.jpg" />
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="manifest" href="/manifest.webmanifest" />
<script type="application/ld+json">${jsonLd}</script>
<script>(function(){window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','GA_TRACKING_ID');gtag('event','view_item',{currency:'${p.currency}',value:${p.price},items:[{item_id:'${p.sku}',item_name:'${p.name}',item_brand:'${p.brand}',item_category:'${p.category}',price:${p.price}}]});})();</script>
<script>(function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){(i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)})(window,document,'script','https://www.google-analytics.com/analytics.js','ga');ga('create','UA-XXXXXX-X','auto');ga('send','pageview');</script>
<script>!function(e,t,n,s,u,a){e.twq||(s=e.twq=function(){s.exe?s.exe.apply(s,arguments):s.queue.push(arguments)},s.version='1.1',s.queue=[],u=t.createElement(n),u.async=!0,u.src='https://static.ads-twitter.com/uwt.js',a=t.getElementsByTagName(n)[0],a.parentNode.insertBefore(u,a))}(window,document,'script');twq('init','o0xxx');twq('track','PageView');</script>
<script>(function(){var i=document.createElement('script');i.async=true;i.src='https://js.intercomcdn.com/widget.js';document.head.appendChild(i);})();</script>
<script>
  window.__INITIAL_STATE__ = ${JSON.stringify({
    user: { id: 'anon', cart: { count: 3 } },
    ab: { test: 'pdp_layout', variant: 'B' },
    cdn: 'https://cdn.example.com',
  })};
</script>
</head>
<body class="theme-light layout-pdp ab-pdp-b">
${nav}
<main id="content" class="container product-detail">
  <nav class="breadcrumb" aria-label="breadcrumb">
    <ol>
      <li><a href="/">Home</a></li>
      <li><a href="/c/laptops">Laptops</a></li>
      <li><a href="/c/laptops/apple">Apple</a></li>
      <li aria-current="page">${p.name}</li>
    </ol>
  </nav>
  <section class="pdp-grid">
    <div class="pdp-media">
      <div class="gallery">
        <img class="hero" src="https://cdn.example.com/${p.id}.jpg" alt="${p.name} front view" />
        <ul class="thumbs">
          <li><img src="https://cdn.example.com/${p.id}-1.jpg" alt="" /></li>
          <li><img src="https://cdn.example.com/${p.id}-2.jpg" alt="" /></li>
          <li><img src="https://cdn.example.com/${p.id}-3.jpg" alt="" /></li>
          <li><img src="https://cdn.example.com/${p.id}-4.jpg" alt="" /></li>
        </ul>
      </div>
    </div>
    <div class="pdp-info">
      <p class="brand">${p.brand}</p>
      <h1>${p.name}</h1>
      <div class="rating">
        <span class="stars" aria-label="${p.rating} of 5 stars">★★★★☆</span>
        <a href="#reviews">${p.rating.toFixed(1)} (${p.review_count.toLocaleString()} reviews)</a>
      </div>
      <div class="price-block">
        <span class="price-now">$${p.price.toLocaleString()}</span>
        <span class="price-was">$${p.list_price.toLocaleString()}</span>
        <span class="price-save">Save $${(p.list_price - p.price).toLocaleString()}</span>
      </div>
      <p class="lede">${p.description}</p>
      <div class="availability">
        <span class="dot in-stock"></span>
        <span>In stock — ${p.stock_qty} available — ships within 24 hours</span>
      </div>
      <form class="buy-form" action="/api/cart/items" method="post">
        <input type="hidden" name="sku" value="${p.sku}" />
        <input type="hidden" name="qty" value="1" />
        <div class="qty">
          <button type="button" aria-label="decrement">−</button>
          <input type="number" value="1" min="1" max="5" />
          <button type="button" aria-label="increment">+</button>
        </div>
        <button class="btn-primary" type="submit">Add to cart</button>
        <button class="btn-secondary" type="button">Buy now</button>
      </form>
      <ul class="usp">
        <li>Free shipping over $100</li>
        <li>30-day returns</li>
        <li>1-year limited warranty</li>
        <li>AppleCare+ available</li>
      </ul>
    </div>
  </section>
  <section class="pdp-overview">
    <h2>Overview</h2>
    <p>${p.long_description}</p>
  </section>
  <section class="pdp-specs">
    <h2>Specs</h2>
    <dl>
      <div><dt>Chip</dt><dd>Apple M3, 8-core CPU, 10-core GPU</dd></div>
      <div><dt>Memory</dt><dd>18 GB unified memory</dd></div>
      <div><dt>Storage</dt><dd>512 GB SSD</dd></div>
      <div><dt>Display</dt><dd>14.2" Liquid Retina XDR, 3024×1964 at 254 ppi</dd></div>
      <div><dt>Battery</dt><dd>Up to 22 hours video playback</dd></div>
      <div><dt>Weight</dt><dd>1.55 kg / 3.4 lb</dd></div>
      <div><dt>Ports</dt><dd>3× Thunderbolt 4, HDMI, SDXC, MagSafe 3, 3.5mm headphone</dd></div>
      <div><dt>OS</dt><dd>macOS Sonoma</dd></div>
    </dl>
  </section>
  <section id="reviews" class="pdp-reviews">
    <h2>Reviews</h2>
    ${reviews}
  </section>
  <section class="pdp-related">
    <h2>Related products</h2>
    <ul class="related-grid">${related}</ul>
  </section>
</main>
${footer}
<script src="/static/js/app.b6d3.js" defer></script>
<script src="/static/js/pdp.4af2.js" defer></script>
</body>
</html>`;
}

function articleHtml(a: ArticleData): string {
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org/',
    '@type': 'NewsArticle',
    headline: a.title,
    description: a.summary,
    author: { '@type': 'Person', name: a.author },
    datePublished: a.published,
    keywords: a.tags.join(', '),
    inLanguage: 'en',
    articleBody: a.body,
  });
  const nav = siteNav();
  const footer = siteFooter();
  const related = a.related_titles.map(
    (t) => `<li><a href="/article/${slug(t)}"><h3>${t}</h3><p>3 min read · 2 days ago</p></a></li>`,
  ).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${a.title} — Rumour</title>
<meta name="description" content="${a.summary}" />
<meta property="og:type" content="article" />
<meta property="og:title" content="${a.title}" />
<meta property="og:description" content="${a.summary}" />
<meta property="og:image" content="https://cdn.example.com/articles/${a.id}.jpg" />
<meta property="article:published_time" content="${a.published}" />
<meta property="article:author" content="${a.author}" />
<meta property="article:section" content="Technology" />
${a.tags.map((t) => `<meta property="article:tag" content="${t}" />`).join('\n')}
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:site" content="@rumour" />
<meta name="twitter:creator" content="@${a.author.toLowerCase().replace(/\s+/g, '')}" />
<link rel="canonical" href="https://rumour.example.com/article/${a.id}" />
<link rel="stylesheet" href="/static/css/article.css" />
<link rel="preconnect" href="https://cdn.example.com" />
<script type="application/ld+json">${jsonLd}</script>
<script>(function(){window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','GA_TRACKING_ID');})();</script>
<script>(function(){var s=document.createElement('script');s.async=true;s.src='https://cdn.permutive.com/x.js';document.head.appendChild(s);})();</script>
</head>
<body>
${nav}
<article class="post container">
  <header>
    <p class="kicker">Technology · ${a.tags.slice(0, 2).join(' · ')}</p>
    <h1>${a.title}</h1>
    <p class="dek">${a.summary}</p>
    <div class="byline">
      <img src="/cdn/authors/${slug(a.author)}.jpg" alt="${a.author}" />
      <div>
        <span class="by">By <a href="/author/${slug(a.author)}">${a.author}</a></span>
        <time datetime="${a.published}">${new Date(a.published).toDateString()}</time>
        <span class="reading-time">${Math.max(1, Math.round(a.word_count / 200))} min read</span>
      </div>
    </div>
  </header>
  <div class="content">
    ${a.body.split('. ').map((s) => `<p>${s.trim()}${s.endsWith('.') ? '' : '.'}</p>`).join('\n    ')}
  </div>
  <aside class="newsletter">
    <h3>Get the agent-web briefing</h3>
    <p>One short email per week. The infrastructure being built underneath the AI agent economy.</p>
    <form action="/api/newsletter" method="post">
      <input type="email" name="email" placeholder="you@company.com" required />
      <button type="submit">Subscribe</button>
    </form>
  </aside>
  <section class="author-card">
    <img src="/cdn/authors/${slug(a.author)}.jpg" alt="${a.author}" />
    <div>
      <h4>${a.author}</h4>
      <p>${a.author_bio}</p>
    </div>
  </section>
  <section class="related-posts">
    <h2>Related</h2>
    <ul>${related}</ul>
  </section>
  <section class="comments-stub">
    <h2>Comments (0)</h2>
    <p>Be the first to comment. Sign in to leave a comment.</p>
  </section>
</article>
${footer}
</body>
</html>`;
}

function dashboardHtml(d: DashboardData): string {
  const rows = d.tasks
    .map(
      (t) => `
      <tr data-task-id="${t.id}">
        <td><input type="checkbox" aria-label="select ${t.id}" /></td>
        <td class="title"><a href="/task/${t.id}">${t.title}</a></td>
        <td><span class="state state-${t.state}">${t.state.replace('_', ' ')}</span></td>
        <td><span class="priority p-${t.priority}">${t.priority}</span></td>
        <td>${t.assignee}</td>
        <td>${t.due ?? '—'}</td>
        <td class="actions">
          <button data-action="assign">Assign</button>
          <button data-action="move">Move</button>
          <button data-action="delete" class="danger">Delete</button>
        </td>
      </tr>`,
    )
    .join('\n');
  const nav = siteNav();
  const footer = siteFooter();
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${d.workspace} — Tasks · Stitch</title>
<meta name="description" content="Task list for ${d.workspace}." />
<link rel="stylesheet" href="/static/css/app.css" />
<link rel="stylesheet" href="/static/css/dashboard.css" />
<script>window.__INITIAL_STATE__ = ${JSON.stringify({ user: d.user, ws: d.workspace })};</script>
<script>(function(){window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','GA_TRACKING_ID');})();</script>
</head>
<body class="theme-light layout-app">
${nav}
<div class="app-shell">
  <aside class="sidebar">
    <h2>Workspaces</h2>
    <ul>
      <li class="active"><a href="/w/${slug(d.workspace)}">${d.workspace}</a></li>
      <li><a href="/w/marketing">Marketing</a></li>
      <li><a href="/w/eng">Engineering</a></li>
      <li><a href="/w/personal">Personal</a></li>
    </ul>
    <h2>Filters</h2>
    <ul>
      <li><a href="?state=open">Open</a></li>
      <li><a href="?state=in_progress">In progress</a></li>
      <li><a href="?state=blocked">Blocked</a></li>
      <li><a href="?state=done">Done</a></li>
      <li><a href="?priority=urgent">Urgent</a></li>
    </ul>
    <h2>Views</h2>
    <ul>
      <li><a href="/v/my-week">My week</a></li>
      <li><a href="/v/team">Team board</a></li>
      <li><a href="/v/triage">Triage</a></li>
    </ul>
  </aside>
  <main class="content">
    <header class="page-head">
      <h1>${d.workspace}</h1>
      <div class="head-actions">
        <input type="search" placeholder="Search tasks…" />
        <button class="btn-primary" data-action="new-task">New task</button>
      </div>
    </header>
    <section class="kpi-row">
      <div class="kpi"><span class="label">Open</span><span class="value">${d.tasks.filter((t) => t.state === 'open').length}</span></div>
      <div class="kpi"><span class="label">In progress</span><span class="value">${d.tasks.filter((t) => t.state === 'in_progress').length}</span></div>
      <div class="kpi"><span class="label">Blocked</span><span class="value">${d.tasks.filter((t) => t.state === 'blocked').length}</span></div>
      <div class="kpi"><span class="label">Done</span><span class="value">${d.tasks.filter((t) => t.state === 'done').length}</span></div>
    </section>
    <table class="task-table">
      <thead>
        <tr>
          <th></th>
          <th>Task</th>
          <th>State</th>
          <th>Priority</th>
          <th>Assignee</th>
          <th>Due</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  </main>
</div>
${footer}
<script src="/static/js/app.js" defer></script>
</body>
</html>`;
}

// =====================================================================
// llms.txt renderers
// =====================================================================

function productLlmsTxt(p: ProductData): string {
  return [
    `# TechMart — ${p.name}`,
    '',
    `> ${p.description}`,
    '',
    '## Product',
    `- Name: ${p.name}`,
    `- Brand: ${p.brand}`,
    `- Price: $${p.price.toLocaleString()} (was $${p.list_price.toLocaleString()})`,
    `- Stock: in stock (${p.stock_qty} available)`,
    `- SKU: ${p.sku}`,
    `- Rating: ${p.rating}/5 (${p.review_count.toLocaleString()} reviews)`,
    '',
    '## Actions',
    `- Buy now: requires authentication, charges $${p.price}, 30-day return policy`,
    '- Add to cart: free',
    '',
    '## Related',
    ...p.related_ids.map((id) => `- ${id}`),
    '',
  ].join('\n');
}

function articleLlmsTxt(a: ArticleData): string {
  return [
    `# Rumour — ${a.title}`,
    '',
    `> ${a.summary}`,
    '',
    '## Article',
    `- Title: ${a.title}`,
    `- Author: ${a.author}`,
    `- Published: ${a.published}`,
    `- Word count: ${a.word_count}`,
    `- Tags: ${a.tags.join(', ')}`,
    '',
    '## Body',
    a.body,
    '',
    '## Related',
    ...a.related_titles.map((t) => `- ${t}`),
    '',
  ].join('\n');
}

function dashboardLlmsTxt(d: DashboardData): string {
  return [
    `# Stitch — ${d.workspace}`,
    '',
    `> Task list for the ${d.workspace} workspace.`,
    '',
    '## Tasks',
    ...d.tasks.map(
      (t) => `- [${t.state}] ${t.title} (priority: ${t.priority}, assignee: ${t.assignee}${t.due ? `, due: ${t.due}` : ''})`,
    ),
    '',
    '## Actions',
    '- Create task',
    '- Update task',
    '- Assign task',
    '- Move task',
    '- Delete task',
    '',
  ].join('\n');
}

// =====================================================================
// AHTML snapshot renderers
// =====================================================================

function productSnapshot(p: ProductData): Snapshot {
  return snapshot('https://shop.example.com/products/' + p.id, 'product_detail')
    .ttl(300)
    .policy({
      agents_welcome: true,
      license: 'CC-BY-4.0',
      rate_limit: '100/min',
      contact: 'agents@techmart.example.com',
      actions_require: 'oauth2:client_credentials',
    })
    .add(
      {
        id: 'product:' + p.id,
        type: 'product',
        name: p.name,
        brand: p.brand,
        description: p.long_description,
        price: { amount: p.price, currency: p.currency },
        list_price: { amount: p.list_price, currency: p.currency },
        stock: { status: 'in_stock', quantity: p.stock_qty },
        sku: p.sku,
        rating: { average: p.rating, count: p.review_count },
        category: 'category:' + p.category,
        freshness: 'live',
        updated_at: '2026-05-12T14:31:50Z',
      },
    )
    .action(
      {
        id: 'purchase',
        label: 'Buy now',
        target: 'product:' + p.id,
        category: 'transact',
        method: 'POST',
        execute_url: '/api/checkout',
        preview_url: '/ahtml/actions/purchase/preview',
        auth: 'required',
        cost: { amount: p.price, currency: p.currency, category: 'purchase' },
        reversible: { reversible: true, window: 'P30D', policy: 'full_refund' },
        side_effects: ['charge_card', 'email_buyer', 'decrement_stock', 'generate_receipt'],
        confirmation: 'required',
      },
      {
        id: 'add_to_cart',
        label: 'Add to cart',
        target: 'product:' + p.id,
        category: 'update',
        method: 'POST',
        execute_url: '/api/cart/items',
        auth: 'optional',
        cost: { amount: 0, currency: p.currency, category: 'free' },
        reversible: { reversible: true, policy: 'remove_from_cart' },
        side_effects: ['modify_session'],
      },
    )
    .links({
      canonical: 'https://shop.example.com/products/' + p.id,
      related: p.related_ids.map((id) => 'product:' + id),
      parent: 'category:' + p.category,
    })
    .build();
}

function articleSnapshot(a: ArticleData): Snapshot {
  return snapshot('https://rumour.example.com/article/' + a.id, 'article')
    .ttl(3600)
    .policy({ agents_welcome: true, license: 'CC-BY-4.0', republish: 'attribution_only' })
    .add({
      id: 'document:' + a.id,
      type: 'document',
      title: a.title,
      author: a.author,
      published_at: a.published,
      summary: a.summary,
      content: a.body,
      word_count: a.word_count,
      tags: a.tags,
      language: 'en',
      canonical_url: 'https://rumour.example.com/article/' + a.id,
      freshness: 'static',
    })
    .action({
      id: 'subscribe',
      label: 'Subscribe to newsletter',
      category: 'send',
      method: 'POST',
      execute_url: '/api/newsletter',
      auth: 'none',
      cost: { category: 'free' },
      reversible: { reversible: true, policy: 'unsubscribe_link' },
      side_effects: ['create_subscription'],
    })
    .build();
}

function dashboardSnapshot(d: DashboardData): Snapshot {
  const b = snapshot('https://stitch.example.com/w/' + slug(d.workspace), 'task_list')
    .ttl(15)
    .policy({
      agents_welcome: true,
      rate_limit: '60/min',
      actions_require: 'oauth2:user_token',
    });
  for (const t of d.tasks) {
    b.add({
      id: 'task:' + t.id,
      type: 'task',
      title: t.title,
      state: t.state,
      priority: t.priority,
      assignee: 'profile:' + t.assignee,
      ...(t.due && { due_at: t.due + 'T23:59:59Z' }),
      freshness: 'live',
    });
  }
  return b
    .action(
      {
        id: 'create_task',
        label: 'Create task',
        category: 'create',
        method: 'POST',
        execute_url: '/api/tasks',
        auth: 'required',
        cost: { category: 'free' },
        reversible: { reversible: true, policy: 'delete' },
        side_effects: ['create_record', 'notify_assignee'],
      },
      {
        id: 'update_task_state',
        label: 'Move task',
        category: 'update',
        method: 'PATCH',
        execute_url: '/api/tasks/{id}',
        auth: 'required',
        cost: { category: 'free' },
        reversible: { reversible: true, policy: 'revert_state' },
        side_effects: ['update_record', 'audit_log'],
      },
      {
        id: 'delete_task',
        label: 'Delete task',
        category: 'delete',
        method: 'DELETE',
        execute_url: '/api/tasks/{id}',
        auth: 'required',
        cost: { category: 'free' },
        reversible: { reversible: true, window: 'P7D', policy: 'restore_from_trash' },
        side_effects: ['delete_record', 'audit_log'],
        confirmation: 'required',
      },
    )
    .build();
}

// =====================================================================
// Helpers
// =====================================================================

function siteNav(): string {
  return `<header class="site-header">
  <div class="container">
    <a class="logo" href="/">Site</a>
    <nav aria-label="Primary">
      <ul>
        <li><a href="/c/laptops">Laptops</a></li>
        <li><a href="/c/phones">Phones</a></li>
        <li><a href="/c/tablets">Tablets</a></li>
        <li><a href="/c/wearables">Wearables</a></li>
        <li><a href="/c/audio">Audio</a></li>
        <li><a href="/c/accessories">Accessories</a></li>
        <li><a href="/c/business">Business</a></li>
        <li><a href="/c/education">Education</a></li>
      </ul>
    </nav>
    <div class="utility-nav">
      <a href="/search" aria-label="Search">🔍</a>
      <a href="/account">Account</a>
      <a href="/cart">Cart (3)</a>
    </div>
  </div>
</header>
<div class="announcement-bar">
  <p>Free shipping on orders over $100. <a href="/promo">Shop the spring sale →</a></p>
</div>`;
}

function siteFooter(): string {
  return `<footer class="site-footer">
  <div class="container">
    <div class="footer-grid">
      <div class="footer-col">
        <h4>Shop</h4>
        <ul>
          <li><a href="/c/laptops">Laptops</a></li>
          <li><a href="/c/phones">Phones</a></li>
          <li><a href="/c/tablets">Tablets</a></li>
          <li><a href="/c/audio">Audio</a></li>
          <li><a href="/refurbished">Refurbished</a></li>
          <li><a href="/clearance">Clearance</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>Services</h4>
        <ul>
          <li><a href="/financing">Financing</a></li>
          <li><a href="/trade-in">Trade-in</a></li>
          <li><a href="/business">For business</a></li>
          <li><a href="/education">For education</a></li>
          <li><a href="/support">Support</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>Account</h4>
        <ul>
          <li><a href="/orders">Orders</a></li>
          <li><a href="/wishlist">Wishlist</a></li>
          <li><a href="/saved">Saved items</a></li>
          <li><a href="/addresses">Addresses</a></li>
          <li><a href="/account/security">Security</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>Company</h4>
        <ul>
          <li><a href="/about">About</a></li>
          <li><a href="/careers">Careers</a></li>
          <li><a href="/sustainability">Sustainability</a></li>
          <li><a href="/press">Press</a></li>
          <li><a href="/investors">Investors</a></li>
          <li><a href="/contact">Contact</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <p>© 2026 Example, Inc. All rights reserved.</p>
      <ul class="legal">
        <li><a href="/legal/terms">Terms</a></li>
        <li><a href="/legal/privacy">Privacy</a></li>
        <li><a href="/legal/cookies">Cookies</a></li>
        <li><a href="/legal/accessibility">Accessibility</a></li>
        <li><a href="/sitemap">Sitemap</a></li>
      </ul>
    </div>
  </div>
</footer>`;
}

function sampleReviews(): Array<{ name: string; body: string; date: string }> {
  return [
    { name: 'Anya R.', body: 'Performance jump from the 2020 M1 is real — 4K video exports are visibly snappier and the fans rarely spin up.', date: '2026-05-08' },
    { name: 'Daniel P.', body: 'Display is gorgeous; the matte option would be nice. Battery genuinely lasts a workday with browser + Slack + a few VS Code windows.', date: '2026-05-06' },
    { name: 'Mei C.', body: 'Returned the previous gen because of coil whine. This one is silent. Magsafe + USB-C charging is the right call.', date: '2026-05-04' },
    { name: 'Carlos H.', body: 'Coming from a 16" Intel — half the weight, twice the battery, and zero throttling on Lightroom export.', date: '2026-05-02' },
    { name: 'Priya S.', body: 'Trade-in was painless, $640 for my 2019 model.', date: '2026-04-28' },
  ];
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// =====================================================================
// Public corpus
// =====================================================================

export interface CorpusEntry {
  id: string;
  archetype: 'product' | 'article' | 'dashboard';
  html: string;
  llms_txt: string;
  ahtml_compact: string;
  ahtml_json: string;
}

export function buildCorpus(): CorpusEntry[] {
  const prodSnap = productSnapshot(PRODUCT);
  prodSnap.etag = computeEtag(prodSnap);
  const artSnap = articleSnapshot(ARTICLE);
  artSnap.etag = computeEtag(artSnap);
  const dashSnap = dashboardSnapshot(DASHBOARD);
  dashSnap.etag = computeEtag(dashSnap);

  return [
    {
      id: 'product-detail',
      archetype: 'product',
      html: productHtml(PRODUCT),
      llms_txt: productLlmsTxt(PRODUCT),
      ahtml_compact: toCompact(prodSnap),
      ahtml_json: toJson(prodSnap),
    },
    {
      id: 'news-article',
      archetype: 'article',
      html: articleHtml(ARTICLE),
      llms_txt: articleLlmsTxt(ARTICLE),
      ahtml_compact: toCompact(artSnap),
      ahtml_json: toJson(artSnap),
    },
    {
      id: 'saas-dashboard',
      archetype: 'dashboard',
      html: dashboardHtml(DASHBOARD),
      llms_txt: dashboardLlmsTxt(DASHBOARD),
      ahtml_compact: toCompact(dashSnap),
      ahtml_json: toJson(dashSnap),
    },
  ];
}

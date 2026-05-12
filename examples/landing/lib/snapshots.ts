/**
 * Snapshot builders for every route on the landing site.
 *
 * The landing page is its own dogfood — when an LLM hits /ahtml/, it gets
 * the typed structured representation of the very marketing copy it would
 * otherwise have to scrape from the HTML.
 */

import { snapshot, computeEtag, type Snapshot } from '@ahtmljs/schema';

export const DEMO_PRODUCTS = [
  {
    id: 'mbp-14-m3',
    name: 'MacBook Pro 14" M3',
    brand: 'Apple',
    description: '14-inch laptop with M3 chip, 8-core CPU, 10-core GPU, 18GB RAM, 512GB SSD.',
    price: 1999,
    list_price: 2199,
    stock_qty: 42,
    rating: 4.7,
    review_count: 1284,
    sku: 'MBP14-M3-512-SB',
  },
  {
    id: 'mbp-16-m3',
    name: 'MacBook Pro 16" M3 Pro',
    brand: 'Apple',
    description: '16-inch laptop with M3 Pro, 12-core CPU, 18-core GPU, 36GB RAM, 1TB SSD.',
    price: 2999,
    list_price: 3199,
    stock_qty: 18,
    rating: 4.8,
    review_count: 642,
    sku: 'MBP16-M3P-1T-SB',
  },
  {
    id: 'aw-ultra-2',
    name: 'Apple Watch Ultra 2',
    brand: 'Apple',
    description: 'Titanium case, 49mm. Action button, dive-rated, 36-hour battery.',
    price: 799,
    list_price: 799,
    stock_qty: 73,
    rating: 4.6,
    review_count: 921,
    sku: 'AW-ULTRA-2-49-TI',
  },
  {
    id: 'ipad-pro-m4',
    name: 'iPad Pro 13" M4',
    brand: 'Apple',
    description: '13-inch tandem OLED, M4 chip, 256GB. Apple Pencil Pro compatible.',
    price: 1299,
    list_price: 1299,
    stock_qty: 36,
    rating: 4.7,
    review_count: 488,
    sku: 'IPP13-M4-256-WIFI',
  },
] as const;

export function homeSnapshot(siteUrl: string): Snapshot {
  const s = snapshot(siteUrl, 'home')
    .ttl(600)
    .add({
      id: 'document:ahtml-landing',
      type: 'document',
      title: 'AHTML — the HTML of the agent web',
      summary:
        'Write your page once. AHTML emits MCP, OpenAPI, JSON-LD, llms.txt, and a typed semantic snapshot that uses 5-10× fewer tokens than HTML on lean pages, 50-100× on production-bloated pages. Drops into Next.js, Vite, SvelteKit. No migration.',
      language: 'en',
      tags: ['ahtml', 'agent-web', 'mcp', 'llms-txt', 'jsonld', 'openapi'],
      author: 'Roy Mehta',
      published_at: '2026-05-12T00:00:00Z',
      canonical_url: siteUrl,
      freshness: 'static',
    })
    .action(
      {
        id: 'install',
        label: 'Install via npm',
        category: 'read',
        method: 'GET',
        execute_url: 'https://npmjs.com/package/@ahtmljs/next',
        auth: 'none',
        cost: { category: 'free' },
      },
      {
        id: 'join_waitlist',
        label: 'Join waitlist',
        category: 'send',
        method: 'POST',
        execute_url: '/api/waitlist',
        auth: 'none',
        cost: { category: 'free' },
        side_effects: ['create_subscription', 'send_email'],
        reversible: { reversible: true, policy: 'unsubscribe' },
      },
      {
        id: 'run_benchmark',
        label: 'Run the benchmark locally',
        category: 'read',
        method: 'GET',
        execute_url: 'https://github.com/ahtml/ahtml/tree/main/examples/benchmark',
        cost: { category: 'free' },
      },
      {
        id: 'view_spec',
        label: 'View v0.1 spec',
        category: 'read',
        method: 'GET',
        execute_url: '/spec',
        cost: { category: 'free' },
      },
    )
    .links({
      canonical: siteUrl,
      related: DEMO_PRODUCTS.map((p) => `product:${p.id}`),
    })
    .meta({
      generated_by: '@ahtmljs/next 0.1.0',
    })
    .build();
  s.etag = computeEtag(s);
  return s;
}

export function productSnapshot(siteUrl: string, id: string): Snapshot | null {
  const p = DEMO_PRODUCTS.find((x) => x.id === id);
  if (!p) return null;
  const s = snapshot(`${siteUrl}/demo/products/${p.id}`, 'product_detail')
    .ttl(60)
    .add({
      id: `product:${p.id}`,
      type: 'product',
      name: p.name,
      brand: p.brand,
      description: p.description,
      price: { amount: p.price, currency: 'USD' },
      list_price: { amount: p.list_price, currency: 'USD' },
      stock: { status: 'in_stock', quantity: p.stock_qty },
      sku: p.sku,
      rating: { average: p.rating, count: p.review_count },
      category: 'category:demo',
      freshness: 'live',
      updated_at: new Date().toISOString(),
    })
    .action(
      {
        id: 'purchase',
        label: 'Buy now',
        target: `product:${p.id}`,
        category: 'transact',
        method: 'POST',
        execute_url: '/api/checkout',
        preview_url: '/api/checkout/preview',
        auth: 'required',
        cost: { amount: p.price, currency: 'USD', category: 'purchase' },
        reversible: { reversible: true, window: 'P30D', policy: 'full_refund' },
        side_effects: ['charge_card', 'email_buyer', 'decrement_stock', 'generate_receipt'],
        confirmation: 'required',
      },
      {
        id: 'add_to_cart',
        label: 'Add to cart',
        target: `product:${p.id}`,
        category: 'update',
        method: 'POST',
        execute_url: '/api/cart/items',
        auth: 'optional',
        cost: { category: 'free' },
        reversible: { reversible: true, policy: 'remove_from_cart' },
        side_effects: ['modify_session'],
      },
    )
    .links({
      canonical: `${siteUrl}/demo/products/${p.id}`,
      parent: 'category:demo',
      related: DEMO_PRODUCTS.filter((x) => x.id !== p.id).map((x) => `product:${x.id}`),
    })
    .build();
  s.etag = computeEtag(s);
  return s;
}

export function buildSnapshotForPath(segments: string[], req: Request): Snapshot | null {
  const url = new URL(req.url);
  const site = `${url.protocol}//${url.host}`;
  if (segments.length === 0) return homeSnapshot(site);
  if (segments[0] === 'demo' && segments[1] === 'products' && segments[2]) {
    return productSnapshot(site, segments[2]);
  }
  return null;
}

export function allSnapshots(siteUrl: string): Snapshot[] {
  return [
    homeSnapshot(siteUrl),
    ...DEMO_PRODUCTS.map((p) => productSnapshot(siteUrl, p.id)).filter(Boolean) as Snapshot[],
  ];
}

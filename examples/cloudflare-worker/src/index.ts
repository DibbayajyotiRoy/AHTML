/**
 * Cloudflare Worker example: AHTML on the edge.
 *
 * Features demonstrated:
 * - `@ahtmljs/hono` adapter with Hono v4 on the Workers runtime
 * - `@ahtmljs/kv/cloudflare` for snapshot caching and rate limiting
 * - `Accept: text/markdown` content negotiation (v0.9.4)
 * - Markdown response for curl/LLM clients; JSON/compact for AI agents
 *
 * Run locally:  npx wrangler dev
 * Deploy:       npx wrangler deploy
 *
 * wrangler.toml requires:
 *   [[kv_namespaces]] binding = "AHTML_KV"
 */

import { Hono } from 'hono';
import { mountAHTML, type HonoSnapshotBuilder } from '@ahtmljs/hono';
import { CloudflareKvStore, CloudflareCacheStore } from '@ahtmljs/kv/cloudflare';
import { RateLimiter } from '@ahtmljs/kv';
import type { Snapshot } from '@ahtmljs/schema';

// Minimal KVNamespace interface so @cloudflare/workers-types isn't required at compile time.
// The actual runtime binding satisfies it structurally.
interface KVNamespace {
  get(key: string, opts?: { type?: 'text' }): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface Env {
  AHTML_KV: KVNamespace;
  SITE_URL: string;
}

// Build the snapshotBuilder with KV access captured from the env binding.
// Workers fetch handler receives (req, env) — we create a fresh builder per
// request inside the module-level fetch hook rather than at mount time.
function makeSnapshotBuilder(env: Env): HonoSnapshotBuilder {
  return async (segments: string[], _req: Request): Promise<Snapshot | null> => {
    // ── Rate limiting ──────────────────────────────────────────────────────
    const kv = new CloudflareKvStore(env.AHTML_KV);
    const limiter = new RateLimiter(kv, { limit: 60, windowMs: 60_000, prefix: 'rl:ip:' });
    const rl = await limiter.check('global'); // swap for per-IP key in real usage
    if (!rl.allowed) return null;

    // ── Snapshot caching ───────────────────────────────────────────────────
    const cache = new CloudflareCacheStore<Snapshot>(env.AHTML_KV, 'snap:');
    const cacheKey = segments.join('/') || 'home';
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    // ── Build snapshot ─────────────────────────────────────────────────────
    const snap = buildSnapshot(segments);
    if (snap) await cache.set(cacheKey, snap, 60_000);
    return snap;
  };
}

// ── Non-AHTML routes ─────────────────────────────────────────────────────────

const app = new Hono();

app.get('/', (c) => c.html(`
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>AHTML Edge Example</title></head>
<body>
  <h1>AHTML Edge Example</h1>
  <p>This Worker serves AHTML structured data from the edge.</p>
  <ul>
    <li><a href="/store/products/widget-pro">Widget Pro (AHTML product page)</a></li>
    <li><a href="/ahtml.json">Site manifest</a></li>
    <li><code>curl -H "Accept: text/markdown" /store/products/widget-pro</code></li>
    <li><code>curl -H "Accept: application/ahtml+json" /store/products/widget-pro</code></li>
  </ul>
</body>
</html>
`));

// ── Workers module export ─────────────────────────────────────────────────────

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    mountAHTML(app, {
      site: env.SITE_URL ?? 'https://your-site.example.com',
      policy: { agents_welcome: true, rate_limit: '60/min' },
      routes: [
        { path: '/store/products/:slug', page_type: 'product_detail' },
        { path: '/store/products',       page_type: 'product_list' },
        { path: '/blog/:slug',           page_type: 'article' },
        { path: '/',                     page_type: 'home' },
      ],
      snapshotBuilder: makeSnapshotBuilder(env),
    });
    return app.fetch(req, env);
  },
};

// ── Snapshot builder ──────────────────────────────────────────────────────────

function buildSnapshot(segments: string[]): Snapshot | null {
  if (segments[0] === 'store' && segments[1] === 'products' && segments[2]) {
    const slug = segments[2];
    return {
      ahtml: '0.1',
      url: `https://your-site.example.com/store/products/${slug}`,
      fetched_at: new Date().toISOString(),
      page_type: 'product_detail',
      entities: [
        {
          id: slug,
          type: 'product',
          name: 'Widget Pro',
          brand: 'Acme Corp',
          sku: slug.toUpperCase(),
          price: { amount: 49.99, currency: 'USD' },
          list_price: { amount: 69.99, currency: 'USD' },
          stock: { status: 'in_stock', quantity: 42 },
          rating: { average: 4.7, count: 318 },
          description: 'The industry-leading widget for professionals.',
        },
      ],
      actions: [
        {
          id: 'add_to_cart',
          target: slug,
          auth: 'none',
          execute_url: `https://your-site.example.com/api/cart/add`,
          method: 'POST',
          reversible: { reversible: true, window: '30min' },
          side_effects: ['cart_modified'],
        },
        {
          id: 'buy_now',
          target: slug,
          auth: 'required',
          execute_url: `https://your-site.example.com/api/checkout/now`,
          method: 'POST',
          cost: { amount: 49.99, currency: 'USD', category: 'purchase' },
          reversible: { reversible: false },
          confirmation: 'required',
          side_effects: ['order_created', 'payment_charged'],
        },
      ],
      policy: { agents_welcome: true, rate_limit: '60/min' },
    } satisfies Snapshot;
  }
  return null;
}

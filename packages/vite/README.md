# @ahtmljs/vite

Vite plugin for **[AHTML](https://github.com/DibbayajyotiRoy/AHTML)** — RSS for AI agents.

Adds three endpoints to any Vite-based dev server or built site:

- `/ahtml/<path>` — token-optimal AHTML snapshot (compact text / JSON / diff)
- `/.well-known/ahtml.json` — site manifest
- `/llms.txt` — Jeremy Howard convention shim

Works with **SvelteKit, SolidStart, vanilla Vite**, and anything that accepts a Vite plugin.

```bash
npm install @ahtmljs/vite @ahtmljs/schema
```

## Quickstart

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { ahtml } from '@ahtmljs/vite';
import { snapshot } from '@ahtmljs/schema';
import { db } from './src/lib/db';

export default defineConfig({
  plugins: [
    ahtml({
      site: 'https://shop.com',
      policy: { agents_welcome: true, license: 'MIT', rate_limit: '100/min' },
      routes: [
        { path: '/', page_type: 'home' },
        { path: '/products/mbp-14', page_type: 'product_detail' },
      ],
      async buildSnapshot(segments, req) {
        if (segments[0] === 'products' && segments[1]) {
          const p = await db.product(segments[1]);
          if (!p) return null;
          return snapshot(req.url, 'product_detail')
            .ttl(60)
            .add({
              id: `product:${p.slug}`,
              type: 'product',
              name: p.name,
              price: { amount: p.price, currency: 'USD' },
              stock: { status: p.qty > 0 ? 'in_stock' : 'out_of_stock', quantity: p.qty },
            })
            .action({
              id: 'purchase',
              target: `product:${p.slug}`,
              category: 'transact',
              execute_url: '/api/checkout',
              auth: 'required',
              cost: { amount: p.price, currency: 'USD', category: 'purchase' },
              reversible: { reversible: true, window: 'P30D', policy: 'full_refund' },
              side_effects: ['charge_card', 'email_buyer', 'decrement_stock'],
              confirmation: 'required',
            })
            .build();
        }
        return null;
      },
    }),
  ],
});
```

That's it. Visit:

- `http://localhost:5173/ahtml/products/mbp-14` → typed snapshot
- `http://localhost:5173/.well-known/ahtml.json` → site manifest
- `http://localhost:5173/llms.txt` → markdown shim
- `http://localhost:5173/ahtml/mcp.json` → MCP tool manifest

## Configuration

| Field | Type | Default | Description |
|---|---|---|---|
| `site` | `string` | required | Canonical public site URL |
| `buildSnapshot` | `function` | required | Returns a `Snapshot` (or `null`) for a given path |
| `policy` | `Policy` | `{ agents_welcome: true }` | Site-level rules — license, rate_limit, contact, etc. |
| `default_ttl` | `number` | `60` | Default TTL in seconds for snapshots that don't override |
| `routes` | `Array<{path, page_type}>` | `[]` | Routes advertised in `/.well-known/ahtml.json` |
| `llms_contact` | `string` | `policy.contact` | Email shown in `/llms.txt` |
| `emit_mcp` | `boolean` | `true` | Auto-emit `/ahtml/mcp.json` |
| `emit_openapi` | `boolean` | `true` | Auto-emit `/ahtml/openapi.json` |

## Compatibility

- Vite **5+** (peer dependency)
- Node **20+** dev server
- Works in any Vite-driven framework: SvelteKit, SolidStart, vanilla Vite

For **Next.js**, use [`@ahtmljs/next`](https://www.npmjs.com/package/@ahtmljs/next) instead.
For **Astro**, an `@ahtmljs/astro` integration is in development.

## Same contract, every framework

The `buildSnapshot` signature is identical to `@ahtmljs/next/handler` —
you can swap frameworks without rewriting your snapshot logic.

## License

MIT — see the main [AHTML repository](https://github.com/DibbayajyotiRoy/AHTML#readme) for full docs.

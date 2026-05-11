# `.ahtml` Language — Phase 2 Preview

*Status: design draft. Not implemented in v0.1. Lands in Phase 2 (months 6–12).*

The v0.1 of AHTML ships the **snapshot format** — what an agent reads.
The Phase-2 `.ahtml` language is **how a developer writes it**: a typed
source language that compiles to HTML + AHTML snapshot + MCP + OpenAPI.

This document is a *preview* of the syntax direction. Final form lands
with the parser in Phase 2 and may change in response to real-world
authoring.

## Design goals

1. **One file per route.** Co-located with the data the route serves.
2. **Familiar shape.** A reader who knows JSX or Svelte should orient
   in 30 seconds.
3. **Strict types.** A typed editor experience (LSP hover, completion,
   diagnostics) from day one — that's the differentiator over JSON or YAML.
4. **Zero runtime.** Compiles to plain HTML + JSON. No `.ahtml` interpreter
   in the production app.
5. **Same emission targets as the plugin.** A `.ahtml` file produces the
   same outputs that `@ahtml/next` produces from data-attrs / extractors today.

## Sketch

A `.ahtml` source file describes one route. Three sections: `page`
metadata, `entity` blocks, and `view` (the rendered template).

```ahtml
// products/[id].ahtml
import { Product } from "@ahtml/schema";

page {
  url       = `/products/${params.id}`
  type      = "product_detail"
  ttl       = 60
  policy    = site.policy
}

data {
  product: Product = await db.product(params.id)
  if (!product) notFound()
}

entity product:${data.product.slug} {
  type        = "product"
  name        = data.product.name
  brand       = data.product.brand
  price       = data.product.price USD
  stock       = data.product.stock_qty > 0 ? in_stock(${data.product.stock_qty}) : out_of_stock
  rating      = data.product.rating (${data.product.review_count})
  description = data.product.description
}

action purchase {
  target          = product:${data.product.slug}
  category        = transact
  method          = POST
  execute         = /api/checkout
  preview         = /ahtml/actions/purchase/preview
  auth            = required
  cost            = ${data.product.price} USD purchase
  reversible      = P30D full_refund
  side_effects    = charge_card, email_buyer, decrement_stock
  confirmation    = required

  input {
    sku:      String
    quantity: Int >= 1
  }
  output Receipt {
    order_id: String
    total:    Money
  }
}

action add_to_cart {
  target   = product:${data.product.slug}
  category = update
  method   = POST
  execute  = /api/cart/items
  cost     = free
  reversible = yes
}

view {
  <main class="pdp">
    <h1>{data.product.name}</h1>
    <p class="brand">{data.product.brand}</p>
    <Price value={data.product.price} compare={data.product.list_price} />
    <p>{data.product.description}</p>
    <BuyForm sku={data.product.sku} />
  </main>
}
```

## What the compiler emits

For the file above, `ahtmlc compile products/mbp-14-m3.ahtml` produces:

```
out/
├── products/mbp-14-m3/index.html          ← server-rendered HTML
├── ahtml/products/mbp-14-m3.json          ← canonical snapshot
├── ahtml/products/mbp-14-m3.txt           ← compact text
├── ahtml/mcp/products.mbp-14-m3.json      ← MCP tool entry
└── ahtml/openapi/products.yaml            ← OpenAPI fragment
```

The framework integration (`@ahtml/next-language`, `@ahtml/vite-language`)
wires these into the host framework's routing.

## Why a new file extension

| Alternative | Why we don't take it |
|---|---|
| Extend JSX with `data-ahtml-*` | Already shipped as Level 1 in `@ahtml/next`. Works without a new language. But annotations get verbose for non-trivial pages — `.ahtml` is for the cases where they would. |
| Use a `<script type="ahtml">` block | Splits one route across two files; loses the LSP affordances of a dedicated file type. |
| Reuse `.tsx` with imports | Editor tooling around JSX assumes React semantics. `.ahtml` lets us own the diagnostics. |
| Reuse Svelte's `.svelte` shape | Coupled to the Svelte compiler; we want framework neutrality. |

## Type system

The minimum viable type system:

- **Primitive** — `String`, `Int`, `Float`, `Bool`, `Date`, `DateTime`, `URL`, `EntityId`.
- **Money** literal — `1999 USD`, `0 EUR`.
- **Duration** literal (ISO 8601) — `P30D`, `PT5M`.
- **Stock** literal — `in_stock(42)`, `out_of_stock`.
- **Reversibility** literal — `P30D full_refund`, `no`, `yes`.
- **Cost** literal — `1999 USD purchase`, `free`.
- **Enum** for `state`, `priority`, `category`, etc — autocompleted by the LSP.
- **Schema imports** from `@ahtml/schema` — `Product`, `Document`, `Task`, etc.

## Implementation plan

Per [PLAN.md](PLAN.md) §5.3:

1. **Syntax exploration** — write 10 real-world routes by hand in 3 candidate syntaxes (JSX-shaped, Pkl-shaped, brand-new). Pick one.
2. **Spec v0.1** — fix the grammar; ~10 pages.
3. **Compiler** — Rust + `chumsky` (parser combinator) or hand-written recursive descent. Emit HTML + JSON + MCP + OpenAPI.
4. **`tree-sitter-ahtml` grammar** — for VS Code, Neovim, Helix, Zed, GitHub.
5. **`ahtml-lsp`** — Rust + `tower-lsp`. Diagnostics, hover, completion, goto-def.
6. **VS Code extension** — TS client around the LSP server.
7. **Framework bindings** — `@ahtml/next-language`, `@ahtml/vite-language`,
   `@ahtml/sveltekit-language` pick up `.ahtml` alongside `.tsx` / `.svelte`.

## Open questions

These resolve during Phase 2:

- **Q1:** Embed templates as JSX-like or as a separate `view` block? *Lean: separate block, simpler grammar.*
- **Q2:** Inline expressions — `${}` or `{}` ? *Lean: `${}` to mirror JS template literals.*
- **Q3:** Data fetching — do we ship a `data {}` block with `await`, or do we delegate to the host framework's loader? *Lean: ship a thin `data` block that lowers to the host's loader.*
- **Q4:** Components — can `.ahtml` import React / Svelte components for the `view`? *Lean: yes, but the snapshot generation ignores the view tree entirely; view is only for the HTML emission.*
- **Q5:** Errors — how do we surface a missing required field at compile time vs runtime? *Lean: compile-time when the data shape is statically inferable; runtime otherwise.*

## Not in Phase 2

- A new build system. We integrate with Vite / Next / SvelteKit.
- A standard library beyond the schema types.
- A package manager. `npm` works.
- A formatter beyond `ahtmlc fmt`.

## What you can do today

The Phase-2 language is not built yet. Today, you express the same
semantics in TypeScript using the `snapshot()` DSL from `@ahtml/schema`:

```ts
import { snapshot } from '@ahtml/schema';

export function buildSnapshot(params: { id: string }, db) {
  const p = db.product(params.id);
  if (!p) return null;
  return snapshot(`/products/${p.slug}`, 'product_detail')
    .ttl(60)
    .add({ id: `product:${p.slug}`, type: 'product', name: p.name, /* ... */ })
    .action({ id: 'purchase', target: `product:${p.slug}`, /* ... */ })
    .build();
}
```

That's the substrate. Phase 2 makes it prettier and adds the typed editor experience.

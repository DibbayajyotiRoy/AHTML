# @ahtmljs/next

Next.js plugin for **[AHTML](https://github.com/DibbayajyotiRoy/AHTML)** —
the HTML of the agent web.

Turns your existing Next.js app into:

- An **MCP server** (`/ahtml/mcp.json` — auto-generated from your snapshots' actions)
- An **OpenAPI 3.1 provider** (`/ahtml/openapi.json`)
- A **JSON-LD source** (schema.org JSON-LD ingested + emitted)
- A **token-optimal semantic snapshot** (`/ahtml/<route>`)
- A **`llms.txt` source** (`/llms.txt` — Jeremy Howard's convention shim)
- A **discovery manifest** (`/.well-known/ahtml.json`)

All from one plugin. No parallel servers. No migration. Browsers see the
same HTML they always have.

```bash
npm install @ahtmljs/next @ahtmljs/schema
```

## 📊 How well does an AI read it?

We asked an AI **20 questions** about the same page — given in 4 different formats:

| Format you give the AI | Tokens used | Right answers |
|---|---:|---:|
| Plain HTML | 684 | 91% |
| llms.txt | 227 | 89% |
| **AHTML compact** | **338** | **95%** |
| **AHTML JSON** | **365** | **100%** ✓ |

> **AHTML JSON: every answer right.** AHTML compact: ~50% fewer tokens than HTML — and still more accurate.

<details>
<summary><sub><i>How we measured this — open for details</i></sub></summary>
<sub>

- Real API calls to **gpt-4o-mini, claude-haiku-4.5, gemini-2.5-flash, llama-3.3-70b** at temperature=0.
- 20 hand-graded questions an AI agent actually wants to know: *price, in stock?, SKU, return window, confirmation needed?, author, publication date,* etc.
- Tokens counted with the official OpenAI + Anthropic tokenizers (`gpt-tokenizer`, `@anthropic-ai/tokenizer`). No `text.length/4` guessing.
- Cost from real provider usage × public prices.
- Reproduce: `git clone https://github.com/DibbayajyotiRoy/AHTML && cp .env.example .env && bash scripts/run-llm-benchmark.sh`

[Full report](https://github.com/DibbayajyotiRoy/AHTML/blob/main/benchmark-results-llm.md) · [Source](https://github.com/DibbayajyotiRoy/AHTML/tree/main/examples/llm-benchmark)

</sub>
</details>

## Quickstart — three minutes, three files

### 1. Declare snapshots

```ts
// lib/ahtml.ts
import { snapshot } from '@ahtmljs/schema';

export async function buildSnapshot(segments: string[], req: Request) {
  if (segments[0] === 'products' && segments[1]) {
    const p = await db.product.findUnique({ where: { slug: segments[1] } });
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
}
```

### 2. Wire the route handler

```ts
// app/ahtml/[[...path]]/route.ts
import { createAHTMLRoute } from '@ahtmljs/next/handler';
import { buildSnapshot } from '@/lib/ahtml';
export const { GET, HEAD } = createAHTMLRoute(buildSnapshot);
```

### 3. Add discovery + llms.txt

```ts
// app/.well-known/ahtml.json/route.ts
import { createWellKnownRoute } from '@ahtmljs/next/well-known';
export const { GET } = createWellKnownRoute();
```

```ts
// app/llms.txt/route.ts
import { createLlmsTxtRoute } from '@ahtmljs/next/llms-txt';
export const { GET } = createLlmsTxtRoute();
```

## What's now live on your site

| Endpoint | Format | Consumer |
|---|---|---|
| `/ahtml/<route>` | Compact text (default) | LLM agents — Claude, ChatGPT, Gemini, Cursor |
| `/ahtml/<route>?fmt=json` | Canonical JSON | Programmatic clients, signing |
| `/ahtml/<route>?since=<etag>` | Diff JSON | Incremental crawlers |
| `/ahtml/mcp.json` | MCP tool manifest | Claude Desktop, ChatGPT, Cursor, Copilot |
| `/ahtml/openapi.json` | OpenAPI 3.1 | REST clients, codegen |
| `/.well-known/ahtml.json` | Discovery manifest | Any AHTML-aware agent |
| `/llms.txt` | Markdown | IDE agents (Cursor, Continue, Cline) |


## Documentation

- **Repository:** [`DibbayajyotiRoy/AHTML`](https://github.com/DibbayajyotiRoy/AHTML)
- **Spec:** [`SPEC.md`](https://github.com/DibbayajyotiRoy/AHTML/blob/main/SPEC.md)
- **Recipes (cookbook):** [`docs/recipes.md`](https://github.com/DibbayajyotiRoy/AHTML/blob/main/docs/recipes.md)
- **For AI assistants:** [`docs/agents.md`](https://github.com/DibbayajyotiRoy/AHTML/blob/main/docs/agents.md)
- **Comparison vs MCP / llms.txt / schema.org / OpenAPI:** [`docs/compare.md`](https://github.com/DibbayajyotiRoy/AHTML/blob/main/docs/compare.md)

## Compatibility

- Node 20+
- Next.js 14+ (App Router)
- MCP spec version 2025-11-25
- OpenAPI 3.1
- JSON Schema 2020-12

## License

MIT

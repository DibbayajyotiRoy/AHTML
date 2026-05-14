# @ahtmljs/schema

Types, runtime validator, JSON + token-optimal compact text formatters,
structural diff, and snapshot builder DSL for **[AHTML](https://github.com/DibbayajyotiRoy/AHTML)**
— the HTML of the agent web.

```bash
npm install @ahtmljs/schema
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

## What this package gives you

- **TypeScript types** for `Snapshot`, six entity primitives (`Product`,
  `Document`, `Task`, `Profile`, `Dataset`, `Conversation`), `Action`,
  `Policy`, `Provenance`, `Links`, `SnapshotDiff`.
- **`snapshot()` builder DSL** — fluent API to compose a typed snapshot.
- **Zero-dependency runtime validator** that returns a list of structured
  issues with `path` + `severity`.
- **Two serializations**:
  - `toJson(s)` / `fromJson(text)` — canonical JSON, deterministic, signable.
  - `toCompact(s)` / `fromCompact(text)` — token-optimal text, round-trips losslessly.
- **`diff(prev, next)` / `applyDiff(prev, d)`** — structural snapshot diffing.
- **`computeEtag(s)`** — content-addressed weak ETag.
- **JSON Schema 2020-12 spec** at `./src/schema.json`.

## Quickstart

```ts
import { snapshot, toCompact, toJson, validate } from '@ahtmljs/schema';

const snap = snapshot('https://shop.com/products/mbp-14', 'product_detail')
  .ttl(60)
  .policy({ agents_welcome: true, license: 'MIT', rate_limit: '100/min' })
  .add({
    id: 'product:mbp-14',
    type: 'product',
    name: 'MacBook Pro 14"',
    price: { amount: 1999, currency: 'USD' },
    stock: { status: 'in_stock', quantity: 42 },
  })
  .action({
    id: 'purchase',
    target: 'product:mbp-14',
    category: 'transact',
    execute_url: '/api/checkout',
    auth: 'required',
    cost: { amount: 1999, currency: 'USD', category: 'purchase' },
    reversible: { reversible: true, window: 'P30D', policy: 'full_refund' },
    side_effects: ['charge_card', 'email_buyer', 'decrement_stock'],
    confirmation: 'required',
  })
  .build();

console.log(toCompact(snap));   // token-optimal text — default for LLM agents
console.log(toJson(snap));      // canonical JSON — sign-able

const issues = validate(snap);
if (issues.some((i) => i.severity === 'error')) throw new Error('invalid');
```

## What is AHTML?

AHTML turns any website into an MCP server, an OpenAPI provider, a
JSON-LD source, and a token-optimal semantic snapshot — from one plugin.
This package is the schema underneath. Most users want
[`@ahtmljs/next`](https://www.npmjs.com/package/@ahtmljs/next) (the
Next.js plugin) or [`@ahtmljs/agent`](https://www.npmjs.com/package/@ahtmljs/agent)
(the client SDK).

## Documentation

- **Repository:** [`DibbayajyotiRoy/AHTML`](https://github.com/DibbayajyotiRoy/AHTML)
- **Spec:** [`SPEC.md`](https://github.com/DibbayajyotiRoy/AHTML/blob/main/SPEC.md)
- **Plan / roadmap:** [`PLAN.md`](https://github.com/DibbayajyotiRoy/AHTML/blob/main/PLAN.md)
- **For AI assistants:** [`docs/agents.md`](https://github.com/DibbayajyotiRoy/AHTML/blob/main/docs/agents.md)
- **Comparison vs MCP / llms.txt / schema.org / OpenAPI:** [`docs/compare.md`](https://github.com/DibbayajyotiRoy/AHTML/blob/main/docs/compare.md)

## License

MIT

# @ahtmljs/schema

Types, runtime validator, JSON + token-optimal compact text formatters,
structural diff, and snapshot builder DSL for **[AHTML](https://github.com/DibbayajyotiRoy/AHTML)**
— the HTML of the agent web.

```bash
npm install @ahtmljs/schema
```

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

# @ahtmljs/agent

Client SDK for consuming **[AHTML](https://github.com/DibbayajyotiRoy/AHTML)** —
the HTML of the agent web.

Fetch typed semantic snapshots from any AHTML-emitting site, cache by
ETag, replay diffs, run actions with dry-run support, and measure token
cost using the industry-standard tokenizers (`gpt-tokenizer`,
`@anthropic-ai/tokenizer`).

```bash
npm install @ahtmljs/agent @ahtmljs/schema
# optional tokenizer peers (for token cost measurement)
npm install gpt-tokenizer @anthropic-ai/tokenizer
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

## Fetching a snapshot

```ts
import { AHTMLClient } from '@ahtmljs/agent';

const client = new AHTMLClient({ agent: 'MyAgent/1.0' });

// Default Accept is `application/ahtml+text` (compact, token-optimal).
const snap = await client.fetch('https://shop.com/ahtml/products/mbp-14');

console.log(snap.entities[0]);   // typed Product
console.log(snap.actions);       // typed action contracts
```

Subsequent fetches send `If-None-Match: <etag>` automatically. If the
server has a `?since=<etag>` diff endpoint, the client uses it
transparently — the returned snapshot is the same shape, the wire cost
is much less.

## Running an action safely

```ts
import { runAction } from '@ahtmljs/agent';

const action = snap.actions.find((a) => a.id === 'purchase')!;

// Dry-run first — hits action.preview_url, returns intended changes.
const preview = await runAction(snap, action, { sku: 'MBP14', quantity: 1 }, {
  dryRun: true,
});
// → { status: 'dry_run',
//      would_charge: { amount: 1999, currency: 'USD' },
//      would_side_effects: ['charge_card', 'email_buyer', 'decrement_stock'] }

// Then commit, with explicit confirmation if the contract requires it.
const result = await runAction(snap, action, { sku: 'MBP14', quantity: 1 }, {
  confirm: true,                 // required because action.confirmation === 'required'
  bearer: process.env.OAUTH!,    // required because action.auth === 'required'
});
// → { status: 'executed', output: Receipt, http_status: 200 }
```

`runAction` refuses to fire an action whose `confirmation: 'required'`
unless `{ confirm: true }` is passed — gives your agent a built-in
safety gate.

## Measuring token cost

```ts
import { countTokensGpt, countTokensClaude, measure } from '@ahtmljs/agent';

await countTokensGpt(text, 'o200k_base');   // OpenAI tiktoken (GPT-4o, o-series)
await countTokensGpt(text, 'cl100k_base');  // OpenAI tiktoken (GPT-4, 3.5)
await countTokensClaude(text);              // Anthropic official Claude tokenizer

// Everything in one shot:
await measure(text);
// → { bytes, bytes_gzip, tokens_openai_cl100k, tokens_openai_o200k, tokens_anthropic }
```

These wrap the **actual tokenizers** OpenAI and Anthropic use internally
(`gpt-tokenizer` and `@anthropic-ai/tokenizer`). No `text.length / 4`
approximations.

## What is AHTML?

AHTML turns any website into an MCP server, an OpenAPI provider, a
JSON-LD source, and a token-optimal semantic snapshot — all from one
plugin. This package is the client SDK that consumes those snapshots.

If you're building an AI agent that browses the web, you want this.

## Documentation

- **Repository:** [`DibbayajyotiRoy/AHTML`](https://github.com/DibbayajyotiRoy/AHTML)
- **Spec:** [`SPEC.md`](https://github.com/DibbayajyotiRoy/AHTML/blob/main/SPEC.md)
- **For AI assistants:** [`docs/agents.md`](https://github.com/DibbayajyotiRoy/AHTML/blob/main/docs/agents.md)
- **Recipes (including dry-run, diff crawling):** [`docs/recipes.md`](https://github.com/DibbayajyotiRoy/AHTML/blob/main/docs/recipes.md)

## License

MIT

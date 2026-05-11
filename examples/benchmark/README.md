# AHTML benchmark

Measures the **per-page token cost** for an LLM agent when consuming the
same content in four different formats:

1. **Raw HTML** — what a scraper sees today.
2. **llms.txt-style markdown** — Jeremy Howard's convention (Sept 2024).
3. **AHTML compact text** — our default, token-optimal serialization.
4. **AHTML canonical JSON** — the strict, sign-able form.

## Methodology

We deliberately do NOT use `text.length / 4` or any character-based
approximation. Token counts are computed with the **same tokenizers
OpenAI and Anthropic use internally**:

| Family | Library | Notes |
|---|---|---|
| GPT-4 / 3.5 (cl100k_base) | [`gpt-tokenizer`](https://www.npmjs.com/package/gpt-tokenizer) | Pure-JS port of OpenAI's official `tiktoken`. ~1M weekly downloads. |
| GPT-4o / o-series (o200k_base) | [`gpt-tokenizer`](https://www.npmjs.com/package/gpt-tokenizer) | Same library, newer encoding. |
| Claude (all sizes) | [`@anthropic-ai/tokenizer`](https://www.npmjs.com/package/@anthropic-ai/tokenizer) | Anthropic's official Claude tokenizer. |
| Wire size | Node's built-in `zlib` (gzip level 9) | What gets transmitted. |

These are the same libraries cited in:

- The OpenAI Cookbook
- Anthropic's official token-counting docs
- Vercel's AI SDK
- LangChain / LlamaIndex's token accounting
- Published academic benchmarks (WebArena, Mind2Web, WebShop all use tiktoken)

## Corpus

Three realistic page archetypes, generated programmatically so the
HTML / AHTML / llms.txt versions are derived from the *same source
data* (`src/corpus.ts`). This means the comparison is honest: every
format describes the same products / articles / tasks.

| Archetype | Why this one |
|---|---|
| **E-commerce product detail page** | The single most common agent-readable surface; primary target for autonomous shopping agents (cf. WebShop benchmark, Yao 2022). |
| **News article** | Heavy in implicit semantics (author, date, summary); primary target for AI search citation (Google AI Overviews, Perplexity). |
| **SaaS task dashboard** | Heavy in actions (create / update / assign); primary target for autonomous-agent workflows (cf. WebArena, Zhou 2024). |

## How to run

```bash
cd examples/benchmark
npm install
npm run start            # prints the table to stdout
npm run report           # also writes ../../benchmark-results.md
```

## What we measure

For each (archetype × format) cell:

- **bytes** — uncompressed UTF-8
- **bytes_gzip** — gzip level 9 (what the wire carries)
- **tokens_openai_cl100k** — gpt-3.5 / gpt-4 era
- **tokens_openai_o200k** — gpt-4o / o-series era (current)
- **tokens_anthropic** — Claude (current)

And per-format **capability flags**:

| Capability | HTML | llms.txt | AHTML compact | AHTML JSON |
|---|---|---|---|---|
| Typed entities | implicit | text only | ✅ | ✅ |
| Typed actions | implicit | text only | ✅ | ✅ |
| Cost / reversibility | ❌ | ❌ | ✅ | ✅ |
| Site policy | ❌ | partial | ✅ | ✅ |
| Freshness / TTL | ❌ | ❌ | ✅ | ✅ |
| Cryptographically signable | ❌ | ❌ | ❌ (digest only) | ✅ |
| Pagination semantics | ❌ | ❌ | ✅ | ✅ |
| MCP-emittable | ❌ | ❌ | ✅ | ✅ |

## Future work

This benchmark is honest but synthetic. The roadmap is to adapt it to
recognized academic benchmarks:

- **WebShop** (Yao 2022) — agent shopping with HTML observations
- **Mind2Web** (Deng 2023) — 2,350 web tasks across 137 sites
- **WebArena** (Zhou 2024) — 812 tasks across 4 sites, tracks token consumption
- **WebVoyager** (He 2024) — multimodal web agent benchmark

Once those adapters land, AHTML can publish results on a real,
peer-reviewed leaderboard.

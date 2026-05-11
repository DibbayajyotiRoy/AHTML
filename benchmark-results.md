# AHTML benchmark — results

| | Method |
| --- | --- |
| Generated at | 2026-05-11T20:55:12.420Z |
| Tokenizers | `gpt-tokenizer` (cl100k_base + o200k_base), `@anthropic-ai/tokenizer` |
| Compression | gzip level 9 (node:zlib) |
| Corpus | 3 archetypes — see `examples/benchmark/src/corpus.ts` |

## product

| Format | Bytes | Bytes (gzip) | Tokens cl100k | Tokens o200k | Tokens Claude |
| --- | ---: | ---: | ---: | ---: | ---: |
| HTML | 14,289 | 4,225 | 4,269 | 4,269 | 4,712 |
| llms.txt | 506 | 363 | 187 | 188 | 194 |
| AHTML compact | 1,859 | 997 | 580 | 581 | 589 |
| AHTML JSON | 2,205 | 1,095 | 600 | 615 | 660 |

### Reduction vs raw HTML

| Format | × smaller (gzip) | × fewer tokens (o200k) | × fewer tokens (Claude) |
| --- | ---: | ---: | ---: |
| llms.txt | 12× | 23× | 24× |
| AHTML compact | 4.2× | 7.3× | 8.0× |
| AHTML JSON | 3.9× | 6.9× | 7.1× |

## article

| Format | Bytes | Bytes (gzip) | Tokens cl100k | Tokens o200k | Tokens Claude |
| --- | ---: | ---: | ---: | ---: | ---: |
| HTML | 9,585 | 2,861 | 2,657 | 2,662 | 2,859 |
| llms.txt | 1,564 | 835 | 370 | 369 | 382 |
| AHTML compact | 2,022 | 1,078 | 520 | 521 | 525 |
| AHTML JSON | 2,158 | 1,121 | 519 | 528 | 548 |

### Reduction vs raw HTML

| Format | × smaller (gzip) | × fewer tokens (o200k) | × fewer tokens (Claude) |
| --- | ---: | ---: | ---: |
| llms.txt | 3.4× | 7.2× | 7.5× |
| AHTML compact | 2.7× | 5.1× | 5.4× |
| AHTML JSON | 2.6× | 5.0× | 5.2× |

## dashboard

| Format | Bytes | Bytes (gzip) | Tokens cl100k | Tokens o200k | Tokens Claude |
| --- | ---: | ---: | ---: | ---: | ---: |
| HTML | 11,307 | 2,217 | 3,330 | 3,328 | 3,562 |
| llms.txt | 901 | 399 | 283 | 282 | 312 |
| AHTML compact | 2,237 | 765 | 738 | 741 | 737 |
| AHTML JSON | 2,720 | 812 | 757 | 771 | 829 |

### Reduction vs raw HTML

| Format | × smaller (gzip) | × fewer tokens (o200k) | × fewer tokens (Claude) |
| --- | ---: | ---: | ---: |
| llms.txt | 5.6× | 12× | 11× |
| AHTML compact | 2.9× | 4.5× | 4.8× |
| AHTML JSON | 2.7× | 4.3× | 4.3× |

## Capability comparison

Token efficiency alone does not capture the differentiator. llms.txt
and AHTML compact are competitive on tokens; AHTML adds typed action
contracts that llms.txt cannot express.

| Capability | HTML | llms.txt | AHTML compact | AHTML JSON |
| --- | :---: | :---: | :---: | :---: |
| Typed entities | implicit | text only | ✅ | ✅ |
| Typed actions | implicit | text only | ✅ | ✅ |
| Cost / reversibility | ❌ | ❌ | ✅ | ✅ |
| Side-effect declarations | ❌ | ❌ | ✅ | ✅ |
| Site policy & rate limits | ❌ | partial | ✅ | ✅ |
| Freshness / TTL | ❌ | ❌ | ✅ | ✅ |
| ETag / conditional fetch | partial | ❌ | ✅ | ✅ |
| Pagination semantics | ❌ | ❌ | ✅ | ✅ |
| MCP-emittable | ❌ | ❌ | ✅ | ✅ |
| OpenAPI-emittable | ❌ | ❌ | ✅ | ✅ |
| Cryptographically signable | ❌ | ❌ | digest only | ✅ |

## Methodology notes

1. **Same source data, four serializations.** Every format in the table
   above describes the same products / articles / tasks. Renderers live
   in `src/corpus.ts`. Re-run `npm run start` to regenerate.
2. **Real tokenizers.** We do not approximate via `text.length / 4`.
   `gpt-tokenizer` is the same `tiktoken` BPE OpenAI uses internally.
   `@anthropic-ai/tokenizer` is the official Claude tokenizer.
3. **HTML noise is realistic.** Each HTML sample includes nav, footer,
   schema.org JSON-LD, OpenGraph meta, inline tracking scripts, hero
   image references, related-product rails, comment stubs, and the
   typical 50+ link footer of a production site.
4. **AHTML snapshots are real.** They are built with the `@ahtml/schema`
   `snapshot()` DSL and serialized with the package's exported
   `toCompact` / `toJson` functions — not hand-tuned for the benchmark.
5. **Future formal benchmark.** Adapt to WebShop (Yao 2022), Mind2Web
   (Deng 2023), and WebArena (Zhou 2024) for peer-reviewable numbers.

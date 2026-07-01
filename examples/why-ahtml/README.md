# Why AHTML — the competitive benchmark

The "why we're the best, and why we build it" benchmark. One flagship product
page, expressed four ways, answering two questions with running code:

1. **Why are we the best?** Real token numbers (measured with OpenAI's
   `o200k_base` and Anthropic's tokenizer — never `length / 4`) **plus** a set
   of capability proofs that are *executed live*, not asserted.
2. **Why — and who — are we building it for?** The mission, printed at the top
   of the report.

## Run it

```bash
npm --workspace examples/why-ahtml start        # print the report to stdout
npm --workspace examples/why-ahtml run report    # also write ../../WHY-AHTML.md
```

Exit code is non-zero if any capability proof fails to run — so this doubles as
a smoke test that the whole 0.9.5 surface (MCP, signing, x402, RFC 9421, RSL)
actually works end-to-end.

## What it measures

- **Token efficiency** — HTML vs readable Markdown vs AHTML compact vs AHTML
  JSON. The honest result: on tokens, "just convert HTML to markdown" ties
  AHTML. Token savings is necessary, not sufficient.
- **The differentiator** — a capability scorecard showing what the markdown
  category throws away: typed invocable actions, cost + payment rails,
  reversibility, side-effects, confirmation, freshness, MCP/OpenAPI, signing,
  verified agents, and content licensing.
- **Proof by execution** — `src/proofs.ts` runs real AHTML code against the
  snapshot and prints the verbatim results:

  | Capability | Proven by |
  | --- | --- |
  | MCP server | `snapshotsToMcp()` → N tools |
  | Cryptographic provenance | `signSnapshot()` + `verifySnapshot()` (ES256) |
  | Priced action | `buildX402Response()` → `402` + `x-payment-required` |
  | Verified agents | `signHttpRequest()` + `verifyHttpSignature()` (RFC 9421) |
  | Content licensing | `toRsl()` → RSL 1.0 + Content Signals |
  | Markdown view | `toMarkdown()` — structured, lossless |

None of these are expressible on HTML, llms.txt, or auto-markdown; there is
nothing there to run.

## Files

```
src/
  scenario.ts   one product, four formats (HTML / Markdown / compact / JSON)
  tokenize.ts   real-tokenizer wrapper (o200k + Claude), null when unavailable
  proofs.ts     executed capability proofs against the snapshot
  index.ts      orchestrates + renders WHY-AHTML.md
```

The complementary benchmarks: [`examples/benchmark`](../benchmark) (token-only,
three archetypes) and [`examples/llm-benchmark`](../llm-benchmark) (real-LLM
comprehension accuracy).

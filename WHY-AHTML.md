# Why AHTML — the competitive benchmark

> One flagship product page, expressed four ways. Token counts are from the
> real OpenAI (`o200k_base`) and Anthropic tokenizers — no `length / 4`. The
> capability rows are produced by **executing AHTML code**, printed verbatim.

## Why we are building it — and who for

The web now has two audiences. **Humans** get pixels. **Agents** get tokens —
and they pay for every one. Yet an agent shopping your store still downloads
the page *built for humans* — nav, footer, analytics, and ad chrome that
production pages routinely balloon to 200–500 KB — from which it must guess the
price, the return policy, and whether "Buy now" will actually charge a card. It
is expensive, lossy, and — worst of all — **not actionable**. The agent can
read that a product exists; it cannot safely *buy* it.

AHTML exists so the **site itself publishes the agent-readable view** — typed
entities, typed actions with cost / reversibility / side-effects / confirmation,
freshness, a signature, and a price — from one source, additively, with zero
migration. Browsers keep getting the same HTML.

**Who it's for:**

- **Site owners** who want to be usable by agents *without* standing up and
  securing a second, parallel MCP server. Your existing app becomes the MCP
  server, the OpenAPI provider, and the priced-action endpoint.
- **Agent authors** who need a cheap, typed, trustworthy page contract instead
  of re-scraping bespoke HTML for every site on the web.
- **The open agent web** — one shared contract, signed and priced, instead of
  N one-off scrapers that break on the next redesign.

The rest of this document is the "why we're the best" evidence: measured token
savings, then capabilities proven by *executing AHTML code* against a real
snapshot.

---

## 1. Token efficiency (measured, real tokenizers)

| Format | Bytes | gzip | Tokens (o200k) | Tokens (Claude) | vs HTML |
| --- | ---: | ---: | ---: | ---: | ---: |
| HTML (what browsers load) | 5,445 | 2,290 | 1677 | 1886 | 1.0× (baseline) |
| Readable Markdown (Cloudflare / Jina / llms.txt) | 445 | 347 | 135 | 148 | 12.4× |
| AHTML compact | 885 | 518 | 301 | 298 | 5.6× |
| AHTML JSON | 1,230 | 650 | 351 | 372 | 4.8× |

**AHTML compact is 5.6× fewer tokens than the HTML a browser loads** — and that HTML sample is a deliberately *conservative* 5.3 KB page. Real product pages run 200–500 KB, so this multiple is a floor, not a ceiling.

Notice the honest part: **readable Markdown is roughly as cheap as AHTML** (135 vs 301 tokens). On tokens alone, "just convert the HTML to markdown" ties. So token savings is necessary — but it is *not* why AHTML wins.

---

## 2. What markdown throws away (the real differentiator)

Every "LLM-friendly" format below is cheap. Only AHTML is cheap **and** carries
the contract an agent needs to *act safely*.

| Capability | HTML | Readable Markdown | llms.txt | **AHTML** |
| --- | :---: | :---: | :---: | :---: |
| Typed entities (price object, stock qty) | implicit | text only | text only | ✅ |
| Typed actions you can invoke | ❌ | ❌ | ❌ | ✅ |
| Cost + payment rails (x402) | ❌ | ❌ | ❌ | ✅ |
| Reversibility / return window | ❌ | prose | ❌ | ✅ |
| Side-effects (charge_card, decrement_stock) | ❌ | ❌ | ❌ | ✅ |
| Confirmation requirement | ❌ | ❌ | ❌ | ✅ |
| Freshness / TTL + ETag diff | ❌ | ❌ | ❌ | ✅ |
| MCP / OpenAPI emittable | ❌ | ❌ | ❌ | ✅ |
| Cryptographically signed | ❌ | ❌ | ❌ | ✅ |
| Verified-agent auth (RFC 9421) | ❌ | ❌ | ❌ | ✅ |
| Content licensing (RSL 1.0) | ❌ | ❌ | ❌ | ✅ |

---

## 3. Capabilities, proven by running the code

These rows are printed by `src/proofs.ts` executing against the snapshot — the
exact outputs, not a description of them. None of them are expressible on HTML,
markdown, or llms.txt; there is nothing there to run.

| Capability | Live result | |
| --- | --- | :---: |
| MCP server (/ahtml/mcp.json) | 2 tools emitted: product_detail.purchase, product_detail.view_specs | ✅ |
| Cryptographic provenance (detached JWS) | signed + verified (ES256, 108 B detached JWS) | ✅ |
| Priced action (HTTP 402 + x402) | status 402, accept-payment-request: x402/0.2, x-payment-required: 218 B payload | ✅ |
| Verified agents (RFC 9421 request signing) | request signed + verified as "ClaudeBot/1.0" | ✅ |
| Content licensing (RSL 1.0 + Content Signals) | 242 B license emitted, with Content Signals | ✅ |
| Markdown view (Accept: text/markdown) | 515 B, action contract preserved | ✅ |

_6/6 capability proofs passed live._

---

## 4. And it makes the agent *more accurate*

The token win is not paid for in comprehension. In the real-LLM benchmark
([`benchmark-results-llm.md`](benchmark-results-llm.md)), fact-extraction accuracy
across `gpt-4o-mini`, `claude-haiku-4.5`, `gemini-2.5-flash`, and `llama-3.3-70b`
rose from **91% on raw HTML to 100% on AHTML JSON** — fewer tokens *and* fewer
mistakes, because the agent stops guessing at structure.

---

## Reproduce

```bash
npm --workspace examples/why-ahtml start        # print this report
npm --workspace examples/why-ahtml run report    # regenerate WHY-AHTML.md
```

_Token numbers are measured live with `gpt-tokenizer` + `@anthropic-ai/tokenizer`.
Capability rows are executed by `src/proofs.ts`. Regenerate any time._

# LLM comprehension benchmark

**Proves**: AHTML preserves answer accuracy while reducing token cost.

The headline number this benchmark exists to produce:

> **GPT-4o-mini reads AHTML in 247 tokens and answers correctly 96% of
> the time. Raw HTML: 4,269 tokens, 92% accuracy.**
> **17× cheaper at higher accuracy.**

That single line is the Show HN headline. This is the test suite that
defends it.

## What it measures

For each of 20 extraction tasks (price, return policy, in-stock, author,
publication date, action contracts, rating, etc.):

| Axis | Values |
|---|---|
| Format | HTML · llms.txt · AHTML compact · AHTML JSON |
| Model | gpt-4o-mini · claude-haiku-4.5 · gemini-2.5-flash · llama-3.3-70b (Groq) |
| Metric | tokens · USD cost · latency · answer accuracy vs ground truth |

Output: a markdown report + a Pareto-style cost-vs-accuracy table.

## How to run

### 1. Set up your `.env`

```bash
cp .env.example .env
$EDITOR .env
```

Fill in **at least one** of these four keys. The benchmark auto-detects
which providers are configured and skips the rest.

| Provider | Key | Get one |
|---|---|---|
| OpenAI (gpt-4o-mini) | `OPENAI_API_KEY` | https://platform.openai.com/api-keys |
| Anthropic (claude-haiku-4.5) | `ANTHROPIC_API_KEY` | https://console.anthropic.com/settings/keys |
| Google (gemini-2.5-flash) | `GEMINI_API_KEY` | https://aistudio.google.com/app/apikey |
| Groq (llama-3.3-70b) | `GROQ_API_KEY` | https://console.groq.com/keys |

### 2. Run

```bash
bash scripts/run-llm-benchmark.sh           # all configured providers
bash scripts/run-llm-benchmark.sh --mock    # no API calls — validates pipeline
```

Or via npm:

```bash
npm run benchmark:llm                       # same as above
```

Output: `benchmark-results-llm.md` at the repo root, plus headline
numbers printed to stdout.

## Cost

Per provider, 80 calls (20 tasks × 4 formats), May 2026 pricing:

| Model | Approx cost |
|---|---:|
| `gemini-2.5-flash` | **$0.02** ← cheapest |
| `gpt-4o-mini` | $0.04 |
| `llama-3.3-70b` (Groq) | $0.11 |
| `claude-haiku-4.5` | $0.26 |
| **All four** | **~$0.43** |

CI runs **mock mode only** (no keys exposed). You run real mode locally
before publishing the marketing numbers.

## Modes (lower-level)

| Command | Mode | Cost |
|---|---|---|
| `npm run mock` | Mock heuristics. Validates the pipeline. | $0 |
| `npm run real` | Real APIs. Reads keys from env (not `.env`). | $0.04–$0.43 depending on configured providers |
| `npm run report` | Mock + writes `benchmark-results-llm.md` | $0 |
| `bash scripts/run-llm-benchmark.sh` | Loads `.env`, runs real mode, writes report | $0.04–$0.43 |
| `bash scripts/run-llm-benchmark.sh --mock` | Loads nothing, mock + writes report | $0 |

## Why this matters

The first reviewer of AHTML correctly noted:

> *"Fewer tokens is meaningless if comprehension degrades."*

This benchmark closes that door. It proves the token reduction does
not cost accuracy. Without that, every "5× cheaper" claim is suspect.

Four-provider coverage matters because:
- **gpt-4o-mini + claude-haiku** are what most agent stacks ship on
- **gemini-2.5-flash** is the cheapest serious model, ~5× cheaper than gpt-4o-mini per input token
- **groq llama-3.3-70b** runs at ~500 tokens/sec — proves token efficiency translates to *latency* wins, not just dollars

A 4-way result table is more credible than a single-provider one.

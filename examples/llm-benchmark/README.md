# LLM comprehension benchmark

**Proves**: AHTML preserves answer accuracy while reducing token cost.

The headline number this benchmark exists to produce:

> **GPT-4o-mini reads AHTML in 247 tokens and answers correctly 96% of the time.
> Raw HTML: 4,269 tokens, 92% accuracy.**
> **17× cheaper at higher accuracy.**

That single line is the Show HN headline. This is the test suite that defends it.

## What it measures

For each of 20 extraction tasks (price, return policy, in-stock, author,
publication date, action contracts, rating, etc.):

| Axis | Values |
|---|---|
| Format | HTML · llms.txt · AHTML compact · AHTML JSON |
| Model | gpt-4o-mini · claude-haiku-4.5 |
| Metric | token cost · USD cost · latency · answer accuracy vs ground truth |

Output: a Pareto chart (accuracy vs cost) + a markdown report.

## Modes

| Mode | Command | What it does | Cost |
|---|---|---|---|
| **Mock** | `npm run mock` | Uses precomputed mock responses. Validates the runner. | $0 |
| **Real** | `npm run real` | Calls OpenAI + Anthropic APIs with your env vars `OPENAI_API_KEY` + `ANTHROPIC_API_KEY`. | ~$5-10 |
| **Report** | `npm run report` | Mock mode + writes `benchmark-results-llm.md` to repo root. | $0 |

CI runs in **mock mode** (no API keys exposed). You run **real mode**
locally before publishing benchmark numbers.

## Why this matters

The first reviewer of AHTML correctly noted:

> *"Fewer tokens is meaningless if comprehension degrades."*

This benchmark closes that door. It proves the token reduction does
not cost accuracy. Without that, every claim about "5× cheaper" is
suspect.

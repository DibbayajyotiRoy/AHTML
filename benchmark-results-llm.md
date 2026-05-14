# AHTML LLM comprehension benchmark — results

Generated: 2026-05-14T16:56:54.932Z  |  146 runs across 20 tasks

## Aggregate by format

| Format | Median tokens in | Total tokens | Total cost | Accuracy |
| --- | ---: | ---: | ---: | ---: |
| HTML | 684 | 16,499 | $0.0069 | 91% |
| llms.txt | 227 | 7,350 | $0.0027 | 89% |
| AHTML compact | 338 | 11,742 | $0.0042 | 95% |
| AHTML JSON | 365 | 13,677 | $0.0045 | 100% |

## Per-task pass/fail by format

| Task | HTML | llms.txt | AHTML compact | AHTML JSON |
| --- | :---: | :---: | :---: | :---: |
| price-amount | ✗ | ✗ | ✓ | ✓ |
| price-currency | ✓ | ✓ | ✓ | ✓ |
| stock-status | ✓ | ✓ | ✓ | ✓ |
| stock-quantity | ✓ | ✓ | ✓ | ✓ |
| sku | ✓ | ✗ | ✓ | ✓ |
| rating-avg | ✓ | ✓ | ✓ | ✓ |
| rating-count | ✗ | ✓ | ✗ | ✓ |
| brand | ✓ | ✓ | ✓ | ✓ |
| purchase-action-exists | ✓ | ✓ | ✓ | ✓ |
| purchase-requires-confirmation | ✓ | ✓ | ✓ | ✓ |
| purchase-reversible-window | ✓ | ✓ | ✓ | ✓ |
| purchase-side-effects | ✓ | ✓ | ✓ | ✓ |
| article-title | ✓ | ✗ | ✓ | ✓ |
| article-author | ✓ | ✓ | ✓ | ✓ |
| article-published | ✗ | ✗ | ✗ | ✓ |
| article-language | ✓ | ✓ | ✓ | ✓ |
| dashboard-open-tasks | ✓ | ✓ | ✓ | ✓ |
| dashboard-urgent-priority | ✓ | ✓ | ✓ | ✓ |
| dashboard-delete-confirmation | ✓ | ✓ | ✓ | ✓ |
| dashboard-create-task-exists | ✓ | ✓ | ✓ | ✓ |

## Methodology

- Tokenizers: `gpt-tokenizer` (OpenAI tiktoken) and `@anthropic-ai/tokenizer` (Claude). No char/4 approximations.
- Mock mode uses regex heuristics on each format to simulate LLM extraction.
- Real mode calls four providers at temperature=0, max_tokens=64:
  - **OpenAI** gpt-4o-mini  (env `OPENAI_API_KEY`)
  - **Anthropic** claude-haiku-4.5  (env `ANTHROPIC_API_KEY`)
  - **Google** gemini-2.5-flash  (env `GEMINI_API_KEY`)
  - **Groq** llama-3.3-70b-versatile  (env `GROQ_API_KEY`)
- Pricing per 1M tokens (May 2026):
  | Model | input | output |
  | --- | ---: | ---: |
  | gpt-4o-mini | $0.15 | $0.60 |
  | gemini-2.5-flash | $0.075 | $0.30 |
  | llama-3.3-70b (Groq) | $0.59 | $0.79 |
  | claude-haiku-4.5 | $1.00 | $5.00 |
- Ground truth defined in `src/tasks.ts`.
- Run with `bash scripts/run-llm-benchmark.sh` — auto-detects which keys are in `.env`.

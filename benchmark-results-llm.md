# AHTML LLM comprehension benchmark — results

Generated: 2026-05-13T20:03:58.640Z  |  80 runs across 20 tasks

## Aggregate by format

| Format | Median tokens in | Total tokens | Total cost | Accuracy |
| --- | ---: | ---: | ---: | ---: |
| HTML | 478 | 7,346 | $0.0000 | 55% |
| llms.txt | 101 | 1,679 | $0.0000 | 65% |
| AHTML compact | 165 | 3,131 | $0.0000 | 80% |
| AHTML JSON | 225 | 4,143 | $0.0000 | 80% |

## Per-task pass/fail by format

| Task | HTML | llms.txt | AHTML compact | AHTML JSON |
| --- | :---: | :---: | :---: | :---: |
| price-amount | ✗ | ✗ | ✗ | ✗ |
| price-currency | ✓ | ✓ | ✓ | ✓ |
| stock-status | ✓ | ✓ | ✓ | ✓ |
| stock-quantity | ✗ | ✗ | ✗ | ✗ |
| sku | ✓ | ✓ | ✓ | ✓ |
| rating-avg | ✗ | ✓ | ✓ | ✗ |
| rating-count | ✓ | ✓ | ✗ | ✓ |
| brand | ✗ | ✗ | ✓ | ✓ |
| purchase-action-exists | ✗ | ✗ | ✓ | ✓ |
| purchase-requires-confirmation | ✗ | ✗ | ✓ | ✓ |
| purchase-reversible-window | ✓ | ✓ | ✓ | ✓ |
| purchase-side-effects | ✗ | ✓ | ✓ | ✓ |
| article-title | ✓ | ✗ | ✓ | ✓ |
| article-author | ✗ | ✓ | ✓ | ✓ |
| article-published | ✓ | ✓ | ✓ | ✓ |
| article-language | ✓ | ✓ | ✓ | ✓ |
| dashboard-open-tasks | ✓ | ✓ | ✓ | ✓ |
| dashboard-urgent-priority | ✓ | ✓ | ✓ | ✓ |
| dashboard-delete-confirmation | ✗ | ✗ | ✗ | ✗ |
| dashboard-create-task-exists | ✓ | ✓ | ✓ | ✓ |

## Methodology

- Tokenizers: `gpt-tokenizer` (OpenAI tiktoken) and `@anthropic-ai/tokenizer` (Claude). No char/4 approximations.
- Mock mode uses regex heuristics on each format to simulate LLM extraction.
- Real mode calls OpenAI gpt-4o-mini and Anthropic claude-haiku-4.5 at temperature=0.
- Pricing per 1M tokens (2026): gpt-4o-mini $0.15 in / $0.60 out; claude-haiku $1.00 in / $5.00 out.
- Ground truth defined in `src/tasks.ts`.

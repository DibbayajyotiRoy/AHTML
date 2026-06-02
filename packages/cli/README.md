# @ahtmljs/cli

The AHTML auditor. Walks the AHTML discovery chain on a live site and reports what's well-formed, what's missing, and what AI clients can already consume.

## Quickstart

```bash
npx @ahtmljs/cli doctor https://shop.example.com
```

No install. No config. Exit code `0` if every required check passes, `1` if anything fails.

## Sample output

```
AHTML doctor — https://shop.example.com
---
PASS  .well-known/ahtml.json
    site=https://shop.example.com
PASS  /ahtml validate()
    page_type=product_list, entities=24, actions=3
PASS  /ahtml entities
    24 entities
WARN  /ahtml lint()
    1 warning(s); first: [missing-ttl] Snapshot has no ttl
    hint: Add .ttl(seconds) when building the snapshot.
PASS  /ahtml/mcp.json
    3 tool(s)
PASS  /ahtml/openapi.json
    OpenAPI 3.1.0
PASS  /llms.txt
    412 bytes
---
6 PASS, 1 WARN, 0 FAIL
```

## What it checks

1. **`/.well-known/ahtml.json`** — must exist, must parse as JSON, must declare `ahtml: "0.1"` with `site` and `endpoints`.
2. **`/ahtml`** — must fetch successfully, must pass `validate()` from `@ahtmljs/schema`, must carry at least one entity.
3. **`lint(snapshot)`** — surfaces quality gaps (missing ttl, products without prices, oversized content, etc.). Warnings, not failures.
4. **`/ahtml/mcp.json`** — must exist when the manifest advertises it; must have `schema_version`, `server`, `tools`.
5. **`/ahtml/openapi.json`** — must exist when advertised; must declare `openapi: "3.1.0"`.
6. **`/llms.txt`** — recommended; warns when missing or when the first non-blank line isn't a Markdown heading.

Required checks (`well-known`, `/ahtml`, `validate`) gate the exit code. Optional checks (`mcp`, `openapi`, `llms.txt`) downgrade to warnings.

## Subcommands

```bash
ahtml doctor <url>     # full discovery-chain audit
ahtml validate <url>   # fast: just validate the snapshot at <url>/ahtml
ahtml --help
ahtml --version
```

## Programmatic API

The auditor is also importable as a library — the CLI is a thin renderer on top of it:

```ts
import { doctor } from '@ahtmljs/cli/dist/doctor.js';

const report = await doctor('https://shop.example.com');
if (report.totals.fail > 0) process.exit(1);
```

## Design notes

- Zero runtime dependencies outside `@ahtmljs/schema` and `@ahtmljs/agent`.
- ANSI colors are inline; `NO_COLOR` and non-TTY stdout suppress them automatically.
- Edge-runtime safe — no `node:*` imports in the audit hot path.

## License

MIT — Dibbayajyoti Roy

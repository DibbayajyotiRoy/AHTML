# Contributing

Thanks for your interest in AHTML.

## Three rules

1. **Schema changes go through PRs against [`SPEC.md`](SPEC.md) and [`packages/schema/src/schema.json`](packages/schema/src/schema.json)**, with a 4-week stability window between proposal and release.
2. **The TypeScript prototype is the reference implementation** until Phase 1 (Rust) ships. Breaking the TS implementation breaks everyone.
3. **No new dependencies in `@ahtml/schema` without discussion.** It is intentionally zero-dependency at runtime.

## Setting up locally

```bash
git clone https://github.com/ahtml/ahtml
cd ahtml
npm install
npm run build --workspaces --if-present   # builds dist/ for schema + next + agent
cd examples/benchmark && npm run start    # verify your install
```

## Typecheck

```bash
cd packages/schema && npx tsc --noEmit -p tsconfig.json
cd packages/next   && npx tsc --noEmit -p tsconfig.json
cd packages/agent  && npx tsc --noEmit -p tsconfig.json
cd examples/landing   && npx tsc --noEmit -p tsconfig.json
cd examples/benchmark && npx tsc --noEmit -p tsconfig.json
```

All five must pass before merging.

## Schema change process

1. Open a discussion at GitHub Discussions describing the proposed change.
2. Wait for one of the schema stewards (currently the project lead) to ack the proposal.
3. Submit a PR with:
   - Updated `SPEC.md` section
   - Updated `packages/schema/src/schema.json`
   - Updated `packages/schema/src/types.ts` (TS shapes)
   - Updated `packages/schema/src/validate.ts` (runtime validator)
   - Updated `packages/schema/src/format-compact.ts` and `format-json.ts` if the change is wire-visible
   - At least one round-trip test (compact ↔ JSON ↔ canonical bytes)
   - Updated [`CHANGELOG.md`](CHANGELOG.md) entry
4. PR is left open for 4 weeks while implementations stabilize.
5. Merge.

## Code style

- TypeScript with `strict: true` and `noUncheckedIndexedAccess: true`.
- `exactOptionalPropertyTypes: false` (relaxed; causes friction without proportional benefit).
- No comments that restate the code. Comments document *why*, not *what*.
- No backward-compat shims for unreleased code.
- No emoji in source unless explicitly requested.

## What we'd like help with

| Track | Examples |
|---|---|
| Phase 0 polish | More extractors (Microdata, RDFa, page-metadata) |
| Framework plugins | `@ahtml/vite`, `@ahtml/sveltekit`, `@ahtml/astro`, `@ahtml/nuxt`, `@ahtml/remix` |
| Benchmark expansion | Adapters for WebShop / Mind2Web / WebArena |
| Phase 1 Rust core | Start with the `format-compact` parser in chumsky |
| Phase 2 language | Tree-sitter grammar for `.ahtml` |
| Real-world adopters | Open a discussion. We'll help you wire it up. |

## Things we will not accept (without discussion first)

- Browser-only changes that break Node compatibility
- Rebrands of MCP / OpenAPI / JSON-LD vocabulary (these are downstream emits; their contracts are theirs)
- A new entity primitive (the six are intentionally small)
- A new dependency in `@ahtml/schema`
- A new build tool

## Releasing

```bash
# Bump package versions
npm version <major|minor|patch> --workspaces
git tag v0.1.x
git push --tags

# Publish (project maintainer only)
npm publish --workspaces --access public
```

## Code of conduct

Be kind. Disagree on the technical merits. We do not have a separate
Code of Conduct file; the maintainers will use judgment.

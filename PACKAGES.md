# AHTML Packages — Endpoints, Descriptions, STAR

Five npm packages under the `@ahtmljs` scope. Repo: [DibbayajyotiRoy/AHTML](https://github.com/DibbayajyotiRoy/AHTML).

---

## API endpoints

### Latest published version (npm registry)

The npm registry exposes `dist-tags.latest` plus the full `time` map for every package. URL-encode the `/` in the scoped name as `%2f`.

```bash
# One package — just the latest version string
curl -s "https://registry.npmjs.org/@ahtmljs%2fschema/latest"    | jq -r '.version'
curl -s "https://registry.npmjs.org/@ahtmljs%2fnext/latest"      | jq -r '.version'
curl -s "https://registry.npmjs.org/@ahtmljs%2fagent/latest"     | jq -r '.version'
curl -s "https://registry.npmjs.org/@ahtmljs%2fvite/latest"      | jq -r '.version'
curl -s "https://registry.npmjs.org/@ahtmljs%2flangchain/latest" | jq -r '.version'

# All five at once, with publish timestamp
for p in schema next agent vite langchain; do
  v=$(curl -s "https://registry.npmjs.org/@ahtmljs%2f$p/latest" | jq -r '.version')
  t=$(curl -s "https://registry.npmjs.org/@ahtmljs%2f$p"        | jq -r ".time[\"$v\"]")
  printf "%-10s %-8s %s\n" "$p" "$v" "$t"
done
```

### Download counts (npm download-counts API)

The npm download API caps historical range at ~18 months — there is no true "all-time" endpoint. Use `last-year` as the closest approximation, or a manual date range for finer control.

```bash
# Point query — single number for a fixed window
curl -s "https://api.npmjs.org/downloads/point/last-day/@ahtmljs/schema"   | jq
curl -s "https://api.npmjs.org/downloads/point/last-week/@ahtmljs/schema"  | jq
curl -s "https://api.npmjs.org/downloads/point/last-month/@ahtmljs/schema" | jq
curl -s "https://api.npmjs.org/downloads/point/last-year/@ahtmljs/schema"  | jq

# Day-by-day breakdown (max 18 months back)
curl -s "https://api.npmjs.org/downloads/range/2024-11-14:2026-05-14/@ahtmljs/schema" | jq

# Combined dashboard for all five
for p in schema next agent vite langchain; do
  d=$(curl -s "https://api.npmjs.org/downloads/point/last-year/@ahtmljs/$p" | jq '.downloads')
  printf "%-10s %s downloads (last 12 mo)\n" "$p" "$d"
done
```

### GitHub release tags (per-repo, not per-package)

The repo tags every release as a single `vX.Y.Z` covering all five packages simultaneously. Use the GitHub Releases API.

```bash
# Latest release on the repo
curl -s "https://api.github.com/repos/DibbayajyotiRoy/AHTML/releases/latest" \
  | jq '{tag: .tag_name, published: .published_at, url: .html_url}'

# All releases (paginated)
curl -s "https://api.github.com/repos/DibbayajyotiRoy/AHTML/releases" \
  | jq '.[] | {tag: .tag_name, published: .published_at}'

# Just the tag list (lighter, no release-notes payload)
curl -s "https://api.github.com/repos/DibbayajyotiRoy/AHTML/tags" \
  | jq '.[].name'
```

---

## Packages — 5 lines each

### `@ahtmljs/schema`
1. The canonical semantic snapshot schema for AHTML.
2. Defines TypeScript types, a JSON Schema file, a validator, and a builder.
3. Ships two serializers — lossless JSON and a token-optimal compact text form.
4. Adds the `Document.chunks` primitive so RAG pipelines get deterministic IDs and byte ranges out of the box.
5. Every other `@ahtmljs/*` package depends on it — this is the contract layer.

### `@ahtmljs/next`
1. The Next.js plugin for AHTML.
2. Mounts one route handler that emits MCP, OpenAPI, JSON-LD, `llms.txt`, and the AHTML snapshot.
3. Built-in extractors discover routes from the App Router or Pages Router automatically.
4. Zero migration — bolts onto an existing Next.js app without touching pages or data layers.
5. Peer-deps on Next 14+; the snapshot is reachable at `/.well-known/ahtml.json`.

### `@ahtmljs/agent`
1. The client SDK an AI agent uses to consume any AHTML-emitting site.
2. Fetches snapshots, caches them by ETag, and dispatches structured actions.
3. Supports dry-run so safety gates fire *before* a destructive action ever hits the wire.
4. Optional tokenizer adapters (OpenAI `o200k_base`, Anthropic) report exact prompt cost.
5. Hardened with hostile-agent regression tests covering policy bypass, lying confirmations, and bearer-token tricks.

### `@ahtmljs/vite`
1. The Vite plugin for AHTML.
2. Mounts the same route handler as `@ahtmljs/next`, but as Vite middleware.
3. Works with SvelteKit, SolidStart, Astro, and vanilla Vite — anything on the Vite dev/build pipeline.
4. Output is byte-identical to the Next.js plugin, so cross-framework parity is real, not aspirational.
5. Peer-deps on Vite 5+; one line in `vite.config.ts` enables every well-known endpoint.

### `@ahtmljs/langchain`
1. A LangChain.js document loader for AHTML.
2. Fetches any AHTML-emitting site and returns it as a `Document[]` ready for vector stores.
3. Splits content at `Document.chunks` boundaries when present — no re-chunking needed downstream.
4. Preserves citation anchors, byte ranges, and source URLs in per-chunk metadata for accurate attribution.
5. Peer-deps on `@langchain/core` 0.3+; URL → embeddings in three lines.

---

## STAR breakdown

### `@ahtmljs/schema`
- **Situation:** Every agent visiting a site re-parses verbose HTML, with no shared semantic contract for what a "document" is, what its actions are, or where to cite from.
- **Task:** Design a single canonical schema that is strict enough for machines, cheap enough for LLM context windows, and rich enough to support RAG ingestion natively.
- **Action:** Built TypeScript types, a JSON Schema, a validator, and dual serializers (lossless JSON + a token-optimal compact text format). Added the `Document.chunks` primitive with deterministic content-addressed IDs, byte ranges, and a prev/next linked-list invariant.
- **Result:** 63 passing tests covering validation, round-trip, ETag determinism, diff/apply, and property fuzzing (100–500 random inputs per property). Published as `@ahtmljs/schema@0.2.0` to npm with provenance attestation.

### `@ahtmljs/next`
- **Situation:** Next.js apps already render content — but to be useful to agents, they have to ship five separate things (MCP, OpenAPI, JSON-LD, `llms.txt`, agent snapshot), each maintained by hand.
- **Task:** Collapse all five into a single zero-migration plugin that bolts onto any existing Next.js app.
- **Action:** Built a route handler that introspects the Next.js router and emits all five formats from one extractor pipeline; mounted it at `/.well-known/ahtml.json` plus dedicated sub-routes per format.
- **Result:** 38 passing tests; one import + one route enables full agent compatibility on Next 14+. Published as `@ahtmljs/next@0.2.0`.

### `@ahtmljs/agent`
- **Situation:** Agents calling websites are unpredictable — they hallucinate URLs, ignore confirmation prompts, and silently rack up tokens.
- **Task:** Provide a typed client that fetches snapshots cheaply, gates destructive actions, and reports cost in real-tokenizer numbers.
- **Action:** Built `AHTMLClient` with ETag caching, structured action dispatch, dry-run gating, and optional tokenizer adapters for tiktoken `o200k_base` (OpenAI) and Anthropic's tokenizer. Hardened with hostile-agent regression tests.
- **Result:** 28 passing tests, including hostile-agent regressions that verify dry-run mode *never* calls `execute_url` even under adversarial overrides. Published as `@ahtmljs/agent@0.2.0`.

### `@ahtmljs/vite`
- **Situation:** Half the modern web isn't on Next.js — SvelteKit, SolidStart, Astro, and vanilla Vite had no agent-transport story.
- **Task:** Mirror the Next.js plugin as a Vite plugin so every Vite-based framework can opt in with one config line.
- **Action:** Implemented the same handler as Vite middleware (`configureServer` hook); reused `@ahtmljs/schema` end-to-end so output is byte-identical to the Next.js plugin.
- **Result:** 9 passing tests; `@ahtmljs/vite@0.2.0` shipped as the first cross-framework parity release — same snapshot bytes from any toolchain.

### `@ahtmljs/langchain`
- **Situation:** RAG pipelines burn weeks on HTML scraping, chunking, and citation plumbing — most of which the LLM then discards or hallucinates around.
- **Task:** Turn any AHTML-emitting site into LangChain `Document[]` in one call, with chunks pre-computed deterministically and citations preserved.
- **Action:** Built `AHTMLLoader` against the LangChain.js loader contract; split `Document.chunks` into per-chunk records preserving anchors, byte ranges, and source metadata.
- **Result:** 5 passing tests including chunk-boundary fidelity and metadata propagation; consumers go from URL → embeddings in three lines. Published as `@ahtmljs/langchain@0.2.0`.

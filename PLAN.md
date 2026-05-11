# AHTML — Bulletproof Build Plan v1

*Last updated: 2026-05-12*

---

## TL;DR

**AHTML is the contract layer of the agent web.** One source file emits:

```
   .ahtml file
        │
        ├──▶ HTML                       (humans, browsers)
        ├──▶ AHTML snapshot (compact)   (agents, token-optimal)
        ├──▶ AHTML snapshot (JSON)      (programmatic agents, signing)
        ├──▶ MCP tools manifest         (Claude / ChatGPT / Cursor / Gemini)
        ├──▶ OpenAPI 3.1                (REST clients, codegen)
        ├──▶ JSON-LD                    (Google AI Overviews, Perplexity)
        ├──▶ llms.txt                   (Cursor / Continue / Cline)
        └──▶ /.well-known/ahtml.json    (discovery)
```

**Two stacks.** TypeScript for framework plugins that live in npm-land forever
(Next, Vite, SvelteKit, Astro, Nuxt, Remix). Rust for the compiler core
(parser, validator, serializer, LSP, signer) — exposed back to JS via
napi-rs and to browsers via wasm-bindgen.

**Three phases.** Phase 0 — TypeScript prototype, validates the wedge.
Phase 1 — Rust core, replaces the hot path. Phase 2 — real `.ahtml`
language with LSP, syntax highlighting, and editor support.

**The pitch:** Write your page once. It emits every agent-web protocol.
No new server. No migration. 100× fewer tokens. MCP for free.

---

## 1. The 2026 market we're entering

Synthesized from current ecosystem state (May 2026).

### 1.1 MCP is the protocol

- **10,000+** active public MCP servers
- **78%** of enterprise AI teams have ≥1 MCP-backed agent in production
- **92%** of new agent frameworks ship MCP support by default
- Adopted by ChatGPT, Cursor, Gemini, Microsoft Copilot, VS Code, Claude
- Donated by Anthropic to the **Agentic AI Foundation (Linux Foundation)** in December 2025
- **97M+** monthly SDK downloads (Python + TypeScript combined)
- Anthropic recently shipped Tool Search + Programmatic Tool Calling for thousand-tool deployments

**Implication for AHTML:** Be MCP-native. We already emit MCP from any
snapshot. Differentiator vs. "just build an MCP server": your *website*
becomes the server. One source — both protocols. Plus the snapshot
itself carries semantic data that MCP tool definitions don't.

### 1.2 llms.txt is the discovery convention

- Proposed by Jeremy Howard / Answer.AI, September 2024
- **~10%** adoption across websites in 2026
- Adopters include Anthropic, Stripe, Cursor, Cloudflare, Vercel, Mintlify, Supabase, LangGraph
- IDE agents (Cursor, Continue, Cline) **do** use it
- OpenAI, Google, Anthropic crawlers **do not** request it in meaningful volume
- 300K-domain study showed **no measurable impact** on AI citation frequency

**Implication for AHTML:** llms.txt is a useful gateway with adoption
inertia. We do NOT compete with it. We auto-emit it as a compatibility
shim alongside our own `/.well-known/ahtml.json`, so adopters get both.
Long-term, agents that want richer semantics graduate to AHTML; llms.txt
remains the lightweight tier.

### 1.3 JSON-LD / schema.org is the structured-data baseline

- Dominant for AI search optimization (ChatGPT, Perplexity, Google AI Overviews)
- Schema-marked content has **2.5×** higher chance of appearing in AI answers
- Describes **what** something is — does NOT describe what you can **do** with it
- Has no notion of actions, cost, reversibility, freshness, auth, policy, or signing

**Implication for AHTML:** schema.org is our Level-0 free lunch — any
site already shipping JSON-LD gets a Level-0 AHTML snapshot via our
extractor with zero developer work. Our differentiator is the *action +
policy + freshness + provenance* tail that schema.org explicitly punted
on.

### 1.4 Adjacent active projects

| Project | What it is | AHTML's relation |
|---|---|---|
| **NLWeb** (Microsoft-involved) | MCP-based natural language interface to websites | Consumes AHTML; AHTML is the schema under it |
| **Cloudflare Agent Readiness** | Score for how agent-ready a site is | AHTML adoption raises the score |
| **OpenAI Apps SDK / Connectors** | MCP-style integration surface | Consumes AHTML's MCP emission |
| **Google Vertex Agent Builder** | MCP support added Q1 2026 | Consumes AHTML's MCP emission |
| **Cookie-Script's ai.txt** | Purpose-based scraping control file | Sister convention; we link to it from policy |

**Implication:** The category is real and players are moving. We are
not inventing a market — we are claiming the contract layer underneath
several existing consumer surfaces.

### 1.5 Rust JS-tooling has fully won

- **Rolldown** 1.0 RC (January 2026); **Vite 8** ships with Rolldown replacing both Rollup *and* esbuild
- **Oxc** is the fastest JS/TS parser written in Rust — 3× faster than SWC on parsing
- **Biome** is 25× faster than Prettier/ESLint
- **SWC** is the default in Next.js, Parcel, Deno
- **napi-rs** is the standard bridge for Rust→Node addons with prebuilt binaries
- **Oxlint** delivers 30–100× faster CI pipelines than ESLint

**Implication for AHTML:** Going with anything other than Rust for the
compiler core is fighting community consensus. Use **Rust + napi-rs +
wasm-bindgen** for the core; ship npm packages as the user-facing
artifact. Use **tower-lsp** for the language server. **TypeScript or
JavaScript** is the wrong answer for the parser/validator/LSP. **C or
C++** are the wrong answer because the JS-adjacent niche has converged
on Rust and Rust tooling (napi-rs in particular) is now mature enough
to make C/C++ a step backwards. **Go** is fine (esbuild proves it) but
loses to Rust on WASM output quality and Node binding ergonomics.
**Zig** is pre-1.0; too risky for a 5-year project.

---

## 2. Positioning — what AHTML is and is not

### What AHTML IS

A **single source** that compiles down to every existing agent-web
protocol. The user writes one document. AHTML emits HTML, semantic
snapshot, MCP, OpenAPI, JSON-LD, llms.txt, and a discovery manifest.

A **typed contract** that describes not only what data is on a page,
but what an agent is allowed to do, what it costs, how reversible it
is, and what side effects firing the action will have.

A **server-side opt-in lane.** Sites that want agent traffic adopt it.
Sites that don't want agent traffic continue to ship plain HTML behind
their CAPTCHAs — AHTML does not bypass anything.

### What AHTML is NOT

- **Not a replacement for HTML.** HTML is what browsers consume forever.
  AHTML compiles *to* HTML, plus extra outputs for agents.
- **Not a competitor to MCP, llms.txt, JSON-LD, or OpenAPI.** AHTML is
  upstream of all of them.
- **Not a way to defeat anti-bot defenses.** Sites that don't install
  the plugin emit no AHTML; their CAPTCHA wall stands.
- **Not a new browser language.** Browsers don't need to learn anything.
- **Not a new runtime, package manager, or build tool.** We host inside
  Vite, Next, etc.

### Positioning matrix

| Existing thing | What it does | AHTML's role |
|---|---|---|
| **MCP** | Tool-call protocol for AI agents | Snapshots emit MCP manifests |
| **llms.txt** | Markdown discovery file at site root | Auto-emit as compatibility shim |
| **JSON-LD / schema.org** | Structured data in `<script>` tags | Ingest as free Level-0 source |
| **OpenAPI** | REST API contract | Emit from snapshot action endpoints |
| **NLWeb** | Natural-language UI over MCP | Consumes our MCP emission |
| **Cloudflare Agent Readiness** | Agent-readiness score | Our adoption → high score |
| **DIDs / JWS** | Identity & signing | Carry signed AHTML snapshots |
| **GraphQL Federation** | Federated typed APIs | Not in scope; we're page-oriented |
| **Hydra / JSON:API** | Hypermedia conventions | Borrow pagination / relation patterns |

**Single-line marketing pitch:**

> *AHTML is the HTML of the agent web. Write once. Emit MCP, OpenAPI, JSON-LD, llms.txt, and a 100×-cheaper semantic snapshot — all from the same source.*

---

## 3. Architecture

```
                                ┌───────────────────────────────────┐
                                │   .ahtml source files (Phase 2)   │
                                └────────────────┬──────────────────┘
                                                 │
   Frameworks (TS plugins)              ┌────────▼─────────┐                  Agents
   ────────────────────────             │  ahtmlc (Rust)   │                  ──────
   @ahtml/next      ─┐                  │                  │           ┌──── Claude
   @ahtml/vite       │  build-time      │   parse          │           │
   @ahtml/sveltekit  ├────────────────▶ │   typecheck      │ ──────────┼──── ChatGPT
   @ahtml/astro      │  inputs          │   diff           │   outputs │
   @ahtml/nuxt       │                  │   sign           │           ├──── Cursor
   @ahtml/remix     ─┘                  │   serialize      │           │
                                        └─────────┬────────┘           └──── Custom
   Extractor inputs                               │
   ────────────────                               │
   data-ahtml-* attrs                             │
   schema.org JSON-LD                             │
   OpenGraph meta                                 ▼
   Route metadata                  ┌──────────────────────────────┐
                                   │  Outputs (per route)         │
                                   │                              │
                                   │   /                          │  ← HTML, unchanged
                                   │   /ahtml/<path>              │  ← compact text (default)
                                   │   /ahtml/<path>?fmt=json     │  ← canonical JSON
                                   │   /ahtml/<path>?since=<etag> │  ← diff
                                   │   /.well-known/ahtml.json    │  ← manifest
                                   │   /ahtml/mcp.json            │  ← MCP tools
                                   │   /ahtml/openapi.json        │  ← OpenAPI 3.1
                                   │   /llms.txt                  │  ← compatibility shim
                                   └──────────────────────────────┘
```

**Layered structure:**

| Layer | Stack | Distribution | Status |
|---|---|---|---|
| Schema & types | Rust core + TS facade | npm + crates.io | TS done; Rust pending |
| Parser / validator | Rust (chumsky + jsonschema-rs) | crates.io + napi + WASM | Pending |
| Serializer (JSON / compact / MsgPack / CBOR) | Rust (serde) | crates.io + napi + WASM | TS done; Rust pending |
| Diff engine | Rust | crates.io + napi + WASM | TS done; Rust pending |
| Signer / verifier | Rust (ed25519-dalek, josekit) | crates.io + napi | Pending |
| `ahtmlc` CLI binary | Rust (clap) | GitHub Releases + brew + cargo-binstall | Pending |
| `ahtml-lsp` language server | Rust (tower-lsp) | bundled w/ CLI | Pending |
| Tree-sitter grammar | JS (grammar.js) | npm + tree-sitter registry | Pending |
| VS Code extension | TS | Marketplace | Pending |
| Next.js plugin | TS | npm | **DONE** |
| Vite plugin | TS | npm | Pending |
| SvelteKit / Astro / Nuxt / Remix plugins | TS | npm | Pending |
| Agent SDK (Node + browser) | TS (calls WASM core) | npm | TS prototype pending |
| Agent SDK (Python) | Python (PyO3 bindings to Rust) | PyPI | Pending |
| Agent SDK (Rust / Go) | Rust / Go | crates.io / go module | Pending |

---

## 4. Tech selections (with rationale and prior art we steal from)

### 4.1 Compiler core language: **Rust**

**Rationale:** Niche consensus. The JS-adjacent tooling ecosystem has
converged here — SWC, OXC, Biome, Turbopack, Rolldown, Lightning CSS
all use Rust + napi-rs. Building in C/C++/Zig/Go means fighting
gravity, with no upside.

**Specific crates:**

| Need | Crate | Why |
|---|---|---|
| Lexer | **logos** | Macro-based, fast, used by `taplo`, `jaq` |
| Parser | **chumsky 0.10+** | Modern combinator with great error messages, recoverable parsing; alternative: hand-written recursive descent (TS/Roslyn style) for absolute control |
| Diagnostics | **miette** | Beautiful CLI errors; pairs with chumsky's recovery |
| JSON Schema | **jsonschema-rs** | Fastest JSON Schema validator in any language |
| Serialization | **serde + serde_json + rmp-serde + ciborium** | Industry standard for JSON / MessagePack / CBOR |
| LSP | **tower-lsp 0.20+** | Used by rust-analyzer, taplo, gleam-lsp; async-first |
| HTML parsing (extractors) | **html5ever / scraper** | Servo's parser; mature |
| Node binding | **napi-rs 2.x** | Prebuilt platform binaries; used by SWC, Rolldown, Oxc |
| WASM binding | **wasm-bindgen + wasm-pack** | Standard since 2020 |
| Async runtime | **tokio** | Standard; only needed for LSP & sign-service |
| Signing (ed25519) | **ed25519-dalek 2.x** | Standard |
| JWS / JWT | **josekit** | Cleaner API than `jsonwebtoken` |
| DID resolution | **didkit-rs** or hand-rolled `did:web` HTTP fetch | did:web requires no infra — just a `.well-known/did.json` |
| Snapshot testing | **insta** | The standard for compiler output tests |
| CLI | **clap 4.x** + **anstyle** | Standard |
| Parallelism | **rayon** | Per-file work splits naturally |
| Tree-sitter highlighting | **tree-sitter** CLI + hand-written `grammar.js` | Required for VS Code / Neovim / Helix / Zed / GitHub syntax |

### 4.2 Language design references

**To learn from / borrow patterns:**

- **TypeScript** — gradual adoption model, compile-to-target, npm distribution
- **CUE** (Google) — typed config language with constraint composition
- **Pkl** (Apple) — typed configuration with strong tooling
- **GraphQL SDL** — schema-as-code, codegen as the value prop
- **TOML** — what config files actually want to look like
- **Dhall** — typed config (instructive; too academic to copy directly)
- **AT Protocol Lexicon** (Bluesky) — record-oriented schemas with DID-based identity
- **OpenAPI 3.1** — REST contract format; what we emit to
- **AsyncAPI** — event/stream contracts; v0.2 target
- **JSON:API** — pagination / relationships conventions
- **Hydra** — hypermedia REST vocabulary

**To explicitly NOT copy:**

- RDF / OWL — full ontologies failed for a reason. We are not the Semantic Web 2.0.
- XSLT — declarative transforms are great in theory; nobody writes them.
- BPMN — workflow modeling that became enterprise-bait.

### 4.3 Distribution

- **crates.io** — Rust libs (`ahtml-core`, `ahtml-parser`, `ahtml-lsp`, `ahtml-signer`)
- **npm** — TS packages (`@ahtml/schema`, `@ahtml/next`, `@ahtml/vite`, etc.)
- **PyPI** — Python bindings (`ahtml`) via PyO3
- **GitHub Releases** — `ahtmlc` binary for each platform
- **Homebrew tap** — `brew install ahtml/ahtml/ahtmlc`
- **cargo-binstall** — `cargo binstall ahtmlc`
- **Bun & Deno** — first-class support (both vendor SWC/Rolldown patterns)
- **VS Code Marketplace** — `ahtml.ahtml` extension
- **Open VSX** — for VSCodium / Cursor

### 4.4 Hosting / infrastructure

- Spec site & docs: **Vercel** (or Cloudflare Pages) — static, free tier
- Schema registry: `schemas.ahtml.dev` — static + cached
- Snapshot CDN (future Phase 3 SaaS): **Cloudflare Workers** — KV edge cache
- Sign-service (future Phase 3 SaaS): **Cloudflare Workers** + **Turso** (libSQL) for key rotation
- Identity (DIDs): `did:web` — zero infra, just signed JSON at well-known URL

---

## 5. Phase plan

### Phase 0 — TypeScript prototype  (Weeks 1–12)

**Goal:** Lock the schema. Prove the 100× token reduction. Get to first
real-world adopter.

**Stack:** TypeScript only. Lives in `packages/*` as npm workspaces.

**Already shipped:**
- ✅ `@ahtml/schema` — types, validator, JSON + compact text formatters, diff, snapshot builder, JSON Schema spec
- ✅ `@ahtml/next` — handler, extractors (schema.org, OpenGraph, data-attrs), well-known manifest, MCP emitter, OpenAPI emitter, ETag + If-None-Match conditional GET, diff-since endpoint, content negotiation, rate-limit policy enforcement

**Remaining for Phase 0:**

| # | Task | Effort |
|---|---|---|
| P0.1 | `@ahtml/agent` SDK — fetch + cache + If-None-Match + dry-run executor + token counter | 2d |
| P0.2 | Demo Next.js store — products, listing, detail, purchase action; wired with AHTML end-to-end | 2d |
| P0.3 | Benchmark harness — synthesize HTML vs AHTML for matched content, measure tokens via `tiktoken` (gpt-tokenizer for Node) | 1d |
| P0.4 | llms.txt compatibility shim — auto-emit from registered routes | 0.5d |
| P0.5 | `@ahtml/vite` plugin — same shape as `@ahtml/next` but generic | 1.5d |
| P0.6 | README.md + SPEC.md + LANGUAGE.md (.ahtml syntax sketch) | 1d |
| P0.7 | Landing page (marketing) — pitch + benchmark number + try-it-live | 1d |
| P0.8 | Public v0.1 release — npm publish, GitHub repo, Show HN | 0.5d |
| P0.9 | First-3-adopters outreach — Shopify devs, indie SaaS, docs sites | 2d |

**Validation gate before moving to Phase 1:**

- [ ] Benchmark shows ≥50× token reduction on 3 distinct site types (e-commerce, blog, dashboard)
- [ ] ≥1 external developer has installed `@ahtml/next` and shipped a snapshot endpoint
- [ ] Snapshot schema has not had a breaking change for 4 consecutive weeks
- [ ] We have written ≥10 example snapshots by hand and the format still feels right

If any of these fail → iterate on schema, do not start Phase 1.

### Phase 1 — Rust core  (Months 4–9)

**Goal:** Make AHTML processing fast enough to embed in any toolchain.

**Stack:** Rust core; TS facade keeps the same public API.

| # | Task | Effort |
|---|---|---|
| P1.1 | `ahtml-core` crate — types, validator | 1w |
| P1.2 | `ahtml-format` crate — JSON, compact, MessagePack, CBOR serializers | 1w |
| P1.3 | `ahtml-parser` crate — compact text parser (chumsky), JSON parser | 2w |
| P1.4 | `ahtml-diff` crate — structural diff + apply | 1w |
| P1.5 | `ahtml-signer` crate — ed25519 + JWS + `did:web` verifier | 2w |
| P1.6 | `napi-rs` bindings — drop-in replacement for `@ahtml/schema` internals | 1w |
| P1.7 | `wasm-bindgen` bindings — `@ahtml/schema-wasm` for browser agents | 1w |
| P1.8 | `ahtmlc validate / format / diff / serve` CLI commands | 1w |
| P1.9 | Property-based tests (proptest) — round-trip JSON ↔ compact | 1w |
| P1.10 | Benchmark suite — parse/serialize 10K snapshots, compare to TS baseline | 0.5w |

**Exit criteria:**

- [ ] All TS internals replaced with napi-rs bindings; same npm API
- [ ] WASM build runs in browser agent SDK
- [ ] Parser is ≥10× faster than the TS prototype
- [ ] Signed snapshots verify via `did:web` round-trip
- [ ] CI matrix: Linux x64/arm64, macOS x64/arm64, Windows x64

### Phase 2 — The `.ahtml` language  (Months 6–12, overlaps Phase 1)

**Goal:** Real `.ahtml` files with editor support.

| # | Task | Effort |
|---|---|---|
| P2.1 | Syntax exploration — pick one of: JSX-shaped, Pkl-shaped, TOML-shaped, brand-new | 2w |
| P2.2 | Spec v0.1 for `.ahtml` language (LANGUAGE.md formalized) | 2w |
| P2.3 | `ahtmlc compile` — `.ahtml` → HTML + snapshot + MCP + OpenAPI | 4w |
| P2.4 | Tree-sitter grammar (`tree-sitter-ahtml`) | 1w |
| P2.5 | `ahtml-lsp` server — diagnostics, completion, hover, goto-def | 3w |
| P2.6 | VS Code extension — syntax + LSP client + preview pane | 1w |
| P2.7 | Neovim / Helix / Zed integrations (tree-sitter is enough for these) | 0.5w |
| P2.8 | `@ahtml/next-language`, `@ahtml/vite-language` — pick up `.ahtml` files alongside `.tsx` | 2w |

**Exit criteria:**

- [ ] A developer can write `.ahtml` files in VS Code with syntax + autocomplete + errors
- [ ] `ahtmlc compile site.ahtml` emits HTML + snapshot.json + mcp.json + openapi.json
- [ ] Next.js demo store rewritten using `.ahtml` files, all four outputs validated

### Phase 3 — Ecosystem & SaaS  (Months 10–18)

| Track | What |
|---|---|
| Component compilers | `.ahtml` → React / Solid / Svelte / Vue components |
| Provenance | DID-based signing CLI; verification UI |
| Streaming | NDJSON snapshots over chunked transfer; SSE diff subscriptions |
| Hosted SaaS | Snapshot CDN with edge cache + analytics + agent-readiness scoring |
| Conformance test suite | Public test vectors so other implementations can claim AHTML compliance |
| Standards path | Submit AHTML to Agentic AI Foundation (Linux Foundation) once we have ≥3 implementations and ≥50 deployments |

---

## 6. Prior art — what to steal from, in detail

### Things we directly emit to / interoperate with

| Project | Owner | What we take | What we ignore |
|---|---|---|---|
| MCP | Linux Foundation (was Anthropic) | Tool definition format; annotation patterns; the entire success of the protocol | The transport (HTTP/SSE/stdio) — we are a *manifest* not a *server* |
| OpenAPI 3.1 | OpenAPI Initiative | Path + operation + schema model | Vendor extensions, callbacks |
| JSON-LD / schema.org | W3C | Vocabulary names (Product, Article, Person) | RDF triples, contexts, framing |
| llms.txt | Jeremy Howard | Discovery convention; markdown root file | The unstructured-markdown body — we ship structured |
| AsyncAPI | AsyncAPI Initiative | Event channel / message model | v0.2 target only |
| AT Protocol Lexicon | Bluesky | Record schemas + DIDs + lexicon JSON | NSID format; we use shorter IDs |
| Hydra | W3C draft | Pagination + relationships | The full hypermedia ontology |
| JSON:API | jsonapi.org | Cursor pagination, includes | Membership tests, sparse fieldsets |

### Things we copy patterns from (not protocols)

| Project | Lesson |
|---|---|
| TypeScript | Gradient adoption; compile to existing target; npm distribution |
| Tailwind | Plugin into every framework; never replace the host |
| Prisma | Schema file + codegen as the developer surface |
| Rolldown / Oxc / Biome | Rust + napi-rs + npm packages, prebuilt platform binaries |
| tower-lsp | Async LSP server architecture |
| `cargo` | Single binary that does init / build / test / publish |
| GitHub Actions | YAML schema-driven UX (people will tolerate YAML if it's well-typed) |
| `gh` CLI | Beautiful CLI ergonomics + login flow |

### Things we explicitly avoid

| Pattern | Why |
|---|---|
| RDF triples / OWL ontologies | Semantic Web 1.0 died from over-modeling |
| XSLT-style declarative transforms | Nobody writes them |
| Microformats / Microdata in HTML attributes as the *primary* format | Did not reach adoption critical mass |
| Browser-native parsing (asking Chromium to ship `<ahtml>` element) | Will not happen in our lifetime |
| Building our own JS runtime | We are not Bun |
| Building our own bundler | We host inside Vite/Next |
| Building our own router | We use the host framework's |
| Building yet-another-MCP server framework | Already 10K+ servers — be a *manifest emitter* instead |

---

## 7. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| MCP evolves in incompatible way (e.g. requires SSE transport) | Med | High | Track MCP spec releases; pin to specific MCP version; emit multiple MCP versions if needed |
| llms.txt becomes an enforced standard with breaking new format | Low | Low | We only emit llms.txt as a shim; cheap to update |
| schema.org adds Action+Cost vocabulary (we lose differentiator) | Low | Med | Even then, we still emit MCP + OpenAPI + JSON-LD in one shot |
| Browser vendors propose competing native standard | Very Low | High | Browser standards take 8+ years; we have first-mover speed |
| Anthropic / OpenAI / Google ship a competing first-party standard | Med | High | Be the *open* one. Donate to Linux Foundation once mature |
| Snapshot schema gets locked in v0.1 with mistakes we can't break | Med | Med | Reserve `meta`, `_ahtml_ext`, `policy.extensions` fields; semver discipline; conformance suite |
| Phase 0 TS prototype has hidden architectural flaws → Rust port reveals them | Med | Med | Validation gate before Phase 1; ≥10 hand-written snapshots before locking schema |
| Phase 1 Rust port takes longer than estimated | High | Low | TS prototype continues to work; no user impact while Rust is in progress |
| Adoption stalls at <10 sites | Med | Med | Outreach to specific verticals: Shopify themes, Vercel template gallery, Docusaurus, Nextra |
| Agents in 2026 are too unreliable to act on AHTML's action contracts → product looks premature | Med | Med | First-year focus on the *read* path (snapshots, MCP emission). Action execution is opt-in. |
| Security: malicious sites serve fake AHTML to mislead agents | High | Med | Signing path in v0.2; agents should treat unsigned snapshots as untrusted |
| Sites adopt AHTML for SEO/AIO benefit then never maintain freshness | High | Low | `ttl` + `freshness` are mandatory; expired snapshots get a clear "stale" annotation in our consumer SDK |

---

## 8. Scope discipline — what we are NOT building

| Not building | Why |
|---|---|
| A web browser | Out of scope; orthogonal |
| A new HTML parser | Use `html5ever` (Rust) / `parse5` (JS) |
| A bundler | We host in Vite / Next |
| A package manager | npm exists |
| A test runner | Use the host framework's |
| A schema language from scratch | JSON Schema is good enough |
| An MCP server framework | Be a manifest emitter, not a server |
| Authentication infrastructure | OAuth2 / OIDC exist; we just declare requirements |
| A payments / commerce platform | We declare cost; we do not charge |
| An AI agent | We are infrastructure for agents, not an agent |
| A scraping product | We are the opt-in opposite |
| Documentation hosting | Vercel / Cloudflare Pages exist |
| A CDN | Cloudflare exists; future Phase 3 only if needed |
| Backwards compatibility with XML / microformats / RDFa | Modern only |

---

## 9. Open questions to resolve before Phase 1

| Q | Notes |
|---|---|
| Q1: Do we add an `action.preview` action category for dry-run? Or is it an HTTP verb (`OPTIONS`)? | Lean: add `preview_url` field, keep `OPTIONS` clean |
| Q2: Snapshot IDs — should they be globally unique (DID-based) or page-local? | Lean: page-local strings, optional DID promotion in v0.2 |
| Q3: Inline vs reference for repeated entities (e.g. brand on 1000 products) | Lean: allow `{ "$ref": "#/entities/brand:apple" }` in v0.1 already |
| Q4: Do we ship `.ahtml` syntax in v0.1, or only the snapshot format? | Lean: snapshot format only in v0.1; `.ahtml` syntax in v0.2 |
| Q5: Compact text — line-wrapped or strict line-per-field? | Lean: strict line-per-field for parser simplicity |
| Q6: MCP version pinning — track latest, or pin to a specific snapshot? | Lean: pin to MCP 2026-XX; bump in minor versions |
| Q7: Signing in v0.1 — reserve field only, or ship a working implementation? | Lean: reserve field, ship verifier in v0.2 |
| Q8: Multi-tenant: can one server emit AHTML for many domains? | Lean: yes — `policy.contact` is per-snapshot, not per-server |
| Q9: i18n — translation variants of the same snapshot. Per-locale URL or query param? | Lean: per-locale URL (`/ahtml/en/...`, `/ahtml/zh/...`) |
| Q10: Embedding AHTML inside HTML for transitional adoption — `<script type="application/ahtml+json">`? | Lean: yes; also useful for SSR caches |

---

## 10. Marketing positioning

### Three-line landing-page hero

> **Your website already has a brain.**
> **AHTML lets agents read it.**
> 100× fewer tokens. Zero migration. MCP + OpenAPI + JSON-LD for free.

### Top-of-funnel one-liner

> *AHTML — the HTML of the agent web.*

### The 30-second pitch

We're at the start of the agent web. Your customer's next visit might be
Claude. Your competitor's next sale might be a ChatGPT plugin. Today,
those agents read your site by scraping HTML — burning tokens, missing
context, and guessing at what's safe to do.

AHTML is the contract layer underneath all of it. Drop a plugin into
your Next.js or Vite app. Your site now exposes a typed semantic
snapshot at `/ahtml/<path>` — 100× fewer tokens than HTML — plus an
auto-generated MCP manifest, an OpenAPI spec, and a llms.txt shim.

No migration. Your existing pages keep rendering. Your existing
backend keeps running. Agents that ask for AHTML get clean structured
data with typed actions, costs, reversibility, and policy. Agents that
don't ask for it see the same HTML they always have.

One source. Every agent-web protocol downstream.

### Five marketing assets to commission

1. **Benchmark bar chart** — "287 KB HTML → 1.8 KB AHTML" (the killer headline)
2. **Architecture poster** — one diagram showing the source-of-truth fan-out
3. **5-min YouTube** — `npx create-ahtml-app` to working snapshot endpoint
4. **Twitter/X thread** — "we scraped Shopify with HTML vs AHTML — here's the receipts"
5. **Show HN post** — title: "Show HN: AHTML — the HTML of the agent web (100× fewer tokens, MCP for free)"

### Channels

- **Vercel template gallery** — easiest distribution; need 1 great template
- **Next.js community Discord** — `@ahtml/next` is the foothold
- **Cursor / Continue / Cline Discords** — they consume llms.txt today, will graduate to AHTML
- **MCP server registry** — list AHTML as a "server source pattern"
- **Hacker News** — single Show HN; do it after benchmark + 3 adopters
- **r/LocalLLaMA, r/AI_Agents** — agent-builder communities
- **DevTo / dev.to** — long-form technical posts on the spec
- **Conference talks** — JSConf, JSNation, Rust Conf (talk: "I wrote a language in Rust, and an LSP, and it shipped on npm")

---

## 11. Immediate next steps (this week)

1. Get this PLAN.md reviewed by the user; lock the strategic direction
2. Finish Phase 0 deliverables P0.1–P0.4 (agent SDK + demo + benchmark + llms.txt shim) — ~5 days
3. Write SPEC.md (formal spec for the snapshot format) and LANGUAGE.md (syntax sketch for Phase 2)
4. Run the benchmark; get the headline number
5. Stand up `ahtml.dev` as a static landing page with the benchmark + npm install command
6. Decide on the Phase 1 start date and budget (full-time vs side-project)

---

## Appendix A — Why not C, C++, Zig, Go?

| Lang | Verdict | Why |
|---|---|---|
| **Rust** | ✅ Selected | Niche consensus (SWC, OXC, Biome, Rolldown); mature napi-rs; mature WASM; memory-safe; great LSP story (tower-lsp); great error UX (miette) |
| **C** | ❌ | No memory safety; no async LSP story; no first-class WASM/napi tooling |
| **C++** | ❌ | Same as C, plus build-system pain; v8-style binding ABI complexity |
| **Zig** | ❌ (this round) | Pre-1.0; ABI not stable; Bun proved it works but the bet is too tight on Zig surviving the next decade |
| **Go** | ❌ (this round) | esbuild proves Go works for JS tooling, but Go loses to Rust on: WASM output size + speed, Node N-API bindings, error-message ergonomics. If we were starting in 2020 it would be a fight; in 2026 the JS-tooling community has voted with their feet |
| **TypeScript** | ✅ for framework plugins, ❌ for compiler core | Right for the bits that live in npm; wrong for the parser/validator/LSP where perf and single-binary distribution matter |
| **OCaml** | ❌ | Great for compilers (Flow, ReScript). But: small hiring pool; no JS-adjacent community gravity in 2026 |
| **Haskell** | ❌ | Same; plus build/deployment friction |
| **D / Nim** | ❌ | No critical mass |

The key insight: the community that we need to reach (web framework
authors, npm package consumers, agent builders) has *already* picked
its compiler stack. We meet them where they are.

---

## Appendix B — Glossary

- **Snapshot:** the agent-facing representation of a page. JSON or compact text.
- **Entity:** a typed thing on a page (Product, Document, Task, Profile, Dataset, Conversation).
- **Action:** a typed operation on a page (purchase, search, send, etc.).
- **Policy:** site-level rules for agents (welcome / rate limit / license / contact).
- **Provenance:** signature + issuer DID for trustable snapshots.
- **`.well-known/ahtml.json`:** site-wide manifest for agents.
- **Compact text format:** token-optimal serialization of a snapshot. The default.
- **Canonical JSON:** strict, deterministic snapshot serialization. The signed form.
- **AHTML extractor:** a function that turns existing HTML / metadata into an AHTML snapshot.
- **DID:** Decentralized Identifier (W3C); we use `did:web` exclusively.

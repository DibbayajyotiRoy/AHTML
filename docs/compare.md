# AHTML vs everything

Exhaustive comparison against every adjacent standard. AHTML is **upstream
of** or **complementary to** every entry here — not a competitor.

## At a glance

| | What it describes | Status (May 2026) | AHTML's relation |
|---|---|---|---|
| **MCP** | Tool-calling protocol for AI agents | 10K+ servers, Linux Foundation | Emit |
| **llms.txt** | Markdown sitemap for AI ingestion | ~10% website adoption | Emit (compatibility shim) |
| **schema.org / JSON-LD** | Structured-data vocabulary | Dominant, 2.5× AI-citation boost | Ingest + Emit |
| **OpenAPI 3.1** | REST API contract | Industry standard | Emit |
| **AsyncAPI 3.x** | Event-driven API contract | Growing | Emit (Phase 2) |
| **NLWeb** | Natural-language UI over MCP | Microsoft-involved, emerging | Consumes our MCP |
| **ai.txt** | Purpose-based scraping control | Niche | Sister convention |
| **robots.txt** | Crawler allow/deny | Universal | Sister convention |
| **Microdata / RDFa** | In-HTML structured-data attributes | Stagnant | We avoid this path |
| **Hydra** | Hypermedia REST vocabulary | W3C draft, niche | Borrow pagination ideas |
| **JSON:API** | REST conventions | Mature | Borrow pagination + relationships |
| **GraphQL SDL** | Schema-as-code | Mature | Inspiration |
| **AT Protocol Lexicon** | Bluesky record schemas | Niche but interesting | Inspiration for record + DID model |
| **OData** | REST query protocol | Enterprise | Out of scope |

## vs MCP

**Model Context Protocol** is the tool-calling protocol AI agents use to
talk to external systems. Anthropic launched it November 2024; donated to
Linux Foundation December 2025; 10,000+ public servers, 78% enterprise
adoption, 92% of new agent frameworks ship with MCP support by default.

### Comparison

| | MCP | AHTML |
|---|---|---|
| Scope | Tool-calling protocol | Per-page semantic contract that *emits* MCP |
| Deployment | Separate MCP server process | Your existing website *is* the MCP server |
| Data access | Parallel to your app | Same routes, same database |
| Auth | Parallel to your app | Your existing OAuth2 / OIDC |
| What you write | Tool definitions + handlers | Snapshot builders against your existing data |
| What it describes | Tools (actions only) | Entities + Actions + Policy + Provenance |
| Pagination | Tool-specific | First-class `links.next.cursor` |
| Freshness / TTL | ❌ | First-class |
| Cryptographic provenance | ❌ | v0.2 |
| Discovery | MCP registry | `/.well-known/ahtml.json` + MCP manifest |

### When to use which

- **Use MCP directly** when you're building a *purpose-built tool surface* for agents (e.g. a Slack-like API for an AI desk).
- **Use AHTML** when you already have a *website* and want it to be agent-readable AND agent-actable without writing a parallel server.

### How AHTML maps to MCP

```
AHTML snapshot                                MCP tool
─────────────                                 ──────────
action.id                              →      tool.name
action.label                           →      tool.description
action.input                           →      tool.inputSchema
action.auth                            →      tool.annotations.auth
action.cost                            →      tool.annotations.cost
action.reversible                      →      tool.annotations.reversible
action.side_effects                    →      tool.annotations.side_effects
action.confirmation                    →      tool.annotations.confirmation
action.execute_url + action.method     →      tool transport endpoint
```

The AHTML route handler **automatically emits** `/ahtml/mcp.json` from your
declared actions. You write actions once.

### Verdict

**Use both.** Install `@ahtmljs/next` so your website emits MCP from
existing routes. MCP becomes a downstream output, not a parallel project.

---

## vs llms.txt

Jeremy Howard / Answer.AI proposed **llms.txt** in September 2024 — a
Markdown file at the root of your domain (e.g. `https://example.com/llms.txt`)
with a one-paragraph description and a curated list of links with
one-line descriptions.

### Adoption status (May 2026)

- ~10% of websites overall (low/mid/high traffic similar: 8–10%)
- Adopters include Anthropic, Stripe, Cursor, Cloudflare, Vercel, Mintlify, Supabase
- IDE agents (Cursor, Continue, Cline) **do** use it
- OpenAI / Google / Anthropic crawlers **do not** request it in meaningful volume
- A 300K-domain study showed **no measurable impact** on AI citation frequency

### Comparison

| | llms.txt | AHTML |
|---|---|---|
| Format | Markdown (unstructured) | Compact text or canonical JSON (structured) |
| Granularity | One file per domain | One snapshot per route |
| Entity types | ❌ (free text) | 6 primitives with typed fields |
| Action contracts | ❌ | `cost`, `reversible`, `side_effects`, `confirmation`, `auth` |
| Pagination | ❌ | `links.next.cursor` |
| Conditional fetch (ETag) | ❌ | `If-None-Match` + `?since=<etag>` |
| Cryptographic provenance | ❌ | v0.2 |
| MCP-emittable | ❌ | ✅ |
| OpenAPI-emittable | ❌ | ✅ |
| Discoverability | At `/llms.txt` | At `/.well-known/ahtml.json` + auto-emitted `/llms.txt` |
| Migration cost | Half a day | Half a day per route, with extractors that do Level-0 for free |

### When to use which

- **Use llms.txt alone** when you have a docs site and want IDE agents (Cursor, Continue) to discover it. It's cheap and adoption inertia exists.
- **Use AHTML** when you need structured entities and typed actions — and **AHTML auto-emits llms.txt for free**, so you don't have to choose.

### Verdict

**AHTML strictly subsumes llms.txt.** Install AHTML and you get llms.txt at
`/llms.txt` plus the structured semantic snapshot.

---

## vs schema.org / JSON-LD

**schema.org** is a structured-data vocabulary jointly developed by Google,
Microsoft, Yahoo, and Yandex. Encoded inline as JSON-LD blocks in HTML
`<script>` tags. Dominant for AI search optimization: pages with proper
schema markup have **2.5× higher chance** of appearing in AI-generated
answers (ChatGPT, Perplexity, Google AI Overviews).

### Comparison

| | schema.org / JSON-LD | AHTML |
|---|---|---|
| Describes | **What** something is | **What you can do** with it |
| Vocabulary | Vast (1000+ types) | Focused (6 primitives) |
| Action semantics | `Action` type exists but largely unused; no `cost` or `reversible` | First-class typed action contracts |
| Cost / reversibility / side-effects | ❌ | ✅ |
| Policy block | ❌ | ✅ |
| Freshness metadata | ❌ | ✅ |
| Conditional fetch | ❌ | ✅ |
| MCP-emittable | ❌ | ✅ |
| Pagination | partial (`itemListElement`) | ✅ |
| Where it lives | Inline in HTML | Separate endpoint at `/ahtml/<route>` |
| Cryptographic provenance | ❌ | v0.2 |

### When to use which

- **Use JSON-LD alone** when your goal is **pure SEO / AI search citation**. Google AI Overviews and Perplexity rely on it heavily.
- **Use AHTML** when you need *actions* and *cost/reversibility/side-effects* — schema.org explicitly punted on these and probably will never have them.

### How they interact

AHTML **ingests** schema.org JSON-LD as a Level-0 source:

```ts
import { extractFromSchemaOrg } from '@ahtmljs/next/extractors';
const extraction = extractFromSchemaOrg(htmlString);
// → { source: 'schema-org', entities: [...], actions: [] }
```

And AHTML can **emit** JSON-LD from snapshots (Phase 0.2 — straightforward).

### Verdict

**AHTML is a strict superset.** Keep your JSON-LD for SEO; add AHTML for
agent actions.

---

## vs OpenAPI 3.1

**OpenAPI** is the standard for describing REST APIs. v3.1 aligns with
JSON Schema 2020-12.

### Comparison

| | OpenAPI 3.1 | AHTML |
|---|---|---|
| Describes | An API surface | A web page + its actions |
| Audience | REST clients, codegen, partners | AI agents + the above |
| Cost / reversibility / side-effects | ❌ (no first-class fields) | ✅ |
| Confirmation requirements | ❌ | ✅ |
| Entity content | Schemas for request/response bodies | Snapshot entities with real data |
| Discovery | Per-API document | `/.well-known/ahtml.json` |
| Multi-tenant page-level | ❌ | ✅ |

### When to use which

- **Use OpenAPI alone** when you have a pure REST API with no UI.
- **Use AHTML + OpenAPI** when you have a website with actions. AHTML emits an OpenAPI 3.1 document at `/ahtml/openapi.json` with `x-ahtml-cost` / `reversible` / `side-effects` extensions, so you also get standard REST tooling for free.

### Verdict

**AHTML emits OpenAPI.** Use both. AHTML adds page-level semantics that
OpenAPI doesn't aim to describe.

---

## vs NLWeb

**NLWeb** is an emerging effort (Microsoft-involved) to add a
natural-language interface to websites, built on MCP.

### Comparison

NLWeb is **higher in the stack** than AHTML. NLWeb is the user-facing
natural-language interface; AHTML is the typed contract underneath that
the NLWeb implementation consumes.

### Verdict

**Complementary.** AHTML feeds NLWeb (via MCP emission). If NLWeb gains
traction, AHTML adopters benefit automatically.

---

## vs ai.txt

**ai.txt** is a sister convention to robots.txt for purpose-based scraping
control. Lets sites declare what AI training, AI search, etc. is allowed.

### Comparison

ai.txt is a **policy file**. AHTML's `policy` block expresses similar
intent **plus** machine-readable terms (`license`, `republish`,
`rate_limit`, `actions_require`, `caching.ttl`, `attribution_required`).

### Verdict

**Sister conventions.** Both have a place. AHTML's policy is richer; ai.txt
is simpler. Many sites will ship both.

---

## vs robots.txt

**robots.txt** is the de-facto crawler allow/deny standard since 1994.

### Comparison

robots.txt is **binary** (allow/deny per path + crawler). AHTML's policy
is **structured** (rate limits, auth schemes, license, contact, terms,
republish rules, attribution).

### Verdict

**Sister conventions.** AHTML respects robots.txt; AHTML adds the
machine-readable terms a crawler that *is* welcome needs to behave
correctly.

---

## vs Microdata / RDFa

**Microdata** and **RDFa** are W3C standards for embedding structured data
as HTML attributes (`itemtype`, `itemprop`, `property`, `typeof`, etc.).

### Adoption status

Stagnant. JSON-LD won — and was officially preferred by Google in 2015.
Microdata and RDFa adoption hasn't grown in years.

### Why AHTML doesn't follow this path

In-HTML attribute markup tightly couples the rendering layer and the
semantic layer. It is hard to evolve, hard to audit, and bleeds into the
DOM the agent has to parse anyway. AHTML's **separate snapshot endpoint**
is the architectural correction. Our **Level 1 `data-ahtml-*` attributes**
exist for *quick onboarding*, not as the primary mode.

### Verdict

**Skip Microdata / RDFa.** Use AHTML.

---

## vs Hydra

**Hydra** is a W3C draft for hypermedia REST APIs — links describe what
operations are available on a resource.

### Comparison

Hydra's intent matches AHTML's: typed operations on resources. But Hydra
is **API-oriented** (server returns just JSON; clients are dumb) while
AHTML is **page-oriented** (one snapshot per HTML route, alongside the
HTML). Hydra also never reached critical adoption.

### Verdict

**Hydra is the most-aligned prior art.** AHTML borrows the pagination and
relationship vocabulary; the rest is fresh.

---

## vs JSON:API

**JSON:API** is a strict set of conventions for REST APIs (resource
identity, relationships, includes, pagination).

### Comparison

AHTML borrows JSON:API's **cursor pagination** and **relationship**
conventions. Our `links.next.cursor` / `entity.id` model follows their
patterns.

### Verdict

**Borrow from. Don't replace.** Use JSON:API if you're building a JSON
API server; AHTML if you have a website.

---

## vs custom scraping

Many products solve "agent reads my website" by spinning up a custom
Playwright/Puppeteer scraper.

### Comparison

| | Custom scraping | AHTML |
|---|---|---|
| Token cost per page | ~10,000+ | ~500–1,500 |
| Reliability | Breaks on every DOM change | Stable (you publish the contract) |
| Action execution | Brittle DOM clicks | Typed contract calls |
| Cost / reversibility metadata | None | Explicit |
| Auth | Cookie stealing / CAPTCHA bypass | Your existing OAuth2 |
| Legality | Often gray | Explicit `license` + `republish` policy |
| Site owner alignment | Adversarial | Aligned |

### Verdict

**Scraping is the worst-case fallback.** AHTML exists so it doesn't have
to be the default.

---

## Decision tree

```
Do you need agents to READ your site?
│
├─ No → Don't install AHTML. Your CAPTCHA stays. Done.
│
└─ Yes → Do you need agents to ACT on your site?
   │
   ├─ Just SEO / AI search citation → schema.org JSON-LD alone is enough
   │
   └─ Yes — actions matter
      │
      ├─ Brand-new project, no UI → MCP alone. Build it as a tool surface.
      │
      └─ Existing website, want it agent-readable + actable → AHTML
         │
         ├─ Next.js / Vite / SvelteKit → @ahtmljs/next
         ├─ Express / Bun / Deno → @ahtmljs/schema + your own routes
         └─ Non-Node framework → wait for Phase 1 Rust core
            (in the meantime: hand-roll snapshot endpoints using SPEC.md)
```

---

## Citations

- [Model Context Protocol](https://modelcontextprotocol.io)
- [llms.txt convention](https://llmstxt.org)
- [schema.org](https://schema.org)
- [OpenAPI 3.1 spec](https://spec.openapis.org/oas/v3.1.0)
- [JSON-LD 1.1](https://www.w3.org/TR/json-ld11/)
- [Hydra Core Vocabulary](https://www.hydra-cg.com/spec/latest/core/)
- [JSON:API](https://jsonapi.org/)
- [AT Protocol Lexicon](https://atproto.com/specs/lexicon)
- [AsyncAPI](https://www.asyncapi.com/)
- [Microdata (W3C)](https://www.w3.org/TR/microdata/) — stagnant
- [RDFa Primer](https://www.w3.org/TR/rdfa-primer/) — stagnant

# AHTML vs everything

Exhaustive comparison against every adjacent standard. AHTML is **upstream
of** or **complementary to** every entry here — not a competitor. The short
version: AHTML cuts agent context cost 80–95%, turns any webpage into typed,
tool-ready objects (`page.products`, `page.actions`), and emits every
agent-readable format — MCP, WebMCP, OpenAPI, JSON-LD, llms.txt, Markdown,
RSL, Content Signals — from one config.

## At a glance

| | What it describes | Status (July 2026) | AHTML's relation |
|---|---|---|---|
| **MCP** | Tool-calling protocol for AI agents | Linux Foundation (Agentic AI Foundation), 97M monthly SDK downloads | Emit + proxy (`ahtml mcp <url>`) |
| **WebMCP** | Pages register JS functions as browser agent tools | Google+Microsoft, W3C WebML CG; Edge native, Chrome 149 origin trial | Emit (`@ahtmljs/webmcp`) |
| **Cloudflare markdown** | `Accept: text/markdown` auto-conversion at the CDN | Rolling out across Cloudflare's network | Same negotiation, hand-authored contract |
| **Firecrawl / Jina Reader** | Scrape someone else's HTML into markdown | Popular agent-pipeline SaaS | `ahtml extract`/`analyze` + typed universal client |
| **llms.txt** | Markdown sitemap for AI ingestion | ~10% adoption; stalling as a consumption signal | Emit (compatibility shim) |
| **schema.org / JSON-LD** | Structured-data vocabulary | Dominant, 2.3× AI Overviews likelihood | Ingest + Emit |
| **RSL 1.0** | Content licensing, RSS-style | Shipped, 50+ publisher partners | Emit (`/rsl.txt`) |
| **Content Signals** | Crawl-purpose signals in robots.txt | 3.8M domains | Emit (robots.txt + llms.txt lines) |
| **OpenAPI 3.1** | REST API contract | Industry standard | Emit |
| **AsyncAPI 3.x** | Event-driven API contract | Growing | Emit (Phase 2) |
| **NLWeb** | Natural-language UI over MCP | Microsoft-involved, emerging | Consumes our MCP |
| **ai.txt** | Purpose-based scraping control | Niche | Sister convention |
| **robots.txt** | Crawler allow/deny | Universal | Sister convention |
| **Microdata / RDFa** | In-HTML structured-data attributes | Stagnant | Ingest (microdata extractor); avoid as authoring path |
| **Hydra** | Hypermedia REST vocabulary | W3C draft, niche | Borrow pagination ideas |
| **JSON:API** | REST conventions | Mature | Borrow pagination + relationships |
| **GraphQL SDL** | Schema-as-code | Mature | Inspiration |
| **AT Protocol Lexicon** | Bluesky record schemas | Niche but interesting | Inspiration for record + DID model |
| **OData** | REST query protocol | Enterprise | Out of scope |

## vs MCP

**Model Context Protocol** is the tool-calling protocol AI agents use to
talk to external systems. Anthropic launched it November 2024; it now lives
under the Linux Foundation's **Agentic AI Foundation**, with 97M monthly SDK
downloads and MCP support the default in effectively every new agent
framework. The 2026 spec roadmap adds `.well-known` server metadata
(spec RC 2026-07-28) — a discovery mechanism AHTML has shipped since v0.4.

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
| Cryptographic provenance | ❌ | ✅ (detached JWS + did:web) |
| Discovery | MCP registry + `.well-known` metadata (RC 2026-07-28) | `/.well-known/ahtml.json` + MCP manifest |

### When to use which

- **Use MCP directly** when you're building a *purpose-built tool surface* for agents (e.g. a Slack-like API for an AI desk).
- **Use AHTML** when you already have a *website* and want it to be agent-readable AND agent-actable without writing a parallel server.
- **Use `ahtml mcp <url>`** when the site isn't yours at all: the CLI runs a local stdio MCP proxy for **any URL** — adopters get their real manifest and real actions proxied; everyone else gets `fetch_page` / `list_pages` / `search` over extracted typed snapshots. `claude mcp add`-compatible.

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
declared actions, and `/.well-known/ahtml.json` maps directly onto MCP's
`.well-known` server metadata. You write actions once.

### Verdict

**Use both.** Install `@ahtmljs/next` so your website emits MCP from
existing routes; use `ahtml mcp <url>` to bring any *other* site into your
agent loop today. MCP is a downstream output, not a parallel project.

---

## vs WebMCP

**WebMCP** lets a web page register JavaScript functions as tools that
browser-embedded agents can call. Backed by Google and Microsoft in the
W3C WebML Community Group; Edge ships it natively, and Chrome 149 has been
running an origin trial since 2026-05-19.

### Comparison

| | WebMCP | AHTML |
|---|---|---|
| Where tools live | In the browser tab (JS registrations) | In the page contract; compiled to WebMCP via `@ahtmljs/webmcp` |
| Tool metadata | Name, description, input schema | Plus `cost`, `reversible`, `side_effects`, `confirmation`, `auth` — surfaced as `x-ahtml-*` annotations |
| Server-side agents | ❌ (browser-only) | Same actions also emitted as MCP + OpenAPI |
| Availability | Chrome 149 OT / Edge native | Stable `window.__AHTML_TOOLS__` fallback works in any browser; bookmarklet inspector, no origin trial required |
| What you write | Per-page JS tool registrations | Your existing AHTML actions — `registerAhtmlTools(snapshot)` does the rest |

### Verdict

**AHTML compiles to WebMCP.** Declare actions once; `@ahtmljs/webmcp`
(< 6 kB) registers them as browser tools with richer safety metadata than
the WebMCP baseline. When the origin trial graduates, adopters are already
there — with the same contract serving server MCP and browser WebMCP.

---

## vs Cloudflare markdown conversion

Cloudflare is normalizing `Accept: text/markdown` content negotiation:
their network auto-converts HTML responses to markdown for AI clients.

### Comparison

| | Cloudflare auto-conversion | AHTML |
|---|---|---|
| Source of truth | Rendered HTML, converted after the fact | The hand-authored typed contract |
| Fidelity | Lossy — nav, chrome, and ambiguity survive conversion | Structured sections for Products, Documents, Tasks, Profiles, Actions, Policy |
| Actions | ❌ (markdown is read-only) | Action contracts preserved |
| Token accounting | ❌ | `X-AHTML-Tokens` response header on every snapshot |
| Where it works | Cloudflare-fronted sites | All three adapters (Next.js, Vite, Hono) speak the same negotiation |

### Verdict

**Same convention, better payload.** AHTML supports the exact
`Accept: text/markdown` negotiation Cloudflare is normalizing — but serves
the contract you authored, with a token count in the headers, instead of a
lossy auto-conversion of your HTML. "Why not just let the CDN convert?" is
answered in tokens: see the public benchmark.

---

## vs Firecrawl / Jina Reader

**Firecrawl**, **Jina Reader**, and similar services solve "somebody else's
HTML": fetch a URL, strip the chrome, return markdown for an LLM.

### Comparison

| | Firecrawl / Jina | AHTML (`extract` / `analyze` / universal client) |
|---|---|---|
| Output | Markdown blob | **Typed objects**: `page.products`, `page.documents`, `page.faqs`, `page.actions` |
| Downstream parsing | Your LLM re-parses prose | Typed accessors; validated snapshots |
| Sources used | Readability-style heuristics | schema.org + OpenGraph + microdata + data-attrs, merged |
| Actions | ❌ | Extracted snapshots never fabricate actions; adopter snapshots carry real ones |
| Provenance | ❌ | `provenance: 'extracted' \| 'authoritative'` tag; signatures on adopter content |
| Adoption gradient | Terminal — scraping is the end state | Extraction degrades gracefully into the authoritative contract when the site adopts |
| Cost | Hosted SaaS, per-request pricing | `npx @ahtmljs/cli extract <url>` — local, MIT |

### Verdict

**Typed output is the axis.** If your agent pipeline consumes markdown and
re-parses it with a model, you're paying twice. `ahtml extract` /
`ahtml analyze` and `new AHTMLClient({ htmlFallback: true })` return typed,
validated objects from any URL today — and the same client transparently
upgrades to the authoritative signed snapshot when a site adopts.

---

## vs llms.txt

Jeremy Howard / Answer.AI proposed **llms.txt** in September 2024 — a
Markdown file at the root of your domain (e.g. `https://example.com/llms.txt`)
with a one-paragraph description and a curated list of links with
one-line descriptions.

### Adoption status (July 2026)

- ~10% of websites overall — flat, and **stalling as a consumption signal**
- No major provider (OpenAI, Google, Anthropic) consumes it in ranking;
  crawler request volume remains near zero
- Still alive as a **dev-docs convention**: IDE agents (Cursor, Continue,
  Cline) do use it, and docs-heavy adopters (Stripe, Vercel, Mintlify,
  Supabase) keep shipping it
- The 300K-domain study showing **no measurable impact** on AI citation
  frequency still stands

### Comparison

| | llms.txt | AHTML |
|---|---|---|
| Format | Markdown (unstructured) | Compact text or canonical JSON (structured) |
| Granularity | One file per domain | One snapshot per route |
| Entity types | ❌ (free text) | 6 primitives with typed fields |
| Action contracts | ❌ | `cost`, `reversible`, `side_effects`, `confirmation`, `auth` |
| Pagination | ❌ | `links.next.cursor` |
| Conditional fetch (ETag) | ❌ | `If-None-Match` + `?since=<etag>` |
| Cryptographic provenance | ❌ | ✅ (detached JWS + did:web) |
| MCP-emittable | ❌ | ✅ |
| OpenAPI-emittable | ❌ | ✅ |
| Discoverability | At `/llms.txt` | At `/.well-known/ahtml.json` + auto-emitted `/llms.txt` |
| Migration cost | Half a day | Half a day per route, with extractors that do Level-0 for free |

### When to use which

- **Use llms.txt alone** when you have a docs site and want IDE agents (Cursor, Continue) to discover it. It's cheap — just don't expect it to move AI citations.
- **Use AHTML** when you need structured entities and typed actions — and **AHTML auto-emits llms.txt for free** (with Content Signals front-matter), so you don't have to choose. `ahtml llms <url>` even generates one for any site by polite crawl.

### Verdict

**AHTML strictly subsumes llms.txt.** Keep the emitter; don't lead with it.

---

## vs schema.org / JSON-LD

**schema.org** is a structured-data vocabulary jointly developed by Google,
Microsoft, Yahoo, and Yandex. Encoded inline as JSON-LD blocks in HTML
`<script>` tags. Dominant for AI search optimization: pages with valid
structured data are **2.3× more likely** to appear in AI Overviews — the
most provable near-term ROI of any emitted format.

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
| Cryptographic provenance | ❌ | ✅ (detached JWS + did:web) |

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

And AHTML **emits** JSON-LD from snapshots — inline in your HTML, from the
same source as everything else.

### Verdict

**AHTML is a strict superset.** Keep your JSON-LD for SEO; add AHTML for
agent actions.

---

## vs RSL / Content Signals

**RSL 1.0** (Really Simple Licensing) is the RSS-style content-licensing
standard — shipped as an industry standard with 50+ publisher partners.
**Content Signals** (contentsignals.org, seeded by Cloudflare) adds
purpose-based crawl directives — `search`, `ai-input`, `ai-train` — to
robots.txt, live on 3.8M domains. Adjacent: Cloudflare's pay-per-crawl now
serves 1B+ HTTP 402s per day, and the **x402 Foundation** (Google, Visa,
AWS, Anthropic) standardizes machine micropayments.

### Comparison

RSL and Content Signals are **policy declarations**; AHTML's `policy` block
is the machine-readable superset (`license`, `republish`, `rate_limit`,
`actions_require`, `caching.ttl`, `attribution_required`,
`content_signals`, `verified_agents_only`, per-agent policy) — and AHTML
**emits both**: `toRsl()` produces a standards-compliant `/rsl.txt`, and
Content Signals lines land in the generated robots.txt and llms.txt.
Priced actions close the loop: actions declare
`cost: { amount, currency, rails: ['x402','acp'] }` and adapters answer
with standards-compliant 402 x402 responses.

### Verdict

**AHTML emits both.** One config produces discovery, capability,
provenance, licensing, and crawl signals together — no other tool covers
that intersection.

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

**NLWeb** is Microsoft's effort to add a natural-language interface to
websites, built on MCP. Still emerging; still Microsoft-driven; still
consumes MCP underneath.

### Comparison

NLWeb is **higher in the stack** than AHTML. NLWeb is the user-facing
natural-language interface; AHTML is the typed contract underneath that
the NLWeb implementation consumes — via the MCP manifest AHTML already
emits.

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
Note that Content Signals (above) is winning this niche — it lives in
robots.txt, where crawlers already look.

### Verdict

**Sister conventions.** Both have a place. AHTML's policy is richer; ai.txt
is simpler. Many sites will ship both — or skip ai.txt for Content Signals,
which AHTML emits.

---

## vs robots.txt

**robots.txt** is the de-facto crawler allow/deny standard since 1994.

### Comparison

robots.txt is **binary** (allow/deny per path + crawler). AHTML's policy
is **structured** (rate limits, auth schemes, license, contact, terms,
republish rules, attribution) — and AHTML writes Content Signals lines into
the generated robots.txt, so the binary file gains purpose-level nuance.

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
exist for *quick onboarding*, not as the primary mode. (AHTML does *ingest*
microdata: the extractor mines legacy markup on any URL.)

### Verdict

**Skip Microdata / RDFa** for authoring. Use AHTML.

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
| Auth | Cookie stealing / CAPTCHA bypass | Your existing OAuth2 + RFC 9421 signed requests |
| Legality | Often gray | Explicit `license` + `republish` policy, RSL, Content Signals |
| Site owner alignment | Adversarial | Aligned |

### Verdict

**Scraping is the worst-case fallback.** AHTML exists so it doesn't have
to be the default — and `ahtml extract` replaces the scraper you'd have
written anyway.

---

## Decision tree

```
Do you need agents to READ a site?
│
├─ Someone else's site → npx @ahtmljs/cli — no adoption needed
│  ├─ Typed objects from any URL → ahtml extract / AHTMLClient htmlFallback
│  ├─ Token savings + readiness report → ahtml analyze / score
│  └─ Inside Claude/Cursor → ahtml mcp <url> (stdio MCP proxy)
│
├─ Not at all → Don't install AHTML. Your CAPTCHA stays. Done.
│
└─ Your own site → Do you need agents to ACT on it?
   │
   ├─ Just SEO / AI search citation → schema.org JSON-LD alone is enough
   │  (AHTML emits it anyway)
   │
   └─ Yes — actions matter
      │
      ├─ Brand-new project, no UI → MCP alone. Build it as a tool surface.
      │
      └─ Existing website, want it agent-readable + actable → AHTML
         │
         ├─ Next.js → @ahtmljs/next
         ├─ Vite / SvelteKit / SolidStart / Astro → @ahtmljs/vite
         ├─ Hono / Bun / Deno / Cloudflare Workers / Lambda → @ahtmljs/hono
         ├─ Express / other Node → @ahtmljs/schema + your own routes
         └─ Browser-embedded agents too → add @ahtmljs/webmcp
```

---

## Citations

- [Model Context Protocol](https://modelcontextprotocol.io)
- [WebMCP (W3C WebML CG)](https://github.com/WICG/webmcp)
- [llms.txt convention](https://llmstxt.org)
- [schema.org](https://schema.org)
- [RSL 1.0](https://rslstandard.org)
- [Content Signals](https://contentsignals.org)
- [x402 Foundation](https://www.x402.org)
- [Cloudflare markdown for agents](https://developers.cloudflare.com/agents/markdown/)
- [Firecrawl](https://firecrawl.dev)
- [Jina Reader](https://jina.ai/reader)
- [OpenAPI 3.1 spec](https://spec.openapis.org/oas/v3.1.0)
- [JSON-LD 1.1](https://www.w3.org/TR/json-ld11/)
- [HTTP Message Signatures (RFC 9421)](https://www.rfc-editor.org/rfc/rfc9421)
- [Hydra Core Vocabulary](https://www.hydra-cg.com/spec/latest/core/)
- [JSON:API](https://jsonapi.org/)
- [AT Protocol Lexicon](https://atproto.com/specs/lexicon)
- [AsyncAPI](https://www.asyncapi.com/)
- [Microdata (W3C)](https://www.w3.org/TR/microdata/) — stagnant
- [RDFa Primer](https://www.w3.org/TR/rdfa-primer/) — stagnant

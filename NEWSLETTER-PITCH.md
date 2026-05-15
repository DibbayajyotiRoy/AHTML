# Newsletter outreach pack — AHTML

> Plug-and-play copy for pitching newsletter editors. Each section is
> standalone — pick the variant that matches the newsletter's beat, fill
> in `[BRACKETED]` bits, send. Personalize the first sentence in every
> email; do not blast the same body verbatim to 30 people.

**Maintainer:** Roy Mehta · rdibbayajyoti@gmail.com
**Repo:** https://github.com/DibbayajyotiRoy/AHTML
**Site:** https://ahtml.dev
**npm org:** https://www.npmjs.com/org/ahtmljs

---

## 1. Drop-in blurb (75 words) — editors can paste verbatim

> **AHTML — "RSS, but for AI agents."** A drop-in Next.js / Vite / SvelteKit plugin that makes your existing site speak MCP, OpenAPI, JSON-LD, and llms.txt from one source of truth. Real LLM benchmark on 20 fact-extraction questions: AHTML JSON hit **100% accuracy on 50% fewer tokens** than raw HTML; AHTML compact hit 95%. MIT, three-file install, zero migration. — `https://ahtml.dev`

## 2. Drop-in blurb (35 words) — for ultra-short slots

> **AHTML** — one plugin makes your Next.js / Vite / SvelteKit site speak MCP, OpenAPI, JSON-LD, and llms.txt. 100% LLM-question accuracy at half the tokens of raw HTML. MIT. `https://ahtml.dev`

## 3. One-liner (X / Twitter, tickers, "in brief")

> **AHTML** turns any Next.js / Vite / SvelteKit site into an MCP server with zero migration. 100% LLM-question accuracy, half the tokens. MIT.

---

## 4. Subject line options (A/B these)

1. `AHTML — RSS, but for AI agents (open source, MIT)`
2. `Open-source MCP server for Next.js — one plugin, zero migration`
3. `Benchmark: 100% LLM accuracy at half the HTML tokens`
4. `For your tools/launches section: a token-efficient HTML for agents`
5. `Story idea: the "RSS moment" for AI agents`

Lead with the angle the newsletter cares about. Avoid `[Submission]` /
`[For your newsletter]` — they get filtered.

---

## 5. Email — Generic launch pitch (90% of editors)

> **Subject:** AHTML — RSS, but for AI agents (open source, MIT)
>
> Hi [first name],
>
> Long-time reader of [newsletter name] — your write-up of [a specific recent issue / link] was the reason I pushed our v0.1 out the door.
>
> Short version: I shipped **AHTML** — an open-source npm plugin that makes any Next.js / Vite / SvelteKit site speak MCP, OpenAPI, JSON-LD, and llms.txt from one source of truth. Three files, three minutes, zero migration.
>
> The thing that might be newsletter-worthy: we ran a real LLM benchmark on 20 fact-extraction questions across 4 formats of the same page. Plain HTML scored 91% on 684 tokens. **AHTML JSON scored 100% on 365 tokens.** AHTML compact scored 95% on 338 tokens. Full table + source: `https://ahtml.dev/#benchmark` (anyone can reproduce in 60 seconds — `npm run benchmark`).
>
> If it's a fit for [newsletter name], I have a 75-word blurb you can paste verbatim, plus a 1672×941 architecture diagram, OG image, and a one-paragraph "why now" framing. Reply and I'll send whichever is useful — or skip if it's not the angle this issue.
>
> — Roy
> `https://ahtml.dev` · MIT · `npm i @ahtmljs/next`

---

## 6. Email — AI-engineering angle (Latent Space, AI Tidbits, Ben's Bites, Import AI)

> **Subject:** Open-source MCP server emitted from any Next.js app (with benchmark)
>
> Hi [first name],
>
> The MCP ecosystem has tons of standalone servers but very little for "I already have a Next.js app — how do I make it an MCP server without standing up a parallel process?"
>
> That's what **AHTML** does. One npm plugin, three route handlers, and your existing site is an MCP server, an OpenAPI 3.1 endpoint, a JSON-LD source, **and** an llms.txt index — all from the same source of truth. No separate process, no separate auth, no migration.
>
> Why I think it's worth a mention: it ships with a typed action contract (`cost`, `reversible`, `side_effects`, `confirmation`) that agents can honor before firing irreversible operations. That's the bit MCP alone doesn't specify, and it's where prompt-injection-driven agent disasters come from.
>
> Benchmark on 20 fact-extraction questions: **AHTML JSON 100% accuracy at 365 tokens** vs plain HTML at 91% / 684 tokens. Full reproducible source: `https://ahtml.dev/#benchmark`.
>
> Repo: `https://github.com/DibbayajyotiRoy/AHTML` · MIT · v0.1 just shipped.
>
> Happy to send a 75-word blurb if useful.
>
> — Roy

---

## 7. Email — Web-framework angle (JS Weekly, React Status, Bytes, Frontend Focus, Next.js Weekly)

> **Subject:** Make your Next.js / Vite / SvelteKit site readable to AI agents (one plugin)
>
> Hi [first name],
>
> Quick pitch for the [tools / launches / picks] section.
>
> **AHTML** is a brand-new MIT npm package: one plugin for Next.js, Vite, or SvelteKit that adds typed agent endpoints (`/ahtml`, `/ahtml/mcp.json`, `/ahtml/openapi.json`, `/llms.txt`, `/.well-known/ahtml.json`) to your existing app. The browser still sees the same HTML. Agents see typed entities, typed actions, and a snapshot that's **50–100× smaller** on production-bloated pages.
>
> Why it might fit your readers:
> - **Zero migration.** Three route handlers. The plugin auto-extracts from existing schema.org JSON-LD on most Shopify/WordPress sites.
> - **The landing page dogfoods itself** — `curl ahtml.dev/ahtml` is the actual live snapshot generated at request time.
> - **Real LLM benchmark with real tokenizers** (`gpt-tokenizer` + `@anthropic-ai/tokenizer`, not `text.length / 4`): AHTML JSON hits 100% answer accuracy on 50% fewer tokens than raw HTML.
>
> One-line install: `npm install @ahtmljs/next @ahtmljs/schema`
>
> Site: `https://ahtml.dev` · Repo: `https://github.com/DibbayajyotiRoy/AHTML`
>
> Happy to send a screenshot, OG image, or shorter blurb if you want them.
>
> — Roy

---

## 8. Email — "Story idea" angle (Pragmatic Engineer, The Information, Substack longform)

> **Subject:** Story idea — the "RSS moment" for AI agents (with measurements)
>
> Hi [first name],
>
> Not pitching a product placement — pitching a story I'd love to read.
>
> By 2026, a meaningful share of pageviews on commerce and docs sites come from agents (Claude browsing, ChatGPT search, Perplexity, internal RPA). They re-read HTML that was designed for humans, burning tokens to skim past nav, hydration scripts, and CSS-in-JS. There's no equivalent of RSS — the small, lossy, machine-first feed that made the blog web legible to a different reader.
>
> A few of us are trying to build that layer. I shipped **AHTML** (`https://ahtml.dev`) — one of several attempts; llmstxt.org and Firecrawl are adjacent shots at the same problem from different angles. The interesting story isn't any single tool: it's the unresolved tension between (a) emitting from inside the site vs scraping from outside, (b) read-only indexes vs typed action contracts, and (c) whose typing wins (MCP, OpenAPI, schema.org, or something new).
>
> We have **measured numbers** — same content, four serializations, real tokenizers, 20 LLM fact-extraction questions. The deltas are bigger than the discourse implies.
>
> If a 1500-word piece on "the agent-readable web in 2026" interests you, I can:
> 1. Share the dataset + reproducible benchmark
> 2. Connect you with maintainers of llms.txt, Firecrawl, and an MCP-ecosystem builder
> 3. Stay out of the way if you'd rather write it as straight reporting
>
> No agenda either way — happy to be a source, not a subject.
>
> — Roy Mehta
> `rdibbayajyoti@gmail.com`

---

## 9. Target list — where to send

Sorted by reach × fit. Send 5–8 per week, not 30 at once. Personalize the
first sentence for each.

### Highest-leverage AI / dev newsletters

| Newsletter | Editor / handle | Submit | Use email |
|---|---|---|---|
| TLDR (general) | Dan Ni | `submit@tldr.tech` | #5 (generic) |
| TLDR AI | Andrew Tate | `submit@tldr.tech` (subj: TLDR AI) | #6 (AI eng) |
| TLDR Web Dev | Dan Ni | `submit@tldr.tech` (subj: TLDR Web Dev) | #7 (web) |
| Bytes | Bytes team | `bytes.dev/issues` → reply to issue | #7 (web) |
| JavaScript Weekly | Peter Cooper / Cooperpress | https://cooperpress.com/publications/ → "submit a link" | #7 (web) |
| Node Weekly | Cooperpress | same as above | #7 (web) |
| React Status | Cooperpress | same as above | #7 (web) |
| Frontend Focus | Cooperpress | same as above | #7 (web) |
| Next.js Weekly | Issam Hakimi | https://nextjsweekly.com | #7 (web) |
| Console.dev | David / Jean | https://console.dev/submit | #5 (generic) |
| Console — open source | Console team | same | #5 (generic) |
| Pointer | Suraj Patil | `https://www.pointer.io/` reply to issue | #5 / #8 |
| Hacker Newsletter | Kale Davis | `kale@hackernewsletter.com` | #5 (generic) |
| Pragmatic Engineer | Gergely Orosz | reply to issue / DM | #8 (story idea) |
| Latent Space | Swyx + Alessio | https://www.latent.space (DM swyx on X) | #6 (AI eng) |
| AI Tidbits | Sahar Mor | reply to issue | #6 (AI eng) |
| The Rundown AI | Rowan Cheung | hello@therundown.ai | #6 (AI eng) |
| Ben's Bites | Ben Tossell | ben@bensbites.co | #6 (AI eng) |
| The Neuron | Pete Huang | press@theneurondaily.com | #5 (generic) |
| Import AI | Jack Clark | reply to issue (Jack reads them) | #8 (story idea) |
| The Sequence | Jesus Rodriguez | https://thesequence.substack.com | #6 (AI eng) |
| The Batch | DeepLearning.AI | `https://www.deeplearning.ai/the-batch/` contact | #6 (AI eng) |
| Last Week in AI | Andrey Kurenkov | reply to issue | #6 (AI eng) |
| AI Engineer Weekly | aiengineer.foundation | reply | #6 (AI eng) |
| The Information (AI desk) | Stephanie Palazzolo | tips@theinformation.com | #8 (story idea) |

### Secondary — submit in week 2

- **Daily.dev** — auto-pulls from GitHub releases (no pitch needed, just ship)
- **The New Stack** — pitch the architecture story (#8 framing)
- **Smashing Magazine** — pitch a guest tutorial after install hits ~500 weekly downloads
- **DEV.to** — crosspost your own article (no editor — it's just a post)
- **Reddit r/programming weekly digest** — surfaces top HN-style stories
- **Awesome MCP newsletter** (if exists by query) — submit PR + DM maintainer

### Non-English (skip for v0.1 unless you speak the language)

- **Frontend Daily (JP)** — frontend-weekly.com
- **Frontend Weekly (KR)** — frontendweekly.dev
- **Frontend Daily (CN)** — wechat-only, needs a connection

---

## 10. Assets to attach (have these ready before pressing send)

- `https://ahtml.dev/og.png` — 1200×630 social card
- `https://ahtml.dev/diagram.png` — 1672×941 architecture diagram (the one in `/public`)
- README screenshot of the benchmark table
- One-line install: `npm install @ahtmljs/next @ahtmljs/schema`
- Direct npm links:
  - https://www.npmjs.com/package/@ahtmljs/next
  - https://www.npmjs.com/package/@ahtmljs/schema
  - https://www.npmjs.com/package/@ahtmljs/agent
  - https://www.npmjs.com/package/@ahtmljs/vite
  - https://www.npmjs.com/package/@ahtmljs/langchain
- Reproducible benchmark: `git clone github.com/DibbayajyotiRoy/AHTML && cd AHTML && bash scripts/run-llm-benchmark.sh`

---

## 11. Follow-up cadence (don't be the pushy founder)

- **Day 0** — send.
- **Day 5** — if no reply: one-line bump. *"Quick bump in case it got buried — totally fine to skip if not a fit."*
- **Day 12** — final nudge with a fresh hook: a new metric, a Show HN that got X points, a partnership. If no reply after that, stop.

Never send three emails with no fresh value-add. Editors notice and silently
filter you forever.

---

## 12. What to track

Keep a simple sheet with columns:

| Newsletter | Editor | Sent | Reply | Outcome | Notes |
|---|---|---|---|---|---|

Outcome categories: `placed`, `passed`, `silent`, `for later`. After 30 days,
calculate placement rate by template variant — kill anything below 10%.

# AHTML — Marketing Handoff (target: 100K visitors)

> Companion to the in-repo work I just shipped. This file lists the things
> only **you** can do (need accounts, access, manual outreach, or live data)
> with copy-pasteable templates and concrete URLs.

**Last updated:** 2026-05-15
**Owner:** project maintainer

---

## What's already shipped in this repo

The landing site at `examples/landing/` now has, in addition to the existing hero/benchmark/demo:

- `/robots.ts` — explicit allow for GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot
- `/sitemap.ts` — all canonical URLs (static + comparison + integration + demo products)
- Full `<head>` metadata + OG image hook + Twitter card + canonical
- Two JSON-LD blocks site-wide: `SoftwareApplication` + `Organization`
- Trust pages: `/about`, `/contact`, `/privacy`, `/security`
- Comparison pages: `/vs/llms-txt`, `/vs/firecrawl`, `/vs/schema-org` (FAQ JSON-LD on each)
- Integration pages: `/integrations/{next,vite,sveltekit,astro,remix}` (HowTo JSON-LD on each)
- Free tool: `/tools/agent-readiness` — paste-a-URL scorer, real backend at `/api/score`
- Updated header nav + footer with all internal links

That covers, end-to-end:
- ✅ crawlable + indexed
- ✅ trust pages
- ✅ internal links between related pages
- ✅ comparison / alternative pages
- ✅ clear CTAs on every page
- ✅ articles for low-comp / high-intent terms (the comparison + integration pages are these articles)

The rest of this doc is what only you can do.

---

## Phase 1 — Connect GSC + GA4 (day 1)

You need accounts. Do this once.

### Google Search Console
1. Open https://search.google.com/search-console and add property **`https://ahtml.dev`** (Domain property is best — verifies the apex + all subdomains).
2. Verify via DNS TXT record (your DNS host) — Domain property only accepts DNS, not HTML upload.
3. Submit the sitemap: **Sitemaps → enter `sitemap.xml` → submit** (URL will be `https://ahtml.dev/sitemap.xml`).
4. Use URL Inspection on the homepage to force first index.

### Google Analytics 4
1. Open https://analytics.google.com → admin → create property `ahtml.dev`.
2. Create a Web data stream for `https://ahtml.dev`. Copy the `G-XXXXXXX` measurement ID.
3. Install via Next.js — add `<Script>` to `app/layout.tsx`:
   ```tsx
   import Script from 'next/script';
   // inside <body>
   <Script src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXX" />
   <Script id="ga">{`
     window.dataLayer = window.dataLayer || [];
     function gtag(){dataLayer.push(arguments);}
     gtag('js', new Date());
     gtag('config', 'G-XXXXXXX', { anonymize_ip: true });
   `}</Script>
   ```
4. In GA4 admin → Property Settings → enable Search Console link (bind GSC + GA so search queries show in GA reports).

### Bing Webmaster Tools (don't skip — Bing drives more agent traffic than people think)
1. https://www.bing.com/webmasters → add `ahtml.dev` → verify via DNS.
2. Import from GSC (one click) — copies the verified property.
3. Submit `https://ahtml.dev/sitemap.xml`.

---

## Phase 2 — Mobile speed (week 1)

Run live PageSpeed once deployed:

- https://pagespeed.web.dev/analysis?url=https%3A%2F%2Fahtml.dev

Fix any of these if PSI flags them:

| Symptom | Fix |
|---|---|
| LCP > 2.5s on mobile | Pre-render hero copy server-side (already done with App Router); add `priority` to LCP image if you ship one |
| INP > 200ms | The current site has very little client JS — but if you add the GA script, load with `strategy="afterInteractive"` |
| CLS > 0.1 | Set explicit `width`/`height` on any images. The benchmark/comparison tables already reserve space |
| Font CLS | Already using `display: 'swap'` with Next/font — keep it |
| Render-blocking CSS | Next bundles globals.css inline-critical already |

Target: **LCP < 2.0s, INP < 100ms, CLS < 0.05** on the homepage. Re-test weekly via CrUX (real-user, not lab) once you have traffic.

---

## Phase 3 — Directory + listing submissions (week 1–2)

Rank by leverage. Tier 1 = highest authority + relevance.

### Tier 1 — submit this week
| Directory | URL | Notes |
|---|---|---|
| Product Hunt | https://www.producthunt.com/posts/new | Save for a real launch day with screenshots, demo video, and a hunter |
| Hacker News (Show HN) | https://news.ycombinator.com/submit | Title: `Show HN: AHTML – RSS, but for AI agents` |
| Awesome MCP | https://github.com/punkpeye/awesome-mcp-servers — open PR adding AHTML | High dev relevance |
| Awesome AI agents | https://github.com/e2b-dev/awesome-ai-agents | Open PR |
| Awesome Next.js | https://github.com/unicodeveloper/awesome-nextjs | Open PR under "plugins" |
| Awesome Vite | https://github.com/vitejs/awesome-vite | Open PR |
| libraries.io | https://libraries.io | Auto-indexes from npm — verify all five packages appear |
| openbase.com | https://openbase.com/categories | npm-indexed |
| Sourcegraph index | https://sourcegraph.com/github.com/DibbayajyotiRoy/AHTML | Auto-indexed if public — check |

### Tier 2 — submit in weeks 2–4
| Directory | URL |
|---|---|
| AlternativeTo (vs Firecrawl, llms.txt) | https://alternativeto.net/software/new/ |
| BetaList | https://betalist.com |
| StackShare | https://stackshare.io |
| DEV.to (cross-post articles) | https://dev.to |
| daily.dev (auto-pulls from GitHub releases) | https://app.daily.dev |
| The Spec.io | https://thespec.io |
| Indie Hackers (Products) | https://www.indiehackers.com/products |
| There's an AI for That | https://theresanaiforthat.com |
| Futurepedia | https://www.futurepedia.io |

### Tier 3 — long tail, batch in week 4
Search "submit + your-category" and submit to the top 5–10 hits per category:
- `submit npm package directory`
- `submit AI tool directory`
- `submit developer tools`

**Template for awesome-* PRs:**

```markdown
- [AHTML](https://ahtml.dev) — RSS, but for AI agents. Drop-in Next.js / Vite / SvelteKit plugin that emits MCP, OpenAPI, JSON-LD, and llms.txt from your existing app.
```

---

## Phase 4 — Listicle / backlink outreach (weeks 2–6)

### Find the listicles
Google these queries; collect URLs of articles that already rank top-10:

- `best mcp servers`
- `mcp server tutorial`
- `llms.txt examples`
- `make your site ai-readable`
- `nextjs ai plugins`
- `tools for ai agents 2026`
- `firecrawl alternatives`

Also check what ranks for your target keywords (use the comparison pages' target queries):
- `ahtml`, `agent-readable html`, `mcp for nextjs`, `llms.txt for nextjs`, `token-efficient html`

### Outreach email template

> **Subject:** AHTML — possible add for your "[ARTICLE TITLE]" piece
>
> Hi [name],
>
> I really liked your write-up on [topic] — especially the part about [specific paragraph].
>
> Wanted to flag one tool that might be a fit: **AHTML** (https://ahtml.dev). It's a Next.js / Vite / SvelteKit plugin that emits MCP, OpenAPI, JSON-LD, and llms.txt from one source — kind of "RSS for AI agents." We measured 95–100% LLM-question-answering accuracy on 50% fewer tokens than raw HTML (full benchmark: https://github.com/DibbayajyotiRoy/AHTML#-how-well-does-an-ai-read-it).
>
> Open-source, MIT, three-file install. Happy to send a draft of a one-paragraph addition if useful — or feel free to skip if it's not a fit.
>
> [your name]

Keep it personalized — generic outreach gets 0% reply rate. Send no more than 20/week so you can keep them personal.

### Specific high-leverage targets to pitch
- [Anthropic's MCP docs / examples](https://modelcontextprotocol.io) — submit AHTML as a community server implementation
- [llmstxt.org](https://llmstxt.org) — propose AHTML be added to "tools that emit llms.txt"
- [Vercel templates gallery](https://vercel.com/templates) — submit the landing repo as a template
- [Next.js Discord](https://nextjs.org/discord) — share once, in #show-and-tell, after a clean PSI score

---

## Phase 5 — Reddit (for Okara — but here's the playbook)

Subreddits ranked by fit:
1. r/LocalLLaMA (300k+) — high-quality, very technical. Lead with the benchmark, not the marketing.
2. r/mcp — small but pure-fit.
3. r/nextjs (200k+) — talk to devs who'd actually install it.
4. r/webdev (1M+) — broader; needs a strong angle.
5. r/programming (5M+) — only for major releases or HN-style stories.
6. r/SideProject — friendly to launches.

**Rules of engagement:**
- 9 out of 10 replies should be helping someone with their actual problem, not promoting AHTML.
- The 1 in 10 promotional reply mentions AHTML only when it directly fits — and links to the relevant comparison / integration page, not the home page.
- Never copy-paste replies. Each one is fresh.

---

## Phase 6 — Content briefs for low-comp / high-intent articles

These pair with the existing comparison + integration pages. Write 1–2 per week.

### Brief 1: "How to make your Next.js site readable by AI agents in 2026"
- **Target query:** `make nextjs site ai readable`, `nextjs ai agent`, `nextjs mcp` (low/med competition, high intent)
- **Outline:**
  1. Why agents struggle with raw HTML (100-word setup; cite the benchmark)
  2. What "agent-readable" actually means (typed entities, typed actions, freshness)
  3. The 5-minute install (use the `/integrations/next` content)
  4. Verify with `/tools/agent-readiness` — link the free tool
  5. What changes for SEO + AI Overview after
- **Internal links:** `/integrations/next`, `/tools/agent-readiness`, `/vs/llms-txt`, `/#benchmark`
- **Word count:** 1500–2000
- **CTA:** "Score your site free"
- **Distribution:** crosspost to dev.to + r/nextjs (when ready)

### Brief 2: "llms.txt vs JSON-LD vs MCP: which one should your site emit?"
- **Target query:** `llms.txt vs json-ld`, `mcp vs llms.txt`, `ai agent standards`
- **Outline:** A decision matrix. End: "use AHTML and stop choosing."
- **Internal links:** all three `/vs/*` pages
- **Word count:** 1800–2400

### Brief 3: "We benchmarked 4 ways to feed HTML to an LLM. Here's what wins."
- **Target query:** `llm html tokens`, `feed html to gpt`, `claude html input`
- **Outline:** Republish the README benchmark with more context. Add a "run this yourself" section.
- **Internal links:** `/tools/agent-readiness`, `/#benchmark`
- **Word count:** 2000–3000
- **Distribution:** HN, r/LocalLLaMA

### Brief 4: "Adding MCP to an existing Next.js app — without rewriting anything"
- **Target query:** `mcp server nextjs`, `add mcp to existing app`
- **Word count:** 1200–1800
- **Internal links:** `/integrations/next`

### Brief 5: "What does Google AI Overview want? Inside Chrome's CrUX data + on-page signals"
- **Target query:** `ai overview optimization`, `seo for ai search`
- **Internal links:** `/tools/agent-readiness`

---

## Phase 7 — GSC low-CTR query workflow (start at day 30)

Once you have 30 days of GSC data:

1. Open Search Console → Performance → Search Results.
2. Filter: **Average CTR < 2%** and **Average position 5–15**.
3. Sort by **Impressions descending**.
4. Top 10 queries are your highest-impact title/meta rewrites.
5. For each:
   - Open the ranking URL.
   - Rewrite `<title>` to lead with the query keyword + a benefit.
   - Rewrite meta description to 120–160 chars with the query in the first 60.
   - Re-submit URL for indexing.
   - Re-check CTR after 14 days.

Suggested cadence: once a month, 30 minutes.

---

## Phase 8 — Experiments (30 / 60 day)

| # | Test | Hypothesis | Metric | Days |
|---|---|---|---|---|
| 1 | Hero copy: "RSS, but for AI agents" vs current "The HTML of the agent web" | Punchier tagline → higher scroll depth + install-click rate | scroll % to install section, button-click rate | 14 |
| 2 | CTA: "Install in 3 minutes" vs "Try it free" | Specificity wins | install-click rate | 14 |
| 3 | Free tool as homepage above-fold vs current hero | Lead-magnet first converts cold traffic better | unique scoring events / homepage visit | 30 |
| 4 | Add a 30-second demo video to hero | Video lifts engagement on dev landings | scroll depth, install rate | 30 |
| 5 | Comparison page leading with "Pick AHTML when" vs the table | People decide before reading the table | conversion-to-install on `/vs/*` pages | 30 |
| 6 | Toggle JSON-LD `SoftwareApplication.offers.price` "0" vs absent | AI Overview eligibility | impressions on `ahtml` brand query | 60 |
| 7 | Add `<link rel="me">` to GitHub + npm profiles | Strengthens entity association for E-E-A-T | brand-query impressions | 60 |

Stack-rank by RICE every two weeks. Kill anything that hasn't moved the needle by day 30.

---

## Quick checklist — at a glance

- [ ] GSC verified + sitemap submitted
- [ ] GA4 installed + GSC linked
- [ ] Bing Webmaster set up
- [ ] PSI run on prod, all three CWV in green
- [ ] Submitted to 9 Tier-1 directories (Phase 3)
- [ ] OG image at `/og.png` exists (1200×630)
- [ ] Logo at `/logo.png` exists
- [ ] Outreach week 1 — 5 personalized pitches sent
- [ ] First blog article live + crossposted
- [ ] First Reddit value-reply posted
- [ ] Score-your-site tool tested end-to-end on prod
- [ ] Experiment #1 launched

When all 12 are checked, you have the foundation laid for 100K traffic over the following 6–9 months.

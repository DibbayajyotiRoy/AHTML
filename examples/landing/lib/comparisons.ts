export type Row = readonly [feature: string, them: string, ahtml: string];

export type Comparison = {
  slug: string;
  competitor: string;
  competitorUrl: string;
  title: string;
  description: string;
  oneLiner: string;
  positioning: string;
  similarities: readonly string[];
  whenToUseThem: readonly string[];
  whenToUseAhtml: readonly string[];
  rows: readonly Row[];
};

export const COMPARISONS: Record<string, Comparison> = {
  'llms-txt': {
    slug: 'llms-txt',
    competitor: 'llms.txt',
    competitorUrl: 'https://llmstxt.org',
    title: 'AHTML vs llms.txt — when each one wins',
    description:
      'llms.txt is a markdown index of your site for LLMs. AHTML is a typed-entity + typed-action snapshot that compiles down to llms.txt for free. Use llms.txt for read-only docs sites; use AHTML when agents need to take action.',
    oneLiner: 'llms.txt tells an LLM what your site contains. AHTML tells an agent what your site can do.',
    positioning: 'AHTML compiles to llms.txt as a free byproduct. Installing AHTML gives you both — plus MCP, OpenAPI, and JSON-LD, all from one source of truth.',
    similarities: [
      'Both are open standards aimed at making the web legible to AI.',
      'Both can be served as a static endpoint with no auth.',
      'Both are additive — your existing HTML is untouched.',
    ],
    whenToUseThem: [
      'You only need to expose a documentation index (links + descriptions).',
      'You don’t expose any actions, only read-only content.',
      'You can’t install a framework plugin (e.g. pure static HTML hosting).',
    ],
    whenToUseAhtml: [
      'Agents need to take actions on your site (add to cart, file a ticket, book a slot).',
      'You want typed entities (prices, SKUs, availability) without writing schema.org by hand.',
      'You want MCP and OpenAPI emitted automatically alongside llms.txt.',
      'You want signed, fresh snapshots so agents trust what they read.',
    ],
    rows: [
      ['Format', 'Markdown', 'Compact text + JSON, plus emits llms.txt'],
      ['Typed entities (price, SKU, availability)', '—', '✓'],
      ['Typed actions (cost, reversible, side-effects)', '—', '✓'],
      ['Confirmation contract', '—', '✓'],
      ['Freshness / TTL / ETag', '—', '✓'],
      ['Emits MCP', '—', '✓'],
      ['Emits OpenAPI 3.1', '—', '✓'],
      ['Emits JSON-LD (schema.org)', '—', '✓'],
      ['Emits llms.txt', '✓ (is the format)', '✓ (auto)'],
      ['Token efficiency for fact-extraction', 'good', 'best (95–100% accuracy at fewer tokens — measured)'],
      ['Cryptographic signing (v0.2)', '—', '✓'],
      ['Site-wide policy block', 'partial', '✓'],
      ['Framework plugin (Next/Vite/SvelteKit)', '—', '✓'],
      ['License', 'CC BY 4.0', 'MIT (libraries)'],
    ],
  },

  firecrawl: {
    slug: 'firecrawl',
    competitor: 'Firecrawl',
    competitorUrl: 'https://firecrawl.dev',
    title: 'AHTML vs Firecrawl — site-emitted vs externally-crawled',
    description:
      'Firecrawl is a hosted crawler that turns your existing HTML into LLM-ready markdown from the outside. AHTML emits the same kind of structure from inside your app, with typed actions, MCP, and OpenAPI included. Different architectures, different trade-offs.',
    oneLiner: 'Firecrawl reads your site from the outside. AHTML emits structured data from the inside.',
    positioning: 'Firecrawl and AHTML solve adjacent problems: Firecrawl turns any URL into clean markdown via external crawl, AHTML turns your own app into a typed agent surface. The two compose — Firecrawl can crawl AHTML endpoints and get even cleaner output.',
    similarities: [
      'Both make web content easier for LLMs to consume.',
      'Both reduce token cost vs raw HTML.',
      'Both expose JSON-shaped output.',
    ],
    whenToUseThem: [
      'You need to scrape sites you don’t own.',
      'You can’t deploy a plugin to the target site.',
      'You’re fine paying per-request for a hosted service.',
    ],
    whenToUseAhtml: [
      'You own the site and want zero per-request inference cost.',
      'Agents need to take typed actions, not just read.',
      'You want MCP and OpenAPI emitted alongside the snapshot.',
      'You want sub-100ms response times (no remote crawl in the loop).',
      'You want cryptographic provenance (v0.2 signed snapshots).',
    ],
    rows: [
      ['Architecture', 'Hosted crawler (external)', 'Framework plugin (in-app)'],
      ['Works on sites you don’t own', '✓', '—'],
      ['Zero per-request cost', '—', '✓'],
      ['Latency', 'Crawl + parse round-trip', 'Single in-process call'],
      ['Typed actions (cost / reversible / side-effects)', '—', '✓'],
      ['MCP server emitted', '—', '✓'],
      ['OpenAPI 3.1 emitted', '—', '✓'],
      ['JSON-LD emitted', '—', '✓'],
      ['llms.txt emitted', '—', '✓'],
      ['Auth-walled data support', 'limited', '✓ (in your auth context)'],
      ['Signed provenance', '—', '✓ (v0.2 roadmap)'],
      ['Pricing', 'Per-request SaaS', 'Free (MIT)'],
    ],
  },

  'schema-org': {
    slug: 'schema-org',
    competitor: 'schema.org JSON-LD',
    competitorUrl: 'https://schema.org',
    title: 'AHTML vs schema.org JSON-LD — extends, doesn’t replace',
    description:
      'schema.org JSON-LD describes what a thing is. AHTML adds typed actions, freshness, and a site-wide policy on top — and ingests your existing JSON-LD as a free Level-0 source.',
    oneLiner: 'schema.org describes entities. AHTML describes entities AND the actions you can take on them.',
    positioning: 'AHTML is not a competitor to schema.org. AHTML emits schema.org JSON-LD as part of every snapshot, and reads your existing schema.org markup to bootstrap a Level-0 snapshot with zero code changes.',
    similarities: [
      'Both expose typed entities (Product, Article, Event, etc.).',
      'Both can be embedded inline or served at a dedicated endpoint.',
      'Both are open standards.',
    ],
    whenToUseThem: [
      'You only need search-engine rich results, not agent actions.',
      'You’re happy hand-writing JSON-LD for each page type.',
      'You don’t need freshness, TTL, or rate-limit signaling.',
    ],
    whenToUseAhtml: [
      'You want agents to take action, not just read.',
      'You want JSON-LD generated from one source instead of duplicated across templates.',
      'You want freshness + TTL + ETag built into the snapshot.',
      'You want a site-wide manifest (<code>/.well-known/ahtml.json</code>) agents can discover first.',
    ],
    rows: [
      ['Typed entities', '✓', '✓ (ingests schema.org)'],
      ['Typed actions (with cost/reversibility)', '✓ (Action partial)', '✓ (first-class contract)'],
      ['Confirmation requirement', '—', '✓'],
      ['Side-effect declarations', '—', '✓'],
      ['Freshness / TTL', '—', '✓'],
      ['Conditional fetch (ETag)', '—', '✓'],
      ['Site-wide policy', '—', '✓'],
      ['Rate-limit signaling', '—', '✓'],
      ['Auto-generated from your data layer', '—', '✓'],
      ['Emits MCP + OpenAPI + llms.txt', '—', '✓'],
      ['Signed provenance', '—', '✓ (v0.2)'],
      ['Format', 'JSON-LD', 'JSON / compact text + JSON-LD as one emission'],
    ],
  },
};

export const COMPARISON_SLUGS = Object.keys(COMPARISONS);

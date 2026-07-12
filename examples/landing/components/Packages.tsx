const PACKAGES = [
  // Contract layer
  {
    id: 'schema',
    layer: 'Contract',
    registry: 'npm',
    name: '@ahtmljs/schema',
    role: 'The canonical snapshot schema. Everything else depends on it.',
    install: 'npm install @ahtmljs/schema',
    forWho: 'Anyone authoring or validating AHTML without a framework adapter: server, client, or tooling.',
    bullets: [
      'TypeScript types + JSON Schema + builder + validator + linter',
      'Dual serializers: token-optimal compact text and lossless JSON',
      'Deterministic ETags, structural diffing, and apply-patch helpers',
      'HTTP Message Signatures (RFC 9421), x402 helpers, and policy presets',
    ],
    snippet: (
      <>
        <span className="keyword">import</span> {'{ snapshot, toCompact, lint }'} <span className="keyword">from</span>{' '}
        <span className="string">'@ahtmljs/schema'</span>;
      </>
    ),
  },
  // Site adapters
  {
    id: 'next',
    layer: 'Adapter',
    registry: 'npm',
    name: '@ahtmljs/next',
    role: 'Next.js plugin. One route, every well-known endpoint.',
    install: 'npm install @ahtmljs/next',
    forWho: 'App Router sites on Next 14+/15 that want to be an MCP server.',
    bullets: [
      'Single route emits AHTML compact + JSON, MCP, OpenAPI 3.1, JSON-LD, llms.txt',
      'Auto-discovers routes; no need to maintain a separate manifest',
      'q-value Accept negotiation, ETag/If-None-Match, ?since=<etag> diffs',
      'verifyAgents config and withPaymentGuard for priced actions',
    ],
    snippet: (
      <>
        <span className="keyword">import</span> {'{ createAHTMLRoute }'} <span className="keyword">from</span>{' '}
        <span className="string">'@ahtmljs/next/handler'</span>;
      </>
    ),
  },
  {
    id: 'astro',
    layer: 'Adapter',
    registry: 'npm',
    name: '@ahtmljs/astro',
    role: 'Astro integration. All five endpoints, zero astro dependency.',
    install: 'npm install @ahtmljs/astro',
    forWho: 'Astro sites that want the same agent surface as the Next adapter.',
    bullets: [
      'Injects .well-known, snapshot routes, MCP, OpenAPI, and llms.txt',
      'Content negotiation, 304s, and ?since=<etag> diffs included',
      'Passes the same adapter test matrix as @ahtmljs/next',
      'Built on the @ahtmljs/extract plugin API',
    ],
    snippet: (
      <>
        <span className="keyword">import</span> {'{ ahtml }'} <span className="keyword">from</span>{' '}
        <span className="string">'@ahtmljs/astro'</span>;
      </>
    ),
  },
  {
    id: 'sveltekit',
    layer: 'Adapter',
    registry: 'npm',
    name: '@ahtmljs/sveltekit',
    role: 'SvelteKit adapter. One server hook or per-endpoint handlers.',
    install: 'npm install @ahtmljs/sveltekit',
    forWho: 'SvelteKit apps that want the same five-endpoint agent surface.',
    bullets: [
      'ahtmlHandle wires everything from hooks.server.ts',
      'Or re-export plain handlers from +server.ts files per endpoint',
      'Zero @sveltejs/kit dependency; same test matrix as Next',
      'Built on the @ahtmljs/extract plugin API',
    ],
    snippet: (
      <>
        <span className="keyword">import</span> {'{ ahtmlHandle }'} <span className="keyword">from</span>{' '}
        <span className="string">'@ahtmljs/sveltekit'</span>;
      </>
    ),
  },
  {
    id: 'vite',
    layer: 'Adapter',
    registry: 'npm',
    name: '@ahtmljs/vite',
    role: 'Vite plugin. Same bytes as the Next adapter, every Vite framework.',
    install: 'npm install @ahtmljs/vite',
    forWho: 'SolidStart, vanilla Vite, or any Vite-based app without a dedicated adapter.',
    bullets: [
      'Mounts the well-known + /ahtml/* routes as Vite middleware',
      'Byte-identical output to @ahtmljs/next; cross-framework parity is real',
      'Serves /ahtml/openapi.json + /ahtml/mcp.json out of the box',
      'One line in vite.config.ts; Vite 5+ peer dep',
    ],
    snippet: (
      <>
        <span className="keyword">import</span> {'{ ahtml }'} <span className="keyword">from</span>{' '}
        <span className="string">'@ahtmljs/vite'</span>;
      </>
    ),
  },
  {
    id: 'hono',
    layer: 'Adapter',
    registry: 'npm',
    name: '@ahtmljs/hono',
    role: 'Hono adapter. The same emitter on every JavaScript runtime.',
    install: 'npm install @ahtmljs/hono',
    forWho: 'Hono apps on Node, Bun, Deno, Cloudflare Workers, or AWS Lambda.',
    bullets: [
      'Mounts the well-known + /ahtml/* routes on any Hono app',
      'Byte-identical output to the Next and Vite adapters; true parity',
      'Edge-first: no node:* imports in the hot path',
      'One line; Hono 4+ peer dep',
    ],
    snippet: (
      <>
        <span className="keyword">import</span> {'{ ahtml }'} <span className="keyword">from</span>{' '}
        <span className="string">'@ahtmljs/hono'</span>;
      </>
    ),
  },
  {
    id: 'extract',
    layer: 'Adapter',
    registry: 'npm',
    name: '@ahtmljs/extract',
    role: 'The extractor pipeline behind every adapter, with a stable plugin API.',
    install: 'npm install @ahtmljs/extract',
    forWho: 'Custom domain extractors (recipes, job posts) or new framework adapters.',
    bullets: [
      'definePlugin({ match, extract, priority }) over a neutral PageModel',
      'Powers the Next, Vite, Hono, Astro, and SvelteKit adapters',
      'A sub-100-LOC community recipe plugin proves the contract',
      '@experimental for one minor release',
    ],
    snippet: (
      <>
        <span className="keyword">import</span> {'{ definePlugin }'} <span className="keyword">from</span>{' '}
        <span className="string">'@ahtmljs/extract'</span>;
      </>
    ),
  },
  // Agent-side
  {
    id: 'agent',
    layer: 'Consumer',
    registry: 'npm',
    name: '@ahtmljs/agent',
    role: 'Client SDK for AI agents that read the web. Works on any URL, adopter or not.',
    install: 'npm install @ahtmljs/agent',
    forWho: 'Anyone building an agent, scraper, or automation that reads other sites.',
    bullets: [
      'Typed fetch + ETag cache; fetchPage() falls back to HTML extraction',
      'runAction() with auth, cost, reversibility, and confirmation gates',
      'SPEC §4.7 dry-run sandbox: rehearse an action before it mutates or charges',
      'POLICY_PRESETS.strict requires a dry-run before irreversible priced actions',
    ],
    snippet: (
      <>
        <span className="keyword">import</span> {'{ AHTMLClient }'} <span className="keyword">from</span>{' '}
        <span className="string">'@ahtmljs/agent'</span>;
      </>
    ),
  },
  {
    id: 'python',
    layer: 'Consumer',
    registry: 'PyPI',
    name: 'ahtml (Python)',
    role: 'The Python consumer SDK, 1:1 with the TypeScript agent.',
    install: 'pip install ahtml',
    forWho: 'Agent stacks in Python: LangChain, LlamaIndex, CrewAI, or raw SDKs.',
    bullets: [
      'LangChain loader plus an ETag/TTL-cached client',
      'Detached-JWS and did:web verification',
      'run_action with the same safety gate and dry-run sandbox',
      'Canonical JSON output byte-identical to the TypeScript reference',
    ],
    snippet: (
      <>
        <span className="keyword">from</span> ahtml <span className="keyword">import</span> AHTMLClient
      </>
    ),
  },
  {
    id: 'langchain',
    layer: 'Consumer',
    registry: 'npm',
    name: '@ahtmljs/langchain',
    role: 'LangChain.js document loader. URL to embeddings in three lines.',
    install: 'npm install @ahtmljs/langchain',
    forWho: 'RAG pipelines, vector stores, and retrieval chains on LangChain.js.',
    bullets: [
      'Returns LangChain Document[] preserving Document.chunks as separate records',
      'Citation anchors, byte ranges, and source URLs in per-chunk metadata',
      'No re-chunking; splits at server-declared boundaries deterministically',
      '@langchain/core 0.3+ peer dep',
    ],
    snippet: (
      <>
        <span className="keyword">import</span> {'{ AHTMLLoader }'} <span className="keyword">from</span>{' '}
        <span className="string">'@ahtmljs/langchain'</span>;
      </>
    ),
  },
  // Tooling & infrastructure
  {
    id: 'cli',
    layer: 'Tooling',
    registry: 'npm',
    name: '@ahtmljs/cli',
    role: 'Scaffold, audit, score, certify, or proxy any site from your terminal.',
    install: 'npm install -g @ahtmljs/cli',
    forWho: 'Anyone adopting AHTML, or anyone who wants MCP tools from any URL today.',
    bullets: [
      'init detects Next, Vite, Hono, Astro, or SvelteKit and wires everything',
      'analyze, score, doctor, extract, and benchmark work on any URL',
      'badge, submit (to the AHTML Index), and conformance certification',
      'mcp <url> is a stdio MCP proxy: any site becomes typed MCP tools',
    ],
    snippet: (
      <>
        <span className="string">$</span> npx @ahtmljs/cli init
      </>
    ),
  },
  {
    id: 'kv',
    layer: 'Infrastructure',
    registry: 'npm',
    name: '@ahtmljs/kv',
    role: 'Pluggable KV and cache backends. Same caching from one server to an edge fleet.',
    install: 'npm install @ahtmljs/kv',
    forWho: 'Sites that cache snapshots or rate-limit agents across multiple instances.',
    bullets: [
      'Drop-in backends for the AHTMLClient cache and rate-limiting surfaces',
      'In-memory, Upstash Redis, and Cloudflare KV adapters',
      'Backend-agnostic token-bucket RateLimiter',
      'Tiny, dependency-light; bring your own store',
    ],
    snippet: (
      <>
        <span className="keyword">import</span> {'{ UpstashKV }'} <span className="keyword">from</span>{' '}
        <span className="string">'@ahtmljs/kv'</span>;
      </>
    ),
  },
  {
    id: 'webmcp',
    layer: 'Tooling',
    registry: 'npm',
    name: '@ahtmljs/webmcp',
    role: 'WebMCP bridge. Expose page actions as native browser tools.',
    install: 'npm install @ahtmljs/webmcp',
    forWho: 'Sites that want in-page AI assistants to discover and run their typed actions.',
    bullets: [
      'Registers AHTML page actions as WebMCP browser tools (Chrome 149+ origin trial)',
      'Carries AHTML cost, reversibility, and confirmation metadata as annotations',
      'Reuses the same action schema your snapshot already declares',
      'Zero-install bookmarklet inspector included',
    ],
    snippet: (
      <>
        <span className="keyword">import</span> {'{ registerWebMCP }'} <span className="keyword">from</span>{' '}
        <span className="string">'@ahtmljs/webmcp'</span>;
      </>
    ),
  },
  {
    id: 'insights',
    layer: 'Infrastructure',
    registry: 'npm',
    name: '@ahtmljs/insights',
    role: 'Agent-traffic analytics. See which agents actually read your site.',
    install: 'npm install @ahtmljs/insights',
    forWho: 'Publishers who ship AHTML and want to know who consumes it.',
    bullets: [
      'Classifies RFC 9421-verified agents vs declared bots vs humans',
      'Records fetches, formats, and action outcomes behind @ahtmljs/kv',
      'Tested zero-PII guarantee; 1 ms or less p95 middleware overhead',
      'summarize(), offline HTML dashboard, and OTel export',
    ],
    snippet: (
      <>
        <span className="keyword">import</span> {'{ createInsights }'} <span className="keyword">from</span>{' '}
        <span className="string">'@ahtmljs/insights'</span>;
      </>
    ),
  },
  {
    id: 'conformance',
    layer: 'Tooling',
    registry: 'npm',
    name: '@ahtmljs/conformance',
    role: 'The language-agnostic conformance corpus and runner.',
    install: 'npm install @ahtmljs/conformance',
    forWho: 'Anyone reimplementing AHTML in Go, Rust, PHP, or anything else.',
    bullets: [
      'Versioned fixtures covering every RFC-2119 MUST in SPEC.md',
      'Signature vectors including negatives, plus dry-run gates',
      'Signed result attestations you can publish',
      'The TS reference and the Python SDK both pass 100% through the same runner',
    ],
    snippet: (
      <>
        <span className="string">$</span> ahtml conformance <span className="string">manifest.json</span>
      </>
    ),
  },
  {
    id: 'index',
    layer: 'Infrastructure',
    registry: 'npm',
    name: '@ahtmljs/index',
    role: 'The AHTML Index. A registry and crawler so agents can find adopters.',
    install: 'npm install @ahtmljs/index',
    forWho: 'Anyone running or querying the registry of AHTML-enabled sites.',
    bullets: [
      'Opt-in submission with validate, score, and signature checks',
      'TTL/ETag-honoring re-crawl; unchanged sites cost one 304',
      'Opt-out delisting that honors RSL and site policy',
      'MCP query surface: search_sites and sites_with_action',
    ],
    snippet: (
      <>
        <span className="string">$</span> ahtml submit <span className="string">https://example.com</span>
      </>
    ),
  },
  {
    id: 'badge',
    layer: 'Infrastructure',
    registry: 'npm',
    name: '@ahtmljs/badge',
    role: 'Hosted score-badge service. Public, self-updating proof your site is agent-ready.',
    install: 'npm install @ahtmljs/badge',
    forWho: 'Publishers who want a README-embeddable score badge.',
    bullets: [
      'README-embeddable SVG with a linked score report',
      'Score is byte-identical to a local ahtml score run',
      'TTL-honoring cache plus per-IP rate limit',
      'Deployable as a Cloudflare Worker or any fetch-handler runtime',
    ],
    snippet: (
      <>
        <span className="string">$</span> ahtml badge <span className="string">https://example.com</span>
      </>
    ),
  },
];

export default function Packages() {
  return (
    <section className="section" id="packages">
      <div className="container">
        <div className="kicker">The packages</div>
        <h2 style={{ marginTop: 12, marginBottom: 12 }}>Sixteen packages, one contract. Plus Python.</h2>
        <p className="lede" style={{ marginBottom: 12 }}>
          The <code className="inline">@ahtmljs/*</code> scope splits cleanly: one schema everyone
          shares, five site adapters (plus the extractor plugin API behind them), agent-side clients
          in TypeScript and Python, and tooling that scores, certifies, indexes, and measures the
          result. The <code className="inline">ahtml</code> Python SDK on PyPI mirrors the TypeScript
          agent 1:1.
        </p>
        <p style={{ color: 'var(--ink-3)', marginBottom: 40, fontSize: 14 }}>
          Full per-package endpoints, download counters, and STAR breakdowns in{' '}
          <a
            href="https://github.com/DibbayajyotiRoy/AHTML/blob/main/PACKAGES.md"
            style={{ color: 'inherit', borderBottomColor: 'var(--rule)' }}
          >
            PACKAGES.md
          </a>
          . Python SDK source in{' '}
          <a
            href="https://github.com/DibbayajyotiRoy/AHTML/tree/main/python"
            style={{ color: 'inherit', borderBottomColor: 'var(--rule)' }}
          >
            python/
          </a>
          .
        </p>

        <div className="grid cols-2">
          {PACKAGES.map((p) => (
            <div key={p.name} id={`pkg-${p.id}`} className="card">
              <div className="step">
                {p.layer} layer · {p.registry}
              </div>
              <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 18 }}>{p.name}</h3>
              <p style={{ marginBottom: 12 }}>{p.role}</p>
              <p style={{ color: 'var(--ink-3)', fontSize: 13, marginBottom: 14 }}>
                <strong style={{ color: 'var(--ink-2)' }}>For:</strong> {p.forWho}
              </p>
              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: '0 0 16px',
                  color: 'var(--ink-2)',
                  fontSize: 14,
                  lineHeight: 1.55,
                }}
              >
                {p.bullets.map((b, i) => (
                  <li key={i} style={{ paddingLeft: 16, position: 'relative', marginBottom: 4 }}>
                    <span style={{ position: 'absolute', left: 0, color: 'var(--ink-3)' }}>·</span>
                    {b}
                  </li>
                ))}
              </ul>
              <pre className="code-block" style={{ margin: 0, fontSize: 12.5 }}>
                <code>
                  <span className="comment">$ {p.install}</span>
                  {'\n'}
                  {p.snippet}
                </code>
              </pre>
              <p style={{ marginTop: 14, marginBottom: 0, fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>
                <a
                  href={`#quickstart-${p.id}`}
                  style={{ color: 'var(--accent)', borderBottomColor: 'var(--accent)' }}
                >
                  Quickstart flow for {p.name} →
                </a>
              </p>
            </div>
          ))}
        </div>

        <hr style={{ margin: '48px 0 24px' }} />
        <p
          style={{
            color: 'var(--ink-3)',
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            lineHeight: 1.7,
          }}
        >
          The dependency graph:{' '}
          <code className="inline">schema</code> ← <code className="inline">extract</code> ←{' '}
          <code className="inline">next</code> / <code className="inline">astro</code> /{' '}
          <code className="inline">sveltekit</code> / <code className="inline">vite</code> /{' '}
          <code className="inline">hono</code> (emit) ·{' '}
          <code className="inline">schema</code> ← <code className="inline">agent</code> /{' '}
          <code className="inline">langchain</code> / <code className="inline">ahtml-py</code>{' '}
          (consume). One contract on both sides of the wire.
        </p>
      </div>
    </section>
  );
}

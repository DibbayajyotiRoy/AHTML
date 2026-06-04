const PACKAGES = [
  {
    id: 'schema',
    layer: 'Contract',
    name: '@ahtmljs/schema',
    role: 'The canonical snapshot schema. Everything else depends on it.',
    install: 'npm install @ahtmljs/schema',
    forWho: 'Anyone authoring or validating AHTML — server, client, or tooling.',
    bullets: [
      'TypeScript types + JSON Schema + builder + validator + linter',
      'Dual serializers — token-optimal compact text and lossless JSON',
      'Deterministic ETags, structural diffing, and apply-patch helpers',
      'Document.chunks primitive — byte ranges and stable IDs for RAG',
    ],
    snippet: (
      <>
        <span className="keyword">import</span> {'{ snapshot, toCompact, lint }'} <span className="keyword">from</span>{' '}
        <span className="string">'@ahtmljs/schema'</span>;
      </>
    ),
  },
  {
    id: 'next',
    layer: 'Adapter',
    name: '@ahtmljs/next',
    role: 'Next.js plugin. One route, every well-known endpoint.',
    install: 'npm install @ahtmljs/next',
    forWho: 'App Router or Pages Router sites on Next 14+ that want agent traffic.',
    bullets: [
      'Single route emits AHTML compact + JSON, MCP, OpenAPI 3.1, JSON-LD, llms.txt',
      'Auto-discovers routes; no need to maintain a separate manifest',
      'q-value Accept negotiation, ETag/If-None-Match, ?since=<etag> diffs',
      'Token-bucket policy enforcement at the edge',
    ],
    snippet: (
      <>
        <span className="keyword">import</span> {'{ createAHTMLRoute }'} <span className="keyword">from</span>{' '}
        <span className="string">'@ahtmljs/next/handler'</span>;
      </>
    ),
  },
  {
    id: 'vite',
    layer: 'Adapter',
    name: '@ahtmljs/vite',
    role: 'Vite plugin. Same bytes as the Next adapter, every Vite framework.',
    install: 'npm install @ahtmljs/vite',
    forWho: 'SvelteKit, SolidStart, Astro, Remix, or vanilla Vite projects.',
    bullets: [
      'Mounts the well-known + /ahtml/* routes as Vite middleware',
      'Byte-identical output to @ahtmljs/next — cross-framework parity is real',
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
    id: 'agent',
    layer: 'Consumer',
    name: '@ahtmljs/agent',
    role: 'Client SDK for AI agents that consume AHTML sites.',
    install: 'npm install @ahtmljs/agent',
    forWho: 'Anyone building an agent, scraper, or automation that calls AHTML endpoints.',
    bullets: [
      'Typed fetch + ETag cache; validates server snapshots before they enter the cache',
      'Structured runAction() with auth, cost, reversibility, and confirmation gates',
      'Dry-run mode that never hits execute_url even under adversarial overrides',
      'Optional tokenizer adapters (OpenAI o200k_base, Anthropic) for real-cost reporting',
    ],
    snippet: (
      <>
        <span className="keyword">import</span> {'{ AHTMLClient }'} <span className="keyword">from</span>{' '}
        <span className="string">'@ahtmljs/agent'</span>;
      </>
    ),
  },
  {
    id: 'langchain',
    layer: 'Consumer',
    name: '@ahtmljs/langchain',
    role: 'LangChain.js document loader. URL → embeddings in three lines.',
    install: 'npm install @ahtmljs/langchain',
    forWho: 'RAG pipelines, vector stores, and retrieval chains on LangChain.js.',
    bullets: [
      'Returns LangChain Document[] preserving Document.chunks as separate records',
      'Citation anchors, byte ranges, and source URLs in per-chunk metadata',
      'No re-chunking — splits at server-declared boundaries deterministically',
      '@langchain/core 0.3+ peer dep',
    ],
    snippet: (
      <>
        <span className="keyword">import</span> {'{ AHTMLLoader }'} <span className="keyword">from</span>{' '}
        <span className="string">'@ahtmljs/langchain'</span>;
      </>
    ),
  },
  {
    id: 'hono',
    layer: 'Adapter',
    name: '@ahtmljs/hono',
    role: 'Hono adapter. The same emitter on every JavaScript runtime.',
    install: 'npm install @ahtmljs/hono',
    forWho: 'Hono apps on Node, Bun, Deno, Cloudflare Workers, or AWS Lambda.',
    bullets: [
      'Mounts the well-known + /ahtml/* routes on any Hono app',
      'Byte-identical output to the Next and Vite adapters — true parity',
      'Runs on Node, Bun, Deno, Cloudflare Workers, and AWS Lambda',
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
    id: 'cli',
    layer: 'Tooling',
    name: '@ahtmljs/cli',
    role: 'ahtml doctor. Validate the whole discovery chain from CI.',
    install: 'npm install -g @ahtmljs/cli',
    forWho: 'Anyone shipping AHTML who wants the discovery chain checked on every build.',
    bullets: [
      'Walks /.well-known/ahtml.json → snapshot → MCP → OpenAPI → llms.txt',
      'Validates each endpoint against the AHTML lint rules',
      'Exits non-zero on failure — wire it straight into CI',
      'Zero-config; reads the site like an agent would',
    ],
    snippet: (
      <>
        <span className="string">$</span> ahtml doctor <span className="string">https://example.com</span>
      </>
    ),
  },
];

export default function Packages() {
  return (
    <section className="section" id="packages">
      <div className="container">
        <div className="kicker">The packages</div>
        <h2 style={{ marginTop: 12, marginBottom: 12 }}>Seven packages, one contract.</h2>
        <p className="lede" style={{ marginBottom: 12 }}>
          The <code className="inline">@ahtmljs/*</code> scope splits cleanly into four layers — one
          schema everyone shares, three server adapters that emit it, two clients that consume it,
          and a CLI that validates the whole chain.
        </p>
        <p style={{ color: 'var(--ink-3)', marginBottom: 40, fontSize: 14 }}>
          Full per-package endpoints, download counters, and STAR breakdowns in{' '}
          <a
            href="https://github.com/DibbayajyotiRoy/AHTML/blob/main/PACKAGES.md"
            style={{ color: 'inherit', borderBottomColor: 'var(--rule)' }}
          >
            PACKAGES.md
          </a>
          .
        </p>

        <div className="grid cols-2">
          {PACKAGES.map((p) => (
            <div key={p.name} id={`pkg-${p.id}`} className="card">
              <div className="step">
                {p.layer} layer · npm
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
          <code className="inline">schema</code> ← <code className="inline">next</code> /{' '}
          <code className="inline">vite</code> (emit) ·{' '}
          <code className="inline">schema</code> ← <code className="inline">agent</code> /{' '}
          <code className="inline">langchain</code> (consume). One contract on both sides of the wire.
        </p>
      </div>
    </section>
  );
}

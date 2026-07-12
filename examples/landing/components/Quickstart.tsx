'use client';

import { useEffect, useState } from 'react';

type Step = {
  title: string;
  meta?: string;
  code: React.ReactNode;
};

type Flow = {
  id: 'next' | 'vite' | 'schema' | 'agent' | 'langchain';
  pkg: string;
  role: 'emit' | 'emit' | 'author' | 'consume' | 'ingest';
  tagline: string;
  forWho: string;
  endpoints?: { path: string; note: string }[];
  steps: Step[];
};

const FLOWS: Flow[] = [
  {
    id: 'next',
    pkg: '@ahtmljs/next',
    role: 'emit',
    tagline: 'Next.js sites: one route, every machine surface.',
    forWho: 'Next 14+ App Router or Pages Router projects.',
    endpoints: [
      { path: '/ahtml/*', note: 'typed snapshot per route (compact or JSON via Accept)' },
      { path: '/ahtml/mcp.json', note: 'auto-generated MCP tools manifest' },
      { path: '/ahtml/openapi.json', note: 'auto-generated OpenAPI 3.1 document' },
      { path: '/.well-known/ahtml.json', note: 'site-wide discovery manifest' },
      { path: '/llms.txt', note: 'compatibility shim for Cursor / Continue / Cline' },
    ],
    steps: [
      {
        title: 'Install',
        meta: 'npm',
        code: (
          <code>
            npm install <span className="string">@ahtmljs/next @ahtmljs/schema</span>
          </code>
        ),
      },
      {
        title: 'Wrap next.config',
        meta: 'next.config.mjs',
        code: (
          <code>
            <span className="keyword">import</span> {'{ withAHTML }'} <span className="keyword">from</span>{' '}
            <span className="string">'@ahtmljs/next'</span>;{'\n\n'}
            <span className="keyword">export default</span> <span className="at">withAHTML</span>({'{}'}, {'{'}
            {'\n'}
            {'  '}site: <span className="string">'https://shop.com'</span>,{'\n'}
            {'  '}policy: {'{ '}agents_welcome: <span className="number">true</span>
            {' }'},{'\n'}
            {'}'});
          </code>
        ),
      },
      {
        title: 'Add the route',
        meta: 'app/ahtml/[[...path]]/route.ts',
        code: (
          <code>
            <span className="keyword">import</span> {'{ createAHTMLRoute }'} <span className="keyword">from</span>
            {'\n'}
            {'  '}<span className="string">'@ahtmljs/next/handler'</span>;{'\n'}
            <span className="keyword">import</span> {'{ buildSnapshot }'} <span className="keyword">from</span>{'\n'}
            {'  '}<span className="string">'@/lib/ahtml'</span>;{'\n\n'}
            <span className="keyword">export const</span> {'{ GET, HEAD }'} ={'\n'}
            {'  '}<span className="at">createAHTMLRoute</span>(buildSnapshot);
          </code>
        ),
      },
    ],
  },
  {
    id: 'vite',
    pkg: '@ahtmljs/vite',
    role: 'emit',
    tagline: 'SvelteKit, SolidStart, Astro, Remix, vanilla Vite: same bytes.',
    forWho: 'Anything on the Vite 5+ dev/build pipeline.',
    endpoints: [
      { path: '/ahtml/*', note: 'same snapshot routes as the Next adapter' },
      { path: '/ahtml/mcp.json', note: 'MCP manifest with raw $ref stripped' },
      { path: '/ahtml/openapi.json', note: 'OpenAPI 3.1' },
      { path: '/.well-known/ahtml.json', note: 'site-wide discovery manifest' },
    ],
    steps: [
      {
        title: 'Install',
        meta: 'npm',
        code: (
          <code>
            npm install <span className="string">@ahtmljs/vite @ahtmljs/schema</span>
          </code>
        ),
      },
      {
        title: 'Register the plugin',
        meta: 'vite.config.ts',
        code: (
          <code>
            <span className="keyword">import</span> {'{ defineConfig }'} <span className="keyword">from</span>{' '}
            <span className="string">'vite'</span>;{'\n'}
            <span className="keyword">import</span> {'{ ahtml }'} <span className="keyword">from</span>{' '}
            <span className="string">'@ahtmljs/vite'</span>;{'\n\n'}
            <span className="keyword">export default</span> <span className="at">defineConfig</span>({'{'}
            {'\n'}
            {'  '}plugins: [<span className="at">ahtml</span>({'{'}
            {'\n'}
            {'    '}site: <span className="string">'https://shop.com'</span>,{'\n'}
            {'    '}build: buildSnapshot,{'\n'}
            {'  '}{'}'})],{'\n'}
            {'}'});
          </code>
        ),
      },
      {
        title: 'Define the snapshot fn',
        meta: 'src/ahtml.ts',
        code: (
          <code>
            <span className="keyword">import</span> {'{ snapshot }'} <span className="keyword">from</span>{' '}
            <span className="string">'@ahtmljs/schema'</span>;{'\n\n'}
            <span className="keyword">export async function</span> <span className="at">buildSnapshot</span>(url) {'{'}
            {'\n'}
            {'  '}<span className="keyword">return</span> <span className="at">snapshot</span>(url,{' '}
            <span className="string">'product_detail'</span>){'\n'}
            {'    '}.<span className="at">add</span>({'{ '}
            <span className="punct">/* entity */</span>
            {' }'}){'\n'}
            {'    '}.<span className="at">build</span>();{'\n'}
            {'}'}
          </code>
        ),
      },
    ],
  },
  {
    id: 'schema',
    pkg: '@ahtmljs/schema',
    role: 'author',
    tagline: 'The contract layer. Build, validate, lint, serialize, diff.',
    forWho: 'Any code that authors or inspects an AHTML snapshot. Direct dep of every other package.',
    steps: [
      {
        title: 'Install',
        meta: 'npm',
        code: (
          <code>
            npm install <span className="string">@ahtmljs/schema</span>
          </code>
        ),
      },
      {
        title: 'Build a snapshot',
        meta: 'lib/snapshot.ts',
        code: (
          <code>
            <span className="keyword">import</span> {'{ snapshot, toCompact, toJson }'}{' '}
            <span className="keyword">from</span> <span className="string">'@ahtmljs/schema'</span>;{'\n\n'}
            <span className="keyword">const</span> snap = <span className="at">snapshot</span>(url,{' '}
            <span className="string">'product_detail'</span>){'\n'}
            {'  '}.<span className="at">ttl</span>(<span className="number">300</span>){'\n'}
            {'  '}.<span className="at">add</span>({'{ '}id: <span className="string">'product:mbp'</span>,{' '}
            type: <span className="string">'product'</span>, ...{' }'}){'\n'}
            {'  '}.<span className="at">build</span>();
          </code>
        ),
      },
      {
        title: 'Validate + lint',
        meta: 'CI / pre-commit',
        code: (
          <code>
            <span className="keyword">import</span> {'{ validate, lint }'} <span className="keyword">from</span>{' '}
            <span className="string">'@ahtmljs/schema'</span>;{'\n\n'}
            <span className="at">validate</span>(snap);{'  '}
            <span className="comment">// throws on schema violation</span>
            {'\n'}
            <span className="keyword">for</span> (<span className="keyword">const</span> w{' '}
            <span className="keyword">of</span> <span className="at">lint</span>(snap)) {'{'}
            {'\n'}
            {'  '}console.<span className="at">warn</span>(`[$
            {'{'}w.rule{'}'}] $
            {'{'}w.message{'}'}`);{'\n'}
            {'}'}
          </code>
        ),
      },
    ],
  },
  {
    id: 'agent',
    pkg: '@ahtmljs/agent',
    role: 'consume',
    tagline: 'Client SDK for AI agents. Fetch, gate, dispatch.',
    forWho: 'Agents, scrapers, or automations that call AHTML-emitting sites.',
    steps: [
      {
        title: 'Install',
        meta: 'npm',
        code: (
          <code>
            npm install <span className="string">@ahtmljs/agent</span>
          </code>
        ),
      },
      {
        title: 'Instantiate the client',
        meta: 'agent.ts',
        code: (
          <code>
            <span className="keyword">import</span> {'{ AHTMLClient }'} <span className="keyword">from</span>{' '}
            <span className="string">'@ahtmljs/agent'</span>;{'\n\n'}
            <span className="keyword">const</span> client = <span className="keyword">new</span>{' '}
            <span className="at">AHTMLClient</span>({'{'}
            {'\n'}
            {'  '}origin: <span className="string">'https://shop.com'</span>,{'\n'}
            {'  '}bearer: process.env.<span className="number">TOKEN</span>,{'\n'}
            {'  '}tokenizer: <span className="string">'o200k_base'</span>,{'\n'}
            {'}'});
          </code>
        ),
      },
      {
        title: 'Fetch + run an action',
        meta: 'dry-run gates first',
        code: (
          <code>
            <span className="keyword">const</span> snap = <span className="keyword">await</span> client.
            <span className="at">fetch</span>(<span className="string">'/products/mbp-14-m3'</span>);{'\n\n'}
            <span className="keyword">await</span> client.<span className="at">runAction</span>(snap,{' '}
            <span className="string">'purchase'</span>, {'{'}
            {'\n'}
            {'  '}dryRun: <span className="number">true</span>,{'  '}
            <span className="comment">// safety gate</span>
            {'\n'}
            {'  '}confirm: <span className="at">askHuman</span>,{'\n'}
            {'}'});
          </code>
        ),
      },
    ],
  },
  {
    id: 'langchain',
    pkg: '@ahtmljs/langchain',
    role: 'ingest',
    tagline: 'LangChain.js document loader. URL → embeddings in 3 lines.',
    forWho: 'RAG pipelines and vector stores on @langchain/core 0.3+.',
    steps: [
      {
        title: 'Install',
        meta: 'npm',
        code: (
          <code>
            npm install <span className="string">@ahtmljs/langchain @langchain/core</span>
          </code>
        ),
      },
      {
        title: 'Load the page',
        meta: 'ingest.ts',
        code: (
          <code>
            <span className="keyword">import</span> {'{ AHTMLLoader }'} <span className="keyword">from</span>{' '}
            <span className="string">'@ahtmljs/langchain'</span>;{'\n\n'}
            <span className="keyword">const</span> loader = <span className="keyword">new</span>{' '}
            <span className="at">AHTMLLoader</span>({'\n'}
            {'  '}<span className="string">'https://rumour.example.com/article/x'</span>{'\n'}
            );{'\n'}
            <span className="keyword">const</span> docs = <span className="keyword">await</span> loader.
            <span className="at">load</span>();
          </code>
        ),
      },
      {
        title: 'Index with citations',
        meta: 'vector store',
        code: (
          <code>
            <span className="comment">// docs[].metadata carries chunk_id,</span>
            {'\n'}
            <span className="comment">// byte_range, source URL: citation-ready.</span>
            {'\n'}
            <span className="keyword">await</span> vectorStore.<span className="at">addDocuments</span>(docs);
          </code>
        ),
      },
    ],
  },
];

const VALID_IDS = new Set<Flow['id']>(['next', 'vite', 'schema', 'agent', 'langchain']);

function readHashFlow(): Flow['id'] | null {
  if (typeof window === 'undefined') return null;
  const h = window.location.hash.replace(/^#/, '');
  // Accept either `#quickstart-<id>` or `#qs-<id>` or the package's `#pkg-<id>` anchor.
  const match = h.match(/^(?:quickstart-|qs-|pkg-)?([a-z]+)$/);
  if (!match) return null;
  const id = match[1] as Flow['id'];
  return VALID_IDS.has(id) ? id : null;
}

export default function Quickstart() {
  const [active, setActive] = useState<Flow['id']>('next');
  const flow = FLOWS.find((f) => f.id === active)!;

  useEffect(() => {
    const apply = (scroll: boolean) => {
      const id = readHashFlow();
      if (!id) return;
      setActive(id);
      if (scroll) {
        const h = window.location.hash.replace(/^#/, '');
        // Only scroll for the prefixed forms — the bare `#pkg-<id>` anchor already
        // resolves to its own element in the Packages section, so leave that scroll alone.
        if (/^(?:quickstart-|qs-)/.test(h)) {
          document.getElementById('quickstart')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    };
    apply(false);
    const onHash = () => apply(true);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const selectTab = (id: Flow['id']) => {
    setActive(id);
    if (typeof window !== 'undefined' && window.history.replaceState) {
      window.history.replaceState(null, '', `#quickstart-${id}`);
    }
  };

  return (
    <section className="section" id="quickstart">
      <span id="install" aria-hidden="true" style={{ position: 'absolute' }} />
      <div className="container">
        <div className="kicker">Quickstart</div>
        <h2 style={{ marginTop: 12, marginBottom: 12 }}>Pick a package. Follow three steps.</h2>
        <p className="lede" style={{ marginBottom: 32 }}>
          Each package is additive. Your existing pages keep rendering, your existing
          API keeps running; agents get an extra lane on the same origin.
        </p>

        <div className="qs-tabs" role="tablist" aria-label="Choose a package">
          {FLOWS.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={active === f.id}
              type="button"
              className={`qs-tab${active === f.id ? ' is-active' : ''}`}
              onClick={() => selectTab(f.id)}
            >
              <span className="qs-tab-pkg">{f.pkg}</span>
              <span className="qs-tab-role">{f.role}</span>
            </button>
          ))}
        </div>

        <div className="qs-panel" role="tabpanel">
          <div className="qs-panel-head">
            <p className="qs-tagline">{flow.tagline}</p>
            <p className="qs-forwho">
              <strong>For:</strong> {flow.forWho}
            </p>
          </div>

          <div className="grid cols-3 qs-grid">
            {flow.steps.map((step, i) => (
              <div key={i} className="card qs-step">
                <div className="step">
                  Step {String(i + 1).padStart(2, '0')}
                  {step.meta ? <> · <span className="qs-meta">{step.meta}</span></> : null}
                </div>
                <h3>{step.title}</h3>
                <pre className="code-block" style={{ margin: '16px 0 0', fontSize: 12.5 }}>
                  {step.code}
                </pre>
              </div>
            ))}
          </div>

          {flow.endpoints && (
            <>
              <hr style={{ margin: '48px 0 24px' }} />
              <p
                style={{
                  color: 'var(--ink-3)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                  marginBottom: 8,
                }}
              >
                Your snapshot now serves at:
              </p>
              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: 0,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 14,
                  color: 'var(--ink-2)',
                  lineHeight: 1.9,
                }}
              >
                {flow.endpoints.map((e) => (
                  <li key={e.path}>
                    <code className="inline">{e.path}</code>: {e.note}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

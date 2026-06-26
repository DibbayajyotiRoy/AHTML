const ROLES = [
  {
    label: 'I run a site',
    sub: 'emit AHTML',
    target: '#pkg-next',
    hint: 'next / vite',
  },
  {
    label: 'I build an agent',
    sub: 'consume AHTML',
    target: '#pkg-agent',
    hint: 'agent',
  },
  {
    label: 'I do RAG',
    sub: 'ingest AHTML',
    target: '#pkg-langchain',
    hint: 'langchain',
  },
];

export default function Hero() {
  return (
    <section className="hero">
      <div className="container">
        <div className="eyebrow">v0.4.0 — May 2026 · MIT</div>
        <h1>
          The HTML of <em>the agent web</em>.
        </h1>
        <p className="lede">
          One snapshot — five machine surfaces. AHTML collapses MCP, OpenAPI 3.1,
          JSON-LD, <code className="hero-inline">llms.txt</code> and a token-optimal
          semantic snapshot into a single declarative artifact that lives next to
          your existing HTML. Browsers still see pixels. Agents see typed
          entities, typed actions, signable provenance.
        </p>

        <div className="hero-stack">
          <div className="hero-stack-row">
            <span className="hero-stack-num">5</span>
            <span className="hero-stack-label">
              packages under <code className="hero-inline">@ahtmljs/*</code>
            </span>
          </div>
          <div className="hero-stack-row">
            <span className="hero-stack-num">1</span>
            <span className="hero-stack-label">
              shared schema · server adapters · agent + RAG clients
            </span>
          </div>
          <div className="hero-stack-row">
            <span className="hero-stack-num">0</span>
            <span className="hero-stack-label">
              migration — your existing pages, routes, and APIs are untouched
            </span>
          </div>
        </div>

        <div className="hero-roles" role="navigation" aria-label="Pick your starting point">
          <div className="hero-roles-label">Pick your starting point →</div>
          <div className="hero-roles-grid">
            {ROLES.map((r) => (
              <a key={r.label} href={r.target} className="hero-role">
                <span className="hero-role-label">{r.label}</span>
                <span className="hero-role-sub">{r.sub}</span>
                <span className="hero-role-hint">
                  <code>@ahtmljs/{r.hint}</code>
                </span>
              </a>
            ))}
          </div>
        </div>

        <div className="hero-cta">
          <a className="btn btn-primary" href="#packages">
            <span>Browse the 9 packages</span>
            <span className="btn-arrow" aria-hidden>→</span>
          </a>
          <a className="btn btn-secondary" href="#quickstart">
            Quickstart flows
          </a>
          <a className="btn btn-secondary" href="/tools/agent-readiness">
            Score your site <span className="muted">— free</span>
          </a>
          <div className="hero-cta-tertiary">
            <a href="#benchmark">See the benchmark</a>
            <span aria-hidden> · </span>
            <a href="/ahtml" className="mono">View this page&apos;s AHTML →</a>
          </div>
        </div>
      </div>
    </section>
  );
}

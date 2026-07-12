const ROLES = [
  {
    label: 'I run a site',
    sub: 'publish AHTML',
    target: '#quickstart',
    hint: 'npx @ahtmljs/cli init',
  },
  {
    label: 'I build an agent',
    sub: 'consume any site',
    target: '#pkg-agent',
    hint: 'npm i @ahtmljs/agent',
  },
  {
    label: 'I work in Python',
    sub: 'same client, PyPI',
    target: '#pkg-agent',
    hint: 'pip install ahtml',
  },
  {
    label: 'I do RAG',
    sub: 'cite pages, not scrapes',
    target: '#pkg-langchain',
    hint: 'npm i @ahtmljs/langchain',
  },
];

/**
 * The artifact panel shows this page's OWN compact snapshot (abridged):
 * a real product output, served live at /ahtml, not a mocked screenshot.
 */
const SNAPSHOT_LINES = [
  ['@ahtml', ' 0.1'],
  ['@url', ' https://ahtml.dev/'],
  ['@page_type', ' home'],
  ['@ttl', ' 300'],
  ['', ''],
  ['@policy', ''],
  ['', '  agents_welcome: yes'],
  ['', '  license: MIT'],
  ['', ''],
  ['[document:why-ahtml]', ''],
  ['', '  title: The HTML of the agent web'],
  ['', '  summary: 5.6x fewer tokens, 91% to 100% accuracy'],
  ['', ''],
  ['(action) score_site', ''],
  ['', '  category: read'],
  ['', '  cost: free'],
] as const;

export default function Hero() {
  return (
    <>
      <section className="hero">
        <div className="container wide">
          <div className="hero-grid">
            <div>
              <h1 className="rise rise-1">
                The HTML of <em>the agent web.</em>
              </h1>
              <p className="lede rise rise-2">
                One typed snapshot per page. Agents get MCP, OpenAPI, llms.txt,
                and safe priced actions. Browsers keep your HTML.
              </p>
              <div className="hero-cta rise rise-3">
                <a className="btn btn-primary" href="#quickstart">
                  <span>Get started</span>
                  <span className="btn-arrow" aria-hidden>
                    →
                  </span>
                </a>
                <a className="btn btn-secondary" href="/tools/agent-readiness">
                  Score your site
                </a>
              </div>
            </div>
            <div className="hero-artifact rise rise-4" aria-label="This page's live AHTML snapshot, abridged">
              <div className="hero-artifact-bar">
                <span>GET /ahtml</span>
                <a href="/ahtml">live →</a>
              </div>
              <pre>
                {SNAPSHOT_LINES.map(([key, rest], i) => (
                  <span key={i}>
                    {key ? <span className="tok-key">{key}</span> : null}
                    <span className={key ? undefined : 'tok-dim'}>{rest}</span>
                    {'\n'}
                  </span>
                ))}
              </pre>
            </div>
          </div>
        </div>
      </section>

      <section className="section tight" style={{ borderTop: '1px solid var(--rule)' }}>
        <div className="container wide">
          <div className="hero-roles" role="navigation" aria-label="Pick your starting point">
            <div className="hero-roles-grid">
              {ROLES.map((r) => (
                <a key={r.label} href={r.target} className="hero-role">
                  <span className="hero-role-label">{r.label}</span>
                  <span className="hero-role-sub">{r.sub}</span>
                  <span className="hero-role-hint">
                    <code>{r.hint}</code>
                  </span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

const colHead: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  marginBottom: 14,
};
const colList: React.CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
  lineHeight: 2,
  fontSize: 14,
};

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="grid cols-4">
          <div>
            <div className="mark">ahtml</div>
            <p style={{ marginTop: 12, fontSize: 14, opacity: 0.75 }}>The HTML of the agent web.</p>
            <p style={{ marginTop: 12, fontSize: 13, opacity: 0.6 }}>
              <a href="/about">About</a> · <a href="/contact">Contact</a> · <a href="/privacy">Privacy</a> · <a href="/security">Security</a>
            </p>
          </div>

          <div>
            <h4 style={colHead}>Product</h4>
            <ul style={colList}>
              <li><a href="/#install">Install</a></li>
              <li><a href="/#benchmark">Benchmark</a></li>
              <li><a href="/#demo">Live demo</a></li>
              <li><a href="/tools/agent-readiness">Score your site</a></li>
              <li><a href="/spec">Spec (stable, 1.x)</a></li>
            </ul>
          </div>

          <div>
            <h4 style={colHead}>Integrations</h4>
            <ul style={colList}>
              <li><a href="/integrations/next">Next.js</a></li>
              <li><a href="/integrations/vite">Vite</a></li>
              <li><a href="/integrations/sveltekit">SvelteKit</a></li>
              <li><a href="/integrations/astro">Astro</a></li>
              <li><a href="/integrations/hono">Hono</a></li>
              <li><a href="/integrations">Python SDK</a></li>
              <li><a href="/integrations/remix">Remix / RR7</a></li>
            </ul>
            <h4 style={{ ...colHead, marginTop: 24 }}>Compare</h4>
            <ul style={colList}>
              <li><a href="/vs/llms-txt">vs llms.txt</a></li>
              <li><a href="/vs/firecrawl">vs Firecrawl</a></li>
              <li><a href="/vs/schema-org">vs schema.org</a></li>
            </ul>
          </div>

          <div>
            <h4 style={colHead}>Agent endpoints</h4>
            <ul style={{ ...colList, fontFamily: 'var(--font-mono)' }}>
              <li><a href="/.well-known/ahtml.json">/.well-known/ahtml.json</a></li>
              <li><a href="/ahtml">/ahtml</a></li>
              <li><a href="/ahtml/mcp.json">/ahtml/mcp.json</a></li>
              <li><a href="/ahtml/openapi.json">/ahtml/openapi.json</a></li>
              <li><a href="/llms.txt">/llms.txt</a></li>
            </ul>
            <h4 style={{ ...colHead, marginTop: 24 }}>Project</h4>
            <ul style={colList}>
              <li><a href="https://github.com/DibbayajyotiRoy/AHTML" rel="noopener noreferrer">GitHub</a></li>
              <li><a href="https://github.com/DibbayajyotiRoy/AHTML/blob/main/PLAN.md" rel="noopener noreferrer">Roadmap</a></li>
              <li><a href="https://github.com/DibbayajyotiRoy/AHTML/blob/main/CHANGELOG.md" rel="noopener noreferrer">Changelog</a></li>
            </ul>
          </div>
        </div>
        <div className="colophon">
          © 2026 AHTML. MIT licensed. This page emits AHTML. Open the inspector or curl with{' '}
          <code style={{ color: 'inherit', background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: 3 }}>
            Accept: application/ahtml+text
          </code>.
        </div>
      </div>
    </footer>
  );
}

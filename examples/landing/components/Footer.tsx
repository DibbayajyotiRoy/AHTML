export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="grid cols-4">
          <div>
            <div className="mark">ahtml</div>
            <p style={{ marginTop: 12, fontSize: 14, opacity: 0.75 }}>The HTML of the agent web.</p>
          </div>
          <div>
            <h4 style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14 }}>
              Project
            </h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, lineHeight: 2, fontSize: 14 }}>
              <li><a href="/spec">v0.1 spec</a></li>
              <li><a href="https://github.com/DibbayajyotiRoy/AHTML">GitHub</a></li>
              <li><a href="https://github.com/DibbayajyotiRoy/AHTML/blob/main/PLAN.md">Roadmap</a></li>
              <li><a href="https://github.com/DibbayajyotiRoy/AHTML/blob/main/LANGUAGE.md">.ahtml syntax (preview)</a></li>
            </ul>
          </div>
          <div>
            <h4 style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14 }}>
              Agent endpoints
            </h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, lineHeight: 2, fontSize: 14, fontFamily: 'var(--font-mono)' }}>
              <li><a href="/.well-known/ahtml.json">/.well-known/ahtml.json</a></li>
              <li><a href="/ahtml">/ahtml</a></li>
              <li><a href="/ahtml/mcp.json">/ahtml/mcp.json</a></li>
              <li><a href="/ahtml/openapi.json">/ahtml/openapi.json</a></li>
              <li><a href="/llms.txt">/llms.txt</a></li>
            </ul>
          </div>
          <div>
            <h4 style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14 }}>
              Adjacent
            </h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, lineHeight: 2, fontSize: 14 }}>
              <li><a href="https://modelcontextprotocol.io">Model Context Protocol</a></li>
              <li><a href="https://llmstxt.org">llms.txt</a></li>
              <li><a href="https://schema.org">schema.org</a></li>
              <li><a href="https://spec.openapis.org">OpenAPI</a></li>
            </ul>
          </div>
        </div>
        <div className="colophon">
          © 2026 AHTML. MIT licensed. This page emits AHTML — open the inspector or curl with{' '}
          <code style={{ color: 'inherit', background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: 3 }}>
            Accept: application/ahtml+text
          </code>.
        </div>
      </div>
    </footer>
  );
}

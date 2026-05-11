export default function Install() {
  return (
    <section className="section" id="install">
      <div className="container">
        <div className="kicker">Install</div>
        <h2 style={{ marginTop: 12, marginBottom: 12 }}>Three minutes. Three files.</h2>
        <p className="lede" style={{ marginBottom: 40 }}>
          The plugin is additive. Your existing pages keep rendering. Your existing
          API keeps running. Agents just get an extra lane.
        </p>

        <div className="grid cols-3">
          <div className="card">
            <div className="step">Step 01</div>
            <h3>Install</h3>
            <pre className="code-block" style={{ margin: '16px 0 0', fontSize: 13 }}><code>npm install <span className="string">@ahtml/next</span></code></pre>
          </div>
          <div className="card">
            <div className="step">Step 02</div>
            <h3>Wrap next.config</h3>
            <pre className="code-block" style={{ margin: '16px 0 0', fontSize: 12.5 }}>
              <code>
                <span className="keyword">import</span> {'{ withAHTML }'} <span className="keyword">from</span> <span className="string">'@ahtml/next'</span>;{'\n\n'}
                <span className="keyword">export default</span> <span className="at">withAHTML</span>({'{}'}, {'{'}{'\n'}
                {'  '}site: <span className="string">'https://shop.com'</span>,{'\n'}
                {'  '}policy: {'{ '}agents_welcome: <span className="number">true</span> {'}'},{'\n'}
                {'}'});
              </code>
            </pre>
          </div>
          <div className="card">
            <div className="step">Step 03</div>
            <h3>Add the route</h3>
            <pre className="code-block" style={{ margin: '16px 0 0', fontSize: 12.5 }}>
              <code>
                <span className="comment">// app/ahtml/[[...path]]/route.ts</span>{'\n'}
                <span className="keyword">import</span> {'{ createAHTMLRoute }'} <span className="keyword">from</span>{'\n'}
                {'  '}<span className="string">'@ahtml/next/handler'</span>;{'\n'}
                <span className="keyword">import</span> {'{ buildSnapshot }'} <span className="keyword">from</span>{'\n'}
                {'  '}<span className="string">'@/lib/ahtml'</span>;{'\n\n'}
                <span className="keyword">export const</span> {'{ GET, HEAD }'} = {'\n'}
                {'  '}<span className="at">createAHTMLRoute</span>(buildSnapshot);
              </code>
            </pre>
          </div>
        </div>

        <hr style={{ margin: '48px 0 32px' }} />

        <p style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
          Your snapshot now serves at:
        </p>
        <ul style={{ listStyle: 'none', padding: 0, fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--ink-2)' }}>
          <li><code className="inline">/ahtml/*</code> — typed snapshot per route (compact text or JSON via <code className="inline">Accept</code>)</li>
          <li><code className="inline">/ahtml/mcp.json</code> — auto-generated MCP tools manifest</li>
          <li><code className="inline">/ahtml/openapi.json</code> — auto-generated OpenAPI 3.1</li>
          <li><code className="inline">/.well-known/ahtml.json</code> — site-wide discovery</li>
          <li><code className="inline">/llms.txt</code> — compatibility shim</li>
        </ul>
      </div>
    </section>
  );
}

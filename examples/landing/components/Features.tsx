const FEATURES = [
  { title: 'MCP, emitted', body: 'Your snapshot\'s actions become MCP tool definitions at /ahtml/mcp.json. No separate MCP server.' },
  { title: 'OpenAPI, emitted', body: 'Actions with execute_url become full OpenAPI 3.1 operations. Codegen-ready.' },
  { title: 'JSON-LD, ingested', body: 'Existing schema.org blocks become a Level-0 snapshot with zero developer work.' },
  { title: 'llms.txt, shimmed', body: 'Auto-emit a clean llms.txt from registered routes. Free interop with Cursor / Continue / Cline.' },
  { title: 'ETag + diff', body: 'Conditional GET via If-None-Match. ?since=<etag> returns just the change list.' },
  { title: 'Content negotiation', body: 'Compact text for LLMs by default. Canonical JSON for signing and programmatic clients.' },
  { title: 'Typed actions', body: 'Every action carries auth, cost, reversibility, side effects, and confirmation level.' },
  { title: 'Policy enforcement', body: 'Token-bucket rate limit at the edge. Sites stay in control of what agents can do.' },
  { title: 'Provenance', body: 'Detached JWS over canonical JSON, verified against a did:web identity. Agents detect tampering.' },
  { title: 'Verified agents', body: 'RFC 9421 signed requests. Sites know which agent is calling; imposters fail verification.' },
  { title: 'Dry-run sandbox', body: 'SPEC §4.7: agents rehearse an action before it mutates or charges. Simulated responses never touch real state.' },
  { title: 'Agent insights', body: 'Traffic analytics for publishers: which agents read you, in which format, with a tested zero-PII guarantee.' },
];

export default function Features() {
  return (
    <section className="section">
      <div className="container">
        <div className="kicker">What you get</div>
        <h2 style={{ marginTop: 12, marginBottom: 40 }}>One config. Every protocol.</h2>
        <div className="grid cols-3">
          {FEATURES.map((f, i) => (
            <div key={i} className="card">
              <div className="step">{String(i + 1).padStart(2, '0')}</div>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

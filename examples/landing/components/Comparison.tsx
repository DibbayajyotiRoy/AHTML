const ROWS = [
  ['Token efficiency for agents', 'baseline', 'good', 'best', 'good'],
  ['Typed entities', 'implicit', 'text only', '✓', '✓'],
  ['Typed actions', 'implicit', 'text only', '✓', '✓'],
  ['Cost / reversibility', '—', '—', '✓', '✓'],
  ['Side-effect declarations', '—', '—', '✓', '✓'],
  ['Site-wide policy', '—', 'partial', '✓', '✓'],
  ['Freshness / TTL', '—', '—', '✓', '✓'],
  ['Conditional fetch (ETag)', 'partial', '—', '✓', '✓'],
  ['Pagination semantics', '—', '—', '✓', '✓'],
  ['MCP-emittable', '—', '—', '✓', '✓'],
  ['OpenAPI-emittable', '—', '—', '✓', '✓'],
  ['Cryptographically signable', '—', '—', 'digest', '✓'],
];

export default function Comparison() {
  return (
    <section className="section">
      <div className="container">
        <div className="kicker">Where AHTML fits</div>
        <h2 style={{ marginTop: 12, marginBottom: 12 }}>
          Above llms.txt. Below MCP. Beside schema.org.
        </h2>
        <p className="lede" style={{ marginBottom: 32 }}>
          We're not a competitor to any of them. AHTML compiles <em>to</em>{' '}
          MCP, OpenAPI, JSON-LD, and llms.txt — and ingests from schema.org as
          a free Level-0 source.
        </p>
        <table className="bench-table">
          <thead>
            <tr>
              <th></th>
              <th>HTML</th>
              <th>llms.txt</th>
              <th>AHTML compact</th>
              <th>AHTML JSON</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r, i) => (
              <tr key={i}>
                <td>{r[0]}</td>
                <td>{r[1]}</td>
                <td>{r[2]}</td>
                <td>{r[3]}</td>
                <td>{r[4]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

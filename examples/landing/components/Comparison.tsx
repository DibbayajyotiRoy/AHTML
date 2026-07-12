const ROWS = [
  ['Token efficiency for agents', 'baseline', 'good', 'best', 'good'],
  ['Typed entities', 'implicit', 'text only', '✓', '✓'],
  ['Typed actions', 'implicit', 'text only', '✓', '✓'],
  ['Cost / reversibility', '✕', '✕', '✓', '✓'],
  ['Side-effect declarations', '✕', '✕', '✓', '✓'],
  ['Site-wide policy', '✕', 'partial', '✓', '✓'],
  ['Freshness / TTL', '✕', '✕', '✓', '✓'],
  ['Conditional fetch (ETag)', 'partial', '✕', '✓', '✓'],
  ['Pagination semantics', '✕', '✕', '✓', '✓'],
  ['MCP-emittable', '✕', '✕', '✓', '✓'],
  ['OpenAPI-emittable', '✕', '✕', '✓', '✓'],
  ['Cryptographically signable', '✕', '✕', 'digest', '✓'],
] as const;

const FORMAT_LABELS = ['HTML', 'llms.txt', 'AHTML compact', 'AHTML JSON'] as const;

function isWinValue(v: string) {
  return v === '✓' || v === 'best' || v === 'digest';
}
function isMissValue(v: string) {
  return v === '✕';
}

export default function Comparison() {
  return (
    <section className="section">
      <div className="container">
        <div className="kicker">Where AHTML fits</div>
        <h2 style={{ marginTop: 12, marginBottom: 12 }}>
          Above llms.txt. Below MCP. Beside schema.org.
        </h2>
        <p className="lede" style={{ marginBottom: 32 }}>
          We&apos;re not a competitor to any of them. AHTML compiles <em>to</em>{' '}
          MCP, OpenAPI, JSON-LD, and llms.txt, and ingests from schema.org as
          a free Level-0 source.
        </p>

        {/* Desktop: table */}
        <table className="bench-table desktop-only">
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

        {/* Mobile: feature-cards with quad cells */}
        <div className="mobile-comparison mobile-only" role="list" aria-label="Format comparison by feature">
          {ROWS.map((row, i) => {
            const feature = row[0];
            const values = [row[1], row[2], row[3], row[4]] as const;
            return (
              <div key={i} className="mc-row" role="listitem">
                <div className="mc-feature">{feature}</div>
                <div className="mc-cells">
                  {values.map((v, j) => {
                    const isOurs = j >= 2;
                    const win = isWinValue(v);
                    const miss = isMissValue(v);
                    return (
                      <div
                        key={j}
                        className={`mc-cell ${isOurs ? 'ours' : ''} ${win && isOurs ? 'win' : ''} ${miss ? 'miss' : ''}`}
                      >
                        <div className="mc-cell-label">{FORMAT_LABELS[j]}</div>
                        <div className="mc-cell-value">{v}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <p className="mc-legend">
            <span className="mc-legend-swatch ours" /> = AHTML
          </p>
        </div>
      </div>
    </section>
  );
}

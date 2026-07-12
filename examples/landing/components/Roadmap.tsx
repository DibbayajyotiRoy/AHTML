const SERIES = [
  {
    id: '1.1',
    name: 'Reach the other half',
    state: 'shipped',
    body: 'Python SDK on PyPI with byte-identical parsing, the extractor plugin API, and native Astro + SvelteKit adapters.',
  },
  {
    id: '1.2',
    name: 'Ten-minute adoption',
    state: 'shipped',
    body: 'ahtml init scaffolds any supported framework; the score badge and agent-traffic insights reward publishing.',
  },
  {
    id: '1.3',
    name: 'Protocol, certified',
    state: 'shipped',
    body: 'A language-agnostic conformance corpus with signed attestations, and the AHTML Index so agents can find adopters.',
  },
  {
    id: '1.4',
    name: 'Safe to transact',
    state: 'shipped',
    body: 'The dry-run sandbox: agents rehearse priced, irreversible actions and see signed predicted costs before money moves.',
  },
];

export default function Roadmap() {
  return (
    <section className="section">
      <div className="container">
        <div className="kicker">Roadmap</div>
        <h2 style={{ marginTop: 12, marginBottom: 40 }}>Where this went, and goes.</h2>
        <div className="grid cols-2">
          {SERIES.map((p) => (
            <div key={p.id} className="card">
              <div className="step">
                {p.id} · {p.state}
              </div>
              <h3>{p.name}</h3>
              <p>{p.body}</p>
            </div>
          ))}
        </div>
        <p className="legalish" style={{ marginTop: 32 }}>
          The full post-1.0 plan, with acceptance criteria mapped to CI tests, lives in{' '}
          <a
            href="https://github.com/DibbayajyotiRoy/AHTML/blob/main/ROADMAP.md"
            style={{ color: 'inherit', borderBottomColor: 'var(--rule)' }}
          >
            ROADMAP.md
          </a>
          .
        </p>
      </div>
    </section>
  );
}

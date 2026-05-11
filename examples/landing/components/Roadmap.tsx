const PHASES = [
  { id: 'P0', name: 'Phase 0 — Prototype', state: 'shipping now', body: 'TypeScript schema + Next.js plugin + agent SDK + benchmark. The artifact you are looking at.' },
  { id: 'P1', name: 'Phase 1 — Rust core', state: 'months 4–9', body: 'Port parser, validator, serializer, signer, and LSP to Rust via napi-rs and wasm-bindgen. 10×+ faster internals; same npm API.' },
  { id: 'P2', name: 'Phase 2 — .ahtml language', state: 'months 6–12', body: 'Real .ahtml files. Chumsky parser. Tower-LSP server. Tree-sitter grammar. VS Code extension. Neovim + Helix + Zed via tree-sitter.' },
  { id: 'P3', name: 'Phase 3 — Ecosystem & SaaS', state: 'months 10–18', body: 'Component compilers (React / Solid / Svelte). Signed snapshots. Streaming + diff subscriptions. Hosted snapshot CDN with edge cache + agent-readiness scoring.' },
];

export default function Roadmap() {
  return (
    <section className="section">
      <div className="container">
        <div className="kicker">Roadmap</div>
        <h2 style={{ marginTop: 12, marginBottom: 40 }}>Where this goes.</h2>
        <div className="grid cols-2">
          {PHASES.map((p) => (
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
          Full plan with risk register, prior art, and tech selections in{' '}
          <a href="https://github.com/ahtml/ahtml/blob/main/PLAN.md" style={{ color: 'inherit', borderBottomColor: 'var(--rule)' }}>
            PLAN.md
          </a>.
        </p>
      </div>
    </section>
  );
}

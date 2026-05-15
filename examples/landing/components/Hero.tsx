import CopyableInstall from './CopyableInstall';

export default function Hero() {
  return (
    <section className="hero">
      <div className="container">
        <div className="eyebrow">v0.1 — May 2026</div>
        <h1>
          The HTML of <em>the agent web</em>.
        </h1>
        <p className="lede">
          Write your page once. AHTML emits MCP, OpenAPI, JSON-LD, llms.txt, and a
          dramatically smaller semantic snapshot — from your existing Next.js,
          Vite, or SvelteKit app. Zero migration. Browsers see the same HTML they
          always have. Agents see typed entities, typed actions, signed provenance.
        </p>
        <CopyableInstall />
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <a className="btn" href="#install">Install in 3 minutes</a>
          <a className="btn ghost" href="/tools/agent-readiness">Score your site (free)</a>
          <a className="btn ghost" href="#benchmark">See the benchmark</a>
          <a className="btn ghost" href="/ahtml" style={{ fontFamily: 'var(--font-mono)' }}>
            View this page&apos;s AHTML →
          </a>
        </div>
      </div>
    </section>
  );
}

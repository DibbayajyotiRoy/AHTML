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
        <div className="hero-cta">
          <a className="btn btn-primary" href="#install">
            <span>Install in 3 minutes</span>
            <span className="btn-arrow" aria-hidden>→</span>
          </a>
          <a className="btn btn-secondary" href="/tools/agent-readiness">
            Score your site <span className="muted">— free</span>
          </a>
          <div className="hero-cta-tertiary">
            <a href="#benchmark">See the benchmark</a>
            <span aria-hidden> · </span>
            <a href="/ahtml" className="mono">View this page&apos;s AHTML →</a>
          </div>
        </div>
      </div>
    </section>
  );
}

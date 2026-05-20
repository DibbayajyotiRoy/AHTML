export default function Header() {
  return (
    <header className="site-header">
      <div className="container">
        <a href="/" className="brand">ahtml</a>
        <nav>
          <a href="/#packages" className="secondary">Packages</a>
          <a href="/#quickstart" className="secondary">Quickstart</a>
          <a href="/#benchmark" className="secondary">Benchmark</a>
          <a href="/integrations/next" className="secondary">Integrations</a>
          <a href="/vs/llms-txt" className="secondary">Compare</a>
          <a href="/tools/agent-readiness">Score your site</a>
          <a href="https://github.com/DibbayajyotiRoy/AHTML" rel="noreferrer noopener">GitHub →</a>
        </nav>
      </div>
    </header>
  );
}

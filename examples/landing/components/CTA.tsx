import CopyableInstall from './CopyableInstall';

export default function CTA() {
  return (
    <section className="section tall" style={{ borderTop: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)' }}>
      <div className="container" style={{ textAlign: 'center' }}>
        <div className="kicker">Ship it</div>
        <h2 style={{ marginTop: 12, marginBottom: 24, maxWidth: '14ch', margin: '12px auto 24px' }}>
          Your next visitor might be Claude.
        </h2>
        <p className="lede" style={{ margin: '0 auto 40px', textAlign: 'center' }}>
          Three files. Three minutes. Your existing app speaks the agent web.
        </p>
        <div style={{ display: 'inline-block' }}>
          <CopyableInstall />
        </div>
        <div style={{ marginTop: 24, display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <a className="btn ghost" href="/tools/agent-readiness">Score your site first</a>
          <a className="btn ghost" href="/vs/llms-txt">Compare to llms.txt</a>
          <a className="btn ghost" href="/integrations/next">Next.js guide</a>
        </div>
        <div style={{ marginTop: 16, fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-3)' }}>
          MIT licensed · zero migration · v0.1 May 2026
        </div>
      </div>
    </section>
  );
}

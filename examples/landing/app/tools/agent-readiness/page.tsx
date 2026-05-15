import type { Metadata } from 'next';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ScoreForm from './ScoreForm';

export const metadata: Metadata = {
  title: 'AI Agent Readiness — score any site, free',
  description:
    'Paste a URL and see how ready your site is for AI agents: MCP, llms.txt, JSON-LD, sitemap, AI crawler policy, and more. Instant grade A–F. Free, no signup.',
  alternates: { canonical: '/tools/agent-readiness' },
  openGraph: {
    title: 'AI Agent Readiness — score any site, free',
    description: 'Paste a URL. Get a grade A–F across 10 checks. No signup.',
    type: 'website',
  },
};

export default function AgentReadinessPage() {
  return (
    <>
      <Header />
      <main>
        <section className="section tall">
          <div className="container" style={{ maxWidth: '64ch' }}>
            <div className="eyebrow">Free tool · no signup</div>
            <h1 style={{ fontSize: 'clamp(40px, 6vw, 80px)' }}>
              How <em>agent-ready</em> is your site?
            </h1>
            <p className="lede" style={{ marginTop: 32 }}>
              Paste a URL. We&apos;ll check 10 things AI agents and AI Overview look
              for — MCP descriptor, llms.txt, JSON-LD, sitemap, crawler policy
              — and give you a grade A–F with the exact fix for anything red.
            </p>
            <ScoreForm />
          </div>
        </section>

        <section className="section" style={{ borderTop: '1px solid var(--rule)' }}>
          <div className="container" style={{ maxWidth: '64ch' }}>
            <div className="kicker">What we check</div>
            <h2 style={{ marginTop: 12, marginBottom: 24 }}>Ten signals, weighted by impact.</h2>
            <ul style={{ paddingLeft: 24, lineHeight: 1.8 }}>
              <li><strong>AHTML manifest</strong> at <code>/.well-known/ahtml.json</code> — single trusted entry agents discover first</li>
              <li><strong>MCP descriptor</strong> at <code>/ahtml/mcp.json</code> — lets Claude, ChatGPT et al. connect</li>
              <li><strong>llms.txt</strong> — curated index for LLM crawlers</li>
              <li><strong>JSON-LD schema</strong> — typed entities for SERP and AI Overview</li>
              <li><strong>Open Graph tags</strong> — social previews + many AI crawlers read these</li>
              <li><strong>Canonical link</strong> — concentrates ranking signal</li>
              <li><strong>Meta description</strong> — SERP snippet quality</li>
              <li><strong>sitemap.xml</strong> — fast indexation in Google Search Console</li>
              <li><strong>robots.txt AI policy</strong> — explicit allow for GPTBot, ClaudeBot, PerplexityBot, Google-Extended</li>
              <li><strong>Page fetch health</strong> — 2xx, sane content size, parseable HTML</li>
            </ul>
          </div>
        </section>

        <section className="section" style={{ borderTop: '1px solid var(--rule)' }}>
          <div className="container" style={{ maxWidth: '64ch' }}>
            <div className="kicker">What this tool is not</div>
            <ul style={{ paddingLeft: 24, lineHeight: 1.7 }}>
              <li>It is not a full SEO audit — it covers the 10 agent-readiness signals only.</li>
              <li>It is not a Lighthouse / Core Web Vitals replacement — use{' '}
                <a href="https://pagespeed.web.dev" rel="noopener noreferrer">PageSpeed Insights</a>{' '}
                for performance.</li>
              <li>It does not store URLs or results. Each run is stateless.</li>
            </ul>
          </div>
        </section>

        <section className="section tall" style={{ borderTop: '1px solid var(--rule)', textAlign: 'center' }}>
          <div className="container">
            <h2 style={{ maxWidth: '22ch', margin: '0 auto 24px' }}>
              Got a low score? Install AHTML and most checks flip green automatically.
            </h2>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
              <a className="btn" href="/#install">Install AHTML</a>
              <a className="btn ghost" href="/integrations/next">Next.js guide</a>
              <a className="btn ghost" href="/vs/llms-txt">vs llms.txt</a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

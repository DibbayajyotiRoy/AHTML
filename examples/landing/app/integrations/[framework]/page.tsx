import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { INTEGRATIONS, INTEGRATION_SLUGS } from '@/lib/integrations';

type Params = { params: Promise<{ framework: string }> };

export function generateStaticParams() {
  return INTEGRATION_SLUGS.map((framework) => ({ framework }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { framework } = await params;
  const integration = INTEGRATIONS[framework];
  if (!integration) return {};
  return {
    title: integration.title,
    description: integration.description,
    alternates: { canonical: `/integrations/${framework}` },
    openGraph: { title: integration.title, description: integration.description, type: 'article' },
  };
}

export default async function IntegrationPage({ params }: Params) {
  const { framework } = await params;
  const i = INTEGRATIONS[framework];
  if (!i) notFound();

  const howToJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: `Install AHTML in ${i.framework}`,
    description: i.description,
    totalTime: 'PT3M',
    step: [
      { '@type': 'HowToStep', name: 'Install', text: i.install },
      { '@type': 'HowToStep', name: 'Configure', text: 'Wire the manifest, snapshot, and llms.txt routes (see code).' },
      { '@type': 'HowToStep', name: 'Verify', text: 'curl your-site.com/ahtml and your-site.com/llms.txt' },
    ],
  };

  return (
    <>
      <Header />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(howToJsonLd) }} />
      <main>
        <section className="section tall">
          <div className="container" style={{ maxWidth: '64ch' }}>
            <div className="eyebrow">
              Integration · {i.framework}
              {i.status === 'roadmap' && <span style={{ marginLeft: 12, color: 'var(--accent)' }}>roadmap</span>}
            </div>
            <h1 style={{ fontSize: 'clamp(40px, 6vw, 80px)' }}>{i.title}</h1>
            <p className="lede" style={{ marginTop: 32 }}>{i.description}</p>
          </div>
        </section>

        <section className="section" style={{ borderTop: '1px solid var(--rule)' }}>
          <div className="container" style={{ maxWidth: '64ch' }}>
            <div className="kicker">Step 1 · Install</div>
            <pre style={{
              background: 'var(--code-bg)',
              color: 'var(--code-fg)',
              padding: 20,
              borderRadius: 6,
              overflow: 'auto',
              marginTop: 16,
              fontFamily: 'var(--font-mono)',
              fontSize: 14,
            }}>
              <code>{i.install}</code>
            </pre>
          </div>
        </section>

        <section className="section" style={{ borderTop: '1px solid var(--rule)' }}>
          <div className="container" style={{ maxWidth: '64ch' }}>
            <div className="kicker">Step 2 · Wire it up</div>
            <pre style={{
              background: 'var(--code-bg)',
              color: 'var(--code-fg)',
              padding: 20,
              borderRadius: 6,
              overflow: 'auto',
              marginTop: 16,
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              lineHeight: 1.6,
            }}>
              <code>{i.setup}</code>
            </pre>
          </div>
        </section>

        <section className="section" style={{ borderTop: '1px solid var(--rule)' }}>
          <div className="container" style={{ maxWidth: '64ch' }}>
            <div className="kicker">Step 3 · Verify</div>
            <p style={{ marginTop: 16 }}>Deploy. Then:</p>
            <pre style={{
              background: 'var(--code-bg)',
              color: 'var(--code-fg)',
              padding: 20,
              borderRadius: 6,
              marginTop: 16,
              fontFamily: 'var(--font-mono)',
              fontSize: 14,
            }}>
              <code>{`curl https://your-site.com/.well-known/ahtml.json
curl https://your-site.com/ahtml
curl https://your-site.com/llms.txt`}</code>
            </pre>
          </div>
        </section>

        <section className="section" style={{ borderTop: '1px solid var(--rule)' }}>
          <div className="container" style={{ maxWidth: '64ch' }}>
            <div className="kicker">Notes for {i.framework}</div>
            <ul style={{ paddingLeft: 24, lineHeight: 1.7, marginTop: 16 }}>
              {i.notes.map((n, idx) => <li key={idx}>{n}</li>)}
            </ul>
          </div>
        </section>

        <section className="section tall" style={{ borderTop: '1px solid var(--rule)', textAlign: 'center' }}>
          <div className="container">
            <h2 style={{ maxWidth: '20ch', margin: '0 auto 24px' }}>Three files. Three minutes.</h2>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
              <a className="btn" href={`https://www.npmjs.com/package/${i.pkg}`} rel="noopener noreferrer">
                npm: {i.pkg}
              </a>
              <a className="btn ghost" href="https://github.com/DibbayajyotiRoy/AHTML" rel="noopener noreferrer">GitHub</a>
              <a className="btn ghost" href="/tools/agent-readiness">Score your site</a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { COMPARISONS, COMPARISON_SLUGS } from '@/lib/comparisons';

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return COMPARISON_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const c = COMPARISONS[slug];
  if (!c) return {};
  return {
    title: c.title,
    description: c.description,
    alternates: { canonical: `/vs/${slug}` },
    openGraph: { title: c.title, description: c.description, type: 'article' },
  };
}

export default async function VsPage({ params }: Params) {
  const { slug } = await params;
  const c = COMPARISONS[slug];
  if (!c) notFound();

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: `What's the difference between AHTML and ${c.competitor}?`,
        acceptedAnswer: { '@type': 'Answer', text: c.oneLiner },
      },
      {
        '@type': 'Question',
        name: `When should I use ${c.competitor} instead of AHTML?`,
        acceptedAnswer: { '@type': 'Answer', text: c.whenToUseThem.join(' ') },
      },
      {
        '@type': 'Question',
        name: `When should I use AHTML?`,
        acceptedAnswer: { '@type': 'Answer', text: c.whenToUseAhtml.join(' ') },
      },
    ],
  };

  return (
    <>
      <Header />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <main>
        <section className="section tall">
          <div className="container" style={{ maxWidth: '64ch' }}>
            <div className="eyebrow">AHTML vs {c.competitor}</div>
            <h1 style={{ fontSize: 'clamp(40px, 6vw, 80px)' }}>{c.title.replace(/^AHTML vs [^—]+— /, '')}</h1>
            <p className="lede" style={{ marginTop: 32 }}>{c.oneLiner}</p>
            <p style={{ marginTop: 24, color: 'var(--ink-2)' }}>{c.positioning}</p>
            <div style={{ marginTop: 32, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <a className="btn" href="/#install">Install AHTML</a>
              <a className="btn ghost" href={c.competitorUrl} rel="noopener noreferrer">
                {c.competitor} →
              </a>
            </div>
          </div>
        </section>

        <section className="section" style={{ borderTop: '1px solid var(--rule)' }}>
          <div className="container">
            <div className="kicker">Feature-by-feature</div>
            <h2 style={{ marginTop: 12, marginBottom: 32 }}>The honest table.</h2>
            <table className="bench-table">
              <thead>
                <tr>
                  <th></th>
                  <th>{c.competitor}</th>
                  <th>AHTML</th>
                </tr>
              </thead>
              <tbody>
                {c.rows.map(([feature, them, ahtml], i) => (
                  <tr key={i}>
                    <td>{feature}</td>
                    <td>{them}</td>
                    <td>{ahtml}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="section" style={{ borderTop: '1px solid var(--rule)' }}>
          <div className="container">
            <div className="grid cols-2" style={{ gap: 48 }}>
              <div>
                <div className="kicker">Pick {c.competitor} when</div>
                <ul style={{ paddingLeft: 24, lineHeight: 1.7, marginTop: 16 }}>
                  {c.whenToUseThem.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
              <div>
                <div className="kicker">Pick AHTML when</div>
                <ul style={{ paddingLeft: 24, lineHeight: 1.7, marginTop: 16 }}>
                  {c.whenToUseAhtml.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="section" style={{ borderTop: '1px solid var(--rule)' }}>
          <div className="container" style={{ maxWidth: '64ch' }}>
            <div className="kicker">What they have in common</div>
            <ul style={{ paddingLeft: 24, lineHeight: 1.7, marginTop: 16 }}>
              {c.similarities.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
        </section>

        <section className="section tall" style={{ borderTop: '1px solid var(--rule)', textAlign: 'center' }}>
          <div className="container">
            <h2 style={{ maxWidth: '20ch', margin: '0 auto 24px' }}>Three minutes to install. Decide for yourself.</h2>
            <p className="lede" style={{ margin: '0 auto 32px' }}>
              AHTML is MIT-licensed and runs entirely inside your app. No SaaS, no per-request cost, no lock-in.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
              <a className="btn" href="/#install">Install AHTML</a>
              <a className="btn ghost" href="/tools/agent-readiness">Score your site (free)</a>
              <a className="btn ghost" href="https://github.com/DibbayajyotiRoy/AHTML" rel="noopener noreferrer">GitHub</a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

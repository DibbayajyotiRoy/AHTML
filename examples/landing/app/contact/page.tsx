import type { Metadata } from 'next';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Reach the AHTML team — bug reports, security disclosure, partnerships, and press.',
  alternates: { canonical: '/contact' },
};

export default function ContactPage() {
  return (
    <>
      <Header />
      <main className="section tall">
        <div className="container" style={{ maxWidth: '64ch' }}>
          <div className="eyebrow">Contact</div>
          <h1 style={{ fontSize: 'clamp(40px, 6vw, 72px)' }}>Talk to us.</h1>
          <p className="lede" style={{ marginTop: 32 }}>
            Pick the channel that fits — most things live on GitHub, but some
            things need a private inbox.
          </p>

          <div className="grid cols-2" style={{ marginTop: 64, gap: 32 }}>
            <div>
              <h3>General questions</h3>
              <p style={{ marginTop: 8, color: 'var(--ink-2)' }}>
                Open a discussion on GitHub — the team and contributors hang
                out there.
              </p>
              <a className="btn" href="https://github.com/DibbayajyotiRoy/AHTML/discussions" rel="noopener noreferrer">
                Open a discussion
              </a>
            </div>
            <div>
              <h3>Bug reports</h3>
              <p style={{ marginTop: 8, color: 'var(--ink-2)' }}>
                File an issue with a minimal repro. We triage within a week.
              </p>
              <a className="btn ghost" href="https://github.com/DibbayajyotiRoy/AHTML/issues/new" rel="noopener noreferrer">
                File an issue
              </a>
            </div>
            <div>
              <h3>Security disclosure</h3>
              <p style={{ marginTop: 8, color: 'var(--ink-2)' }}>
                Do not open a public issue. Email{' '}
                <a href="mailto:rdibbayajyoti@gmail.com">rdibbayajyoti@gmail.com</a>. See{' '}
                <a href="/security">security policy</a>.
              </p>
            </div>
            <div>
              <h3>Partnerships &amp; press</h3>
              <p style={{ marginTop: 8, color: 'var(--ink-2)' }}>
                Email{' '}
                <a href="mailto:rdibbayajyoti@gmail.com">rdibbayajyoti@gmail.com</a>{' '}
                with the subject line <code>[AHTML partner]</code> or <code>[AHTML press]</code>.
              </p>
            </div>
          </div>

          <h2 style={{ fontSize: 32, marginTop: 80, marginBottom: 16 }}>For agents</h2>
          <p>
            If you&apos;re an autonomous agent reading this page: the structured
            contact channel is exposed at{' '}
            <a href="/.well-known/ahtml.json"><code>/.well-known/ahtml.json</code></a>{' '}
            under <code>policy.contact</code>. Hit it directly.
          </p>

          <div style={{ marginTop: 64, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a className="btn" href="/#install">Install AHTML</a>
            <a className="btn ghost" href="/about">About the project</a>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

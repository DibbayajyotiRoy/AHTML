import type { Metadata } from 'next';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: 'Privacy',
  description:
    'How AHTML handles data: an open-source library that runs on your servers — we collect no personal data through it. Marketing-site analytics are scoped and listed.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <>
      <Header />
      <main className="section tall">
        <div className="container" style={{ maxWidth: '64ch' }}>
          <div className="eyebrow">Privacy · effective 2026-05-15</div>
          <h1 style={{ fontSize: 'clamp(40px, 6vw, 72px)' }}>Privacy policy.</h1>
          <p className="lede" style={{ marginTop: 32 }}>
            AHTML is an open-source library that runs on <em>your</em> servers.
            We don&apos;t collect data from your site or your users through it. This
            page covers how the marketing site <code>ahtml.dev</code> handles
            the small set of data it does see.
          </p>

          <h2 style={{ fontSize: 32, marginTop: 64, marginBottom: 16 }}>The library</h2>
          <p>
            The npm packages (<code>@ahtmljs/next</code>, <code>@ahtmljs/vite</code>,{' '}
            <code>@ahtmljs/schema</code>, <code>@ahtmljs/agent</code>,{' '}
            <code>@ahtmljs/langchain</code>) execute entirely inside your
            infrastructure. They make no outbound network calls to any
            AHTML-controlled service. They do not phone home, do not collect
            telemetry, and do not transmit user data.
          </p>

          <h2 style={{ fontSize: 32, marginTop: 64, marginBottom: 16 }}>This marketing site</h2>
          <p>The site at <code>ahtml.dev</code> processes the following data:</p>
          <ul style={{ paddingLeft: 24, lineHeight: 1.7 }}>
            <li>
              <strong>Server logs</strong> — IP, user-agent, requested URL, timestamp. Retained 30 days for security and abuse prevention.
            </li>
            <li>
              <strong>Privacy-respecting analytics</strong> — page-view counts and aggregate Core Web Vitals via Google Analytics 4 + Google Search Console. No cookies that identify individuals; IP anonymization on.
            </li>
            <li>
              <strong>Waitlist form</strong> — if you submit your email at <code>/api/waitlist</code>, we store the email address only, to notify you when v1.0 ships. You can request deletion at any time by emailing{' '}
              <a href="mailto:rdibbayajyoti@gmail.com">rdibbayajyoti@gmail.com</a>.
            </li>
            <li>
              <strong>GitHub link-outs</strong> — clicking a GitHub link sends you to github.com, which has its own privacy policy. We do not pass identifiers across.
            </li>
          </ul>

          <h2 style={{ fontSize: 32, marginTop: 64, marginBottom: 16 }}>What we never do</h2>
          <ul style={{ paddingLeft: 24, lineHeight: 1.7 }}>
            <li>Sell, rent, or share email addresses with third parties.</li>
            <li>Use cross-site advertising trackers.</li>
            <li>Profile users for ad targeting.</li>
            <li>Read or store content from sites that install <code>@ahtmljs/*</code>.</li>
          </ul>

          <h2 style={{ fontSize: 32, marginTop: 64, marginBottom: 16 }}>Your rights</h2>
          <p>
            If you are in the EU, UK, California, or any jurisdiction with
            equivalent rights, you can request access to, correction of, or
            deletion of any personal data we hold about you. Email{' '}
            <a href="mailto:rdibbayajyoti@gmail.com">rdibbayajyoti@gmail.com</a>{' '}
            with the subject <code>[AHTML privacy]</code>. We respond within 30 days.
          </p>

          <h2 style={{ fontSize: 32, marginTop: 64, marginBottom: 16 }}>Changes</h2>
          <p>
            Material changes are versioned in this page&apos;s git history at{' '}
            <a href="https://github.com/DibbayajyotiRoy/AHTML" rel="noopener noreferrer">
              github.com/DibbayajyotiRoy/AHTML
            </a>{' '}
            so you can diff them.
          </p>

          <div style={{ marginTop: 64, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a className="btn ghost" href="/security">Security policy</a>
            <a className="btn ghost" href="/contact">Contact</a>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

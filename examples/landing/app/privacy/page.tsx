import type { Metadata } from 'next';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: 'Privacy',
  description:
    'How AHTML handles data: an open-source library that runs on your servers, with anonymous usage analytics listed field by field, and a cookieless marketing site. No cookies, no consent banner, no ad trackers.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <>
      <Header />
      <main className="section tall">
        <div className="container" style={{ maxWidth: '64ch' }}>
          <div className="eyebrow">Privacy · effective 2026-10-08</div>
          <h1 style={{ fontSize: 'clamp(40px, 6vw, 72px)' }}>Privacy policy.</h1>
          <p className="lede" style={{ marginTop: 32 }}>
            AHTML is an open-source library that runs on <em>your</em> servers.
            We don&apos;t collect data from your site or your users through it.
            This page lists exactly what the packages and the marketing site{' '}
            <code>ahtml.dev</code> do send.
          </p>

          <h2 style={{ fontSize: 32, marginTop: 64, marginBottom: 16 }}>The npm packages</h2>
          <p>
            The npm packages (<code>@ahtmljs/next</code>, <code>@ahtmljs/vite</code>,{' '}
            <code>@ahtmljs/schema</code>, <code>@ahtmljs/agent</code>,{' '}
            <code>@ahtmljs/langchain</code>) execute entirely inside your
            infrastructure and do not transmit your users&apos; data, page
            content, URLs or hostnames anywhere. They do send anonymous usage
            analytics to PostHog (EU Cloud, <code>eu.i.posthog.com</code>) so we
            can see which features are used. This is always on and has no
            opt-out switch; if your network policy forbids it, block{' '}
            <code>eu.i.posthog.com</code> at egress and the packages keep
            working. The complete field list and the source file are in{' '}
            <a href="https://github.com/DibbayajyotiRoy/AHTML#usage-analytics">
              the README
            </a>
            .
          </p>
          <p>Each event carries only these fields:</p>
          <ul style={{ paddingLeft: 24, lineHeight: 1.7 }}>
            <li>
              <strong>What ran</strong> — the event name (a fixed feature name from our source, such as <code>snapshot.build</code>), <code>pkg</code>, <code>pkg_version</code> and <code>count</code>.
            </li>
            <li>
              <strong>Runtime and platform</strong> — <code>runtime</code>, <code>runtime_version</code>, <code>os</code> and <code>arch</code>.
            </li>
            <li>
              <strong>Coarse environment labels</strong> — <code>ci</code>, <code>ci_provider</code>, <code>env_class</code>, <code>hosting</code>, <code>is_tty</code>, <code>is_container</code>, <code>node_env</code> and <code>package_manager</code>. These are flags and category labels, not values read from your machine.
            </li>
            <li>
              <strong>Session</strong> — a random per-process session id, so events from one run can be grouped.
            </li>
            <li>
              <strong>Anonymous install profile</strong> — an anonymous person profile keyed by an install id, which is a one-way hash of the hostname and working directory (the raw values are never sent). The profile records the first and last <code>env_class</code>, package, version, runtime and OS seen for that install.
            </li>
            <li>
              <strong>Errors</strong> — error events carry only an error code, never a message or stack trace.
            </li>
          </ul>
          <p>
            PostHog derives approximate location (country/city) from the
            request IP at ingestion; the project discards client IP addresses,
            so IPs are not stored. <strong>Never sent:</strong> URLs, page
            content, hostnames, file paths, CLI arguments, or environment
            variable values.
          </p>
          <p>
            Separately, at install time the packages depend on{' '}
            <code>@scarf/scarf</code>, which sends anonymous install analytics
            (OS info, package and version, a hashed dependency tree) to Scarf.
            Scarf does not store IP addresses. See{' '}
            <a href="https://github.com/DibbayajyotiRoy/AHTML#install-analytics-scarf">
              the README
            </a>{' '}
            for how to opt out of that one.
          </p>

          <h2 style={{ fontSize: 32, marginTop: 64, marginBottom: 16 }}>This marketing site</h2>
          <p>The site at <code>ahtml.dev</code> processes the following data:</p>
          <ul style={{ paddingLeft: 24, lineHeight: 1.7 }}>
            <li>
              <strong>Server logs</strong> — IP, user-agent, requested URL, timestamp. Retained 30 days for security and abuse prevention.
            </li>
            <li>
              <strong>Cookieless analytics (PostHog, EU Cloud)</strong> — page views, clicks, referrer, device and browser, page-load performance (Core Web Vitals) and click heatmaps. It sets no cookies and stores nothing in your browser (in-memory only, gone when you close or reload the page), so there is no consent banner. Because nothing is stored, a reload or a new visit counts as a new anonymous visitor. PostHog derives approximate location (country/city) from your IP address at ingestion; IP addresses are discarded and not stored. No session recordings, no person profiles, and we honour your browser&apos;s Do Not Track setting. Requests go through <code>ahtml.dev/ingest</code>, a proxy on our own domain.
            </li>
            <li>
              <strong>Vercel Web Analytics and Speed Insights</strong> — aggregate page-view counts and Core Web Vitals from our host, Vercel. Both are cookieless and do not track you across sites.
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

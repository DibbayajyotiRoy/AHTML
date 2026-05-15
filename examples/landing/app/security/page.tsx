import type { Metadata } from 'next';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: 'Security',
  description:
    'AHTML security policy: how to report vulnerabilities, threat model, supported versions, and hardening checklists for site operators and agent runtimes.',
  alternates: { canonical: '/security' },
};

export default function SecurityPage() {
  return (
    <>
      <Header />
      <main className="section tall">
        <div className="container" style={{ maxWidth: '64ch' }}>
          <div className="eyebrow">Security</div>
          <h1 style={{ fontSize: 'clamp(40px, 6vw, 72px)' }}>Security policy.</h1>
          <p className="lede" style={{ marginTop: 32 }}>
            How to report vulnerabilities, what we consider in-scope, and the
            hardening checklists we recommend for site operators and agent
            runtimes.
          </p>

          <h2 style={{ fontSize: 32, marginTop: 64, marginBottom: 16 }}>Reporting vulnerabilities</h2>
          <p>
            If you discover a security issue in AHTML, please <strong>do not</strong>{' '}
            open a public GitHub issue. Instead, email{' '}
            <a href="mailto:rdibbayajyoti@gmail.com"><strong>rdibbayajyoti@gmail.com</strong></a>.
          </p>
          <p>
            We respond within <strong>72 hours</strong> and aim to ship fixes
            within <strong>14 days for critical</strong>, 30 days for high, and
            90 days for medium and below.
          </p>

          <h2 style={{ fontSize: 32, marginTop: 64, marginBottom: 16 }}>Supported versions</h2>
          <table className="bench-table">
            <thead>
              <tr>
                <th>Version</th>
                <th>Supported</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>v0.1.x</td><td>active</td></tr>
              <tr><td>&lt; v0.1</td><td>—</td></tr>
            </tbody>
          </table>
          <p style={{ marginTop: 16, color: 'var(--ink-3)', fontSize: 14 }}>
            We support v0.x lines for 6 months after the next major release.
          </p>

          <h2 style={{ fontSize: 32, marginTop: 64, marginBottom: 16 }}>Threat model</h2>
          <p>
            AHTML is infrastructure for <em>declaring</em> what a page contains
            and what actions are available on it. Action <em>execution</em> is
            your existing backend&apos;s concern. The integrity of AHTML&apos;s
            declarations is the v0.2 signing concern.
          </p>

          <h3 style={{ marginTop: 32, marginBottom: 12 }}>In-scope threats</h3>
          <table className="bench-table">
            <thead>
              <tr><th>Threat</th><th>Mitigation</th></tr>
            </thead>
            <tbody>
              <tr><td>Tampering in transit</td><td>v0.2: signed snapshots (JWS over canonical JSON, did:web)</td></tr>
              <tr><td>Malicious site serving fake AHTML</td><td>v0.2: agent SDK rejects unsigned snapshots in strict mode</td></tr>
              <tr><td>Replay of stale snapshots</td><td><code>ttl</code> + <code>fetched_at</code> + ETag</td></tr>
              <tr><td>Agent firing irreversible / costly actions</td><td>Action contract: <code>confirmation</code>, <code>reversible</code>, <code>side_effects</code></td></tr>
              <tr><td>Unbounded snapshot fetches (DoS)</td><td><code>policy.rate_limit</code> enforced per source</td></tr>
              <tr><td>Information disclosure via snapshot</td><td>Site owner controls <code>buildSnapshot</code> output</td></tr>
              <tr><td>Polluted route discovery</td><td><code>/.well-known/ahtml.json</code> as trusted entry point</td></tr>
            </tbody>
          </table>

          <h3 style={{ marginTop: 32, marginBottom: 12 }}>Out of scope</h3>
          <p>Concerns of your existing stack, not AHTML: prompt injection of the agent, auth/authz, CSRF on action endpoints, SQLi/XSS in your app, and compromise of the agent&apos;s identity material.</p>

          <h2 style={{ fontSize: 32, marginTop: 64, marginBottom: 16 }}>Hardening checklist — site operators</h2>
          <ul style={{ paddingLeft: 24, lineHeight: 1.7 }}>
            <li>Set <code>policy.agents_welcome: false</code> if you want zero agent traffic — or simply don&apos;t install the plugin.</li>
            <li>Set <code>policy.rate_limit</code> to a value your origin can serve. Default <code>300/min</code> is sane.</li>
            <li>Set <code>policy.contact</code> to a monitored channel.</li>
            <li>For action endpoints, require <code>auth: &apos;required&apos;</code>.</li>
            <li>Set <code>confirmation: &apos;required&apos;</code> on any action that costs money, sends to third parties, or deletes data.</li>
            <li>Never put PII, secrets, or internal IDs in snapshot fields.</li>
            <li>Log all calls to <code>/ahtml/*</code> and action endpoints.</li>
            <li>v0.2: sign snapshots against a <code>did:web</code> identity at your domain.</li>
          </ul>

          <h2 style={{ fontSize: 32, marginTop: 64, marginBottom: 16 }}>Hardening checklist — agent runtimes</h2>
          <ul style={{ paddingLeft: 24, lineHeight: 1.7 }}>
            <li>Honor <code>confirmation: &apos;required&apos;</code>. Don&apos;t fire without explicit user consent.</li>
            <li>Honor <code>reversible: &#123; reversible: false &#125;</code>. Treat as <code>confirmation: required</code>.</li>
            <li>Honor <code>policy.rate_limit</code>. Back off on 429.</li>
            <li>Verify signatures (v0.2). Refuse unsigned snapshots when your threat model requires.</li>
            <li>Check <code>freshness</code> and <code>ttl</code>. Don&apos;t act on stale data.</li>
            <li>Use <code>preview_url</code> for dry-run when available.</li>
            <li>Identify yourself via <code>User-Agent</code>.</li>
          </ul>

          <h2 style={{ fontSize: 32, marginTop: 64, marginBottom: 16 }}>Public disclosures</h2>
          <p>
            Resolved security issues are listed in{' '}
            <a href="https://github.com/DibbayajyotiRoy/AHTML/blob/main/CHANGELOG.md" rel="noopener noreferrer">
              CHANGELOG.md
            </a>{' '}
            and GitHub Security Advisories. CVE assignment via the GitHub CNA.
          </p>

          <div style={{ marginTop: 64, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a className="btn" href="mailto:rdibbayajyoti@gmail.com">Email security@</a>
            <a className="btn ghost" href="/contact">Contact</a>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

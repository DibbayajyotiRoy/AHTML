import type { Metadata } from 'next';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: 'About',
  description:
    'AHTML is an open-source npm package that adds typed agent endpoints to your existing site — MCP, OpenAPI, JSON-LD, and llms.txt — with zero migration.',
  alternates: { canonical: '/about' },
};

export default function AboutPage() {
  return (
    <>
      <Header />
      <main className="section tall">
        <div className="container" style={{ maxWidth: '64ch' }}>
          <div className="eyebrow">About</div>
          <h1 style={{ fontSize: 'clamp(40px, 6vw, 72px)' }}>
            The web is being read by <em>more than humans</em>.
          </h1>
          <p className="lede" style={{ marginTop: 32 }}>
            AHTML is a small, opinionated set of npm packages that adds typed
            agent endpoints to your existing site — MCP, OpenAPI, JSON-LD, and
            llms.txt — with zero migration. Browsers see the HTML they always
            did. Agents see a 100× cheaper, action-aware snapshot.
          </p>

          <h2 style={{ fontSize: 32, marginTop: 64, marginBottom: 16 }}>Why we built it</h2>
          <p>
            By 2026 a meaningful share of pageviews come from agents — Claude,
            ChatGPT, Perplexity, internal assistants, RPA. They re-read HTML
            that was designed for humans, burning tokens to skim past
            navigation, hydration scripts, and CSS-in-JS. The result is slower,
            more expensive, and less accurate retrieval than it needs to be.
          </p>
          <p>
            AHTML fixes that without a rewrite. You install a plugin, the
            plugin emits typed entities and typed actions from the data your
            page already has, and the agent gets a snapshot tuned for its
            workload. Same Next.js / Vite / SvelteKit app. Same database. Same
            deploy.
          </p>

          <h2 style={{ fontSize: 32, marginTop: 64, marginBottom: 16 }}>Principles</h2>
          <ul style={{ paddingLeft: 24, lineHeight: 1.7 }}>
            <li><strong>Additive, not replacement.</strong> AHTML lives alongside HTML — it never asks your team to migrate anything.</li>
            <li><strong>Typed actions or none.</strong> Actions carry <code>cost</code>, <code>reversible</code>, <code>side_effects</code>, <code>confirmation</code>. Anything else is just text.</li>
            <li><strong>Compile-to-many.</strong> One source-of-truth emits MCP, OpenAPI, JSON-LD, and llms.txt. Don&apos;t fragment your team into four spec teams.</li>
            <li><strong>Provenance by default.</strong> Every package release is signed with sigstore via GitHub Actions. v0.2 adds signed snapshots.</li>
            <li><strong>Open source forever.</strong> MIT. No SSPL. No license drift.</li>
          </ul>

          <h2 style={{ fontSize: 32, marginTop: 64, marginBottom: 16 }}>Who&apos;s behind it</h2>
          <p>
            AHTML is built by{' '}
            <a href="https://github.com/DibbayajyotiRoy" rel="noopener noreferrer">Dibbayajyoti Roy</a>{' '}
            and contributors. The project lives on GitHub at{' '}
            <a href="https://github.com/DibbayajyotiRoy/AHTML" rel="noopener noreferrer">
              github.com/DibbayajyotiRoy/AHTML
            </a>{' '}
            under the MIT license. Issues, PRs, and discussions are welcome there.
          </p>

          <h2 style={{ fontSize: 32, marginTop: 64, marginBottom: 16 }}>How to get involved</h2>
          <ul style={{ paddingLeft: 24, lineHeight: 1.7 }}>
            <li><a href="https://github.com/DibbayajyotiRoy/AHTML" rel="noopener noreferrer">Star the repo</a> if you want this to exist.</li>
            <li><a href="https://github.com/DibbayajyotiRoy/AHTML/blob/main/CONTRIBUTING.md" rel="noopener noreferrer">Contribute</a> — adapters, examples, fixes.</li>
            <li><a href="/contact">Get in touch</a> if you&apos;re shipping an agent and have feedback on the spec.</li>
          </ul>

          <div style={{ marginTop: 64, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a className="btn" href="/#install">Install AHTML</a>
            <a className="btn ghost" href="/tools/agent-readiness">Check your site</a>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

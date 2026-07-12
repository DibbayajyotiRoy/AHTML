/**
 * FAQ: question-formatted headings with short, quotable answers, plus
 * schema.org FAQPage JSON-LD so answer engines can cite them directly.
 * Content mirrors the README FAQ and docs/faq.md; keep the three in sync.
 */

const FAQS: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: 'What is AHTML?',
    a: 'AHTML is an open-source (MIT) snapshot format and toolkit that lets any website publish an agent-readable, token-efficient view of each page: typed entities plus typed actions with explicit cost, reversibility, auth, and side-effects. It auto-emits MCP, OpenAPI 3.1, JSON-LD, llms.txt, RSL, and Markdown from that single source, while browsers keep the same HTML.',
  },
  {
    q: 'Is AHTML a replacement for MCP?',
    a: 'No. AHTML emits MCP. MCP is the agent’s tool-calling protocol; AHTML is the per-page contract that auto-generates an MCP manifest at /ahtml/mcp.json from your existing site, so you don’t run a separate MCP server with parallel auth and deploys.',
  },
  {
    q: 'How is AHTML different from llms.txt?',
    a: 'llms.txt is unstructured markdown: useful as a sitemap for IDE agents, but it can’t express typed entities or executable actions. AHTML auto-emits llms.txt as a compatibility shim and adds the typed contract; in the real-LLM benchmark llms.txt scored 89% on fact extraction vs 100% for AHTML JSON.',
  },
  {
    q: 'How many tokens does AHTML save vs raw HTML?',
    a: 'Measured with the real OpenAI and Anthropic tokenizers: 4.5× to 7.3× fewer tokens on the lean benchmark corpus (5.6× on the flagship page). On production-bloat pages of 200 to 500 KB the ratio scales toward 50× to 100×, because the snapshot stays near ~2 KB.',
  },
  {
    q: 'Does AHTML make LLM agents more accurate?',
    a: 'Yes. In a multi-model benchmark (146 runs, 20 fact-extraction tasks across gpt-4o-mini, claude-haiku-4.5, gemini-2.5-flash, and llama-3.3-70b), accuracy rose from 91% on raw HTML to 100% on AHTML JSON.',
  },
  {
    q: 'Do I need to migrate my site to use AHTML?',
    a: 'No. AHTML is additive: it adds endpoints (/ahtml/*, /.well-known/ahtml.json, /llms.txt) next to your existing routes, and the HTML you serve to browsers is unchanged.',
  },
  {
    q: 'Which frameworks does AHTML support?',
    a: 'Next.js 14+/15 App Router (@ahtmljs/next), Astro (@ahtmljs/astro), SvelteKit (@ahtmljs/sveltekit), Vite-based apps such as SolidStart (@ahtmljs/vite), and Hono on Node, Bun, Deno, Cloudflare Workers, and AWS Lambda (@ahtmljs/hono). You can also use @ahtmljs/schema directly with hand-rolled routes in any framework, and `npx @ahtmljs/cli init` detects and wires all five supported frameworks.',
  },
  {
    q: 'Does AHTML work on sites that haven’t adopted it?',
    a: 'Yes. @ahtmljs/cli and @ahtmljs/agent extract typed snapshots from ordinary HTML (schema.org, OpenGraph, microdata, data-attributes), and `npx @ahtmljs/cli mcp <url>` turns any URL into MCP tools today.',
  },
  {
    q: 'Can I use AHTML from Python?',
    a: 'Yes. `pip install ahtml` gives you the Python consumer SDK: a LangChain loader, an ETag/TTL-cached client, detached-JWS and did:web verification, and run_action with the same safety gate and dry-run sandbox as the TypeScript agent. Its canonical JSON output is byte-identical to the TypeScript reference.',
  },
  {
    q: 'How much does AHTML cost?',
    a: 'Nothing. All sixteen @ahtmljs packages and the ahtml Python SDK are MIT-licensed open-source libraries that run inside your own app. There is no SaaS, no per-request pricing, and no lock-in.',
  },
];

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQS.map(({ q, a }) => ({
    '@type': 'Question',
    name: q,
    acceptedAnswer: { '@type': 'Answer', text: a },
  })),
};

export default function FAQ() {
  return (
    <section className="section" id="faq">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <div className="container">
        <div className="kicker">FAQ</div>
        <h2 style={{ marginTop: 12, marginBottom: 40 }}>Frequently asked questions.</h2>
        <div className="grid cols-2" style={{ gap: 24 }}>
          {FAQS.map((f, i) => (
            <div key={i} className="card">
              <h3>{f.q}</h3>
              <p>{f.a}</p>
            </div>
          ))}
        </div>
        <p className="legalish" style={{ marginTop: 24 }}>
          Longer answers in the{' '}
          <a href="https://github.com/DibbayajyotiRoy/AHTML/blob/main/docs/faq.md" rel="noopener noreferrer">
            full FAQ
          </a>{' '}
          and the{' '}
          <a href="https://github.com/DibbayajyotiRoy/AHTML/blob/main/docs/compare.md" rel="noopener noreferrer">
            2026 comparison
          </a>
          .
        </p>
      </div>
    </section>
  );
}

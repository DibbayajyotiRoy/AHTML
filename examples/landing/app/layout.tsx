import type { Metadata } from 'next';
import { Inter, Fraunces, JetBrains_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';

const SITE_URL = process.env.SITE_URL ?? 'https://ahtml.dev';

const inter = Inter({
  subsets: ['latin'],
  variable: '--inter',
  display: 'swap',
});
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--fraunces',
  display: 'swap',
  axes: ['opsz', 'SOFT'],
});
const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'AHTML — the HTML of the agent web',
    template: '%s — AHTML',
  },
  description:
    'AHTML makes any website agent-readable: typed entities and typed actions emitted as MCP, OpenAPI 3.1, JSON-LD, and llms.txt from one source — measured 5.6× fewer tokens than raw HTML and 91%→100% LLM extraction accuracy. Zero migration.',
  metadataBase: new URL(SITE_URL),
  applicationName: 'AHTML',
  authors: [{ name: 'Dibbayajyoti Roy', url: 'https://dibbayajyoti.com/about' }],
  creator: 'Dibbayajyoti Roy',
  publisher: 'AHTML',
  keywords: [
    'AHTML',
    'agent web',
    'agent-readable web',
    'AI agent web standard',
    'MCP',
    'Model Context Protocol',
    'MCP server for existing site',
    'llms.txt',
    'llms.txt alternative',
    'JSON-LD',
    'OpenAPI',
    'AI agents',
    'machine-readable HTML',
    'web content for LLMs',
    'Next.js plugin',
    'Vite plugin',
    'SvelteKit plugin',
    'Hono adapter',
    'schema.org for AI',
    'token-efficient HTML alternative',
    'AI-readable site',
  ],
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  openGraph: {
    title: 'AHTML — the HTML of the agent web',
    description:
      '5.6× fewer tokens than raw HTML, 91%→100% LLM extraction accuracy. MCP, OpenAPI, JSON-LD, and llms.txt from one source. Zero migration.',
    url: SITE_URL,
    siteName: 'AHTML',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AHTML — the HTML of the agent web',
    description:
      '5.6× fewer tokens than raw HTML, 91%→100% LLM extraction accuracy. MCP, OpenAPI, JSON-LD, and llms.txt from one source. Zero migration.',
  },
  alternates: {
    canonical: '/',
    types: {
      'application/ahtml+text': '/ahtml',
      'application/ahtml+json': '/ahtml?fmt=json',
      'application/mcp+json': '/ahtml/mcp.json',
      'application/openapi+json': '/ahtml/openapi.json',
      'text/markdown': '/llms.txt',
    },
  },
  other: {
    'x-ahtml-version': '1.0.0',
  },
};

const softwareJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'AHTML',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Cross-platform',
  description:
    'AHTML is an open-source (MIT) snapshot format with TypeScript and Python toolkits that lets any website publish an agent-readable, token-efficient view of each page — typed entities plus typed actions with explicit cost, reversibility, auth, and side-effects — and auto-emit MCP, OpenAPI 3.1, JSON-LD, llms.txt, RSL, and Markdown from that single source, while browsers keep the same HTML.',
  url: SITE_URL,
  downloadUrl: 'https://www.npmjs.com/package/@ahtmljs/next',
  softwareVersion: '1.0.0',
  license: 'https://opensource.org/licenses/MIT',
  author: { '@type': 'Person', name: 'Dibbayajyoti Roy', url: 'https://dibbayajyoti.com/about' },
  creator: { '@type': 'Person', name: 'Dibbayajyoti Roy', url: 'https://dibbayajyoti.com/about' },
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  codeRepository: 'https://github.com/DibbayajyotiRoy/AHTML',
  programmingLanguage: ['TypeScript', 'JavaScript'],
  sameAs: [
    'https://dibbayajyoti.com/projects/ahtml',
    'https://dibbayajyoti.com',
    'https://github.com/DibbayajyotiRoy/AHTML',
    'https://www.npmjs.com/org/ahtmljs',
  ],
};

const sourceCodeJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareSourceCode',
  name: 'AHTML',
  description:
    'Monorepo for AHTML: nine MIT-licensed npm packages under the @ahtmljs scope (schema, next, vite, hono, agent, langchain, cli, kv, webmcp) that make websites agent-readable and emit MCP, OpenAPI 3.1, JSON-LD, llms.txt, RSL, and Markdown from one source.',
  codeRepository: 'https://github.com/DibbayajyotiRoy/AHTML',
  programmingLanguage: ['TypeScript', 'JavaScript'],
  runtimePlatform: 'Node.js 18+',
  license: 'https://opensource.org/licenses/MIT',
  version: '1.0.0',
  author: { '@type': 'Person', name: 'Dibbayajyoti Roy', url: 'https://dibbayajyoti.com/about' },
};

const orgJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'AHTML',
  url: SITE_URL,
  logo: `${SITE_URL}/opengraph-image`,
  founder: { '@type': 'Person', name: 'Dibbayajyoti Roy', url: 'https://dibbayajyoti.com/about' },
  sameAs: [
    'https://dibbayajyoti.com/projects/ahtml',
    'https://dibbayajyoti.com',
    'https://github.com/DibbayajyotiRoy/AHTML',
    'https://www.npmjs.com/org/ahtmljs',
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable} ${mono.variable}`}>
      <head>
        <link rel="alternate" type="application/ahtml+text" href="/ahtml" />
        <link rel="alternate" type="application/ahtml+json" href="/ahtml?fmt=json" />
        <link rel="alternate" type="application/mcp+json" href="/ahtml/mcp.json" />
        <link rel="alternate" type="application/openapi+json" href="/ahtml/openapi.json" />
        <link rel="alternate" type="text/markdown" href="/llms.txt" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(sourceCodeJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
        />
      </head>
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}

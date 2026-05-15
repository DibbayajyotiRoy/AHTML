import type { Metadata } from 'next';
import { Inter, Fraunces, JetBrains_Mono } from 'next/font/google';
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
    'Write your page once. AHTML emits MCP, OpenAPI, JSON-LD, llms.txt, and a 100× cheaper semantic snapshot — from your existing Next.js, Vite, or SvelteKit app. Zero migration.',
  metadataBase: new URL(SITE_URL),
  applicationName: 'AHTML',
  authors: [{ name: 'Roy Mehta', url: 'https://github.com/DibbayajyotiRoy' }],
  creator: 'Roy Mehta',
  publisher: 'AHTML',
  keywords: [
    'AHTML',
    'agent web',
    'MCP',
    'Model Context Protocol',
    'llms.txt',
    'JSON-LD',
    'OpenAPI',
    'AI agents',
    'machine-readable HTML',
    'Next.js plugin',
    'Vite plugin',
    'SvelteKit plugin',
    'schema.org for AI',
    'token-efficient HTML',
    'AI-readable site',
  ],
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  openGraph: {
    title: 'AHTML — the HTML of the agent web',
    description: '100× fewer tokens. MCP for free. Zero migration.',
    url: SITE_URL,
    siteName: 'AHTML',
    type: 'website',
    locale: 'en_US',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'AHTML — the HTML of the agent web' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AHTML — the HTML of the agent web',
    description: '100× fewer tokens. MCP for free. Zero migration.',
    images: ['/og.png'],
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
    'x-ahtml-version': '0.1',
  },
};

const softwareJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'AHTML',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Cross-platform',
  description:
    'Open-source npm packages that make any Next.js, Vite, or SvelteKit site speak MCP, OpenAPI, JSON-LD, and llms.txt automatically.',
  url: SITE_URL,
  downloadUrl: 'https://www.npmjs.com/package/@ahtmljs/next',
  softwareVersion: '0.1',
  license: 'https://opensource.org/licenses/MIT',
  author: { '@type': 'Person', name: 'Roy Mehta', url: 'https://github.com/DibbayajyotiRoy' },
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  codeRepository: 'https://github.com/DibbayajyotiRoy/AHTML',
  programmingLanguage: ['TypeScript', 'JavaScript'],
};

const orgJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'AHTML',
  url: SITE_URL,
  logo: `${SITE_URL}/logo.png`,
  sameAs: ['https://github.com/DibbayajyotiRoy/AHTML', 'https://www.npmjs.com/org/ahtmljs'],
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
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

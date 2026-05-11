import type { Metadata } from 'next';
import { Inter, Fraunces, JetBrains_Mono } from 'next/font/google';
import './globals.css';

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
  title: 'AHTML — the HTML of the agent web',
  description:
    'Write your page once. AHTML emits MCP, OpenAPI, JSON-LD, llms.txt, and a 100× cheaper semantic snapshot — from your existing Next.js, Vite, or SvelteKit app. Zero migration.',
  metadataBase: new URL('https://ahtml.dev'),
  authors: [{ name: 'Roy Mehta' }],
  openGraph: {
    title: 'AHTML — the HTML of the agent web',
    description: '100× fewer tokens. MCP for free. Zero migration.',
    type: 'website',
    locale: 'en',
  },
  twitter: { card: 'summary_large_image', title: 'AHTML', description: 'The HTML of the agent web.' },
  alternates: {
    canonical: '/',
    types: {
      'application/ahtml+text': '/ahtml',
      'application/ahtml+json': '/ahtml?fmt=json',
      'text/markdown': '/llms.txt',
    },
  },
  other: {
    'x-ahtml-version': '0.1',
  },
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
      </head>
      <body>{children}</body>
    </html>
  );
}

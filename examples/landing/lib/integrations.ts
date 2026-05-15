export type Integration = {
  slug: string;
  framework: string;
  pkg: string;
  status: 'shipped' | 'roadmap';
  title: string;
  description: string;
  install: string;
  setup: string;
  notes: readonly string[];
};

export const INTEGRATIONS: Record<string, Integration> = {
  next: {
    slug: 'next',
    framework: 'Next.js',
    pkg: '@ahtmljs/next',
    status: 'shipped',
    title: 'AHTML for Next.js — drop-in agent endpoints',
    description:
      'Install @ahtmljs/next and your existing Next.js 14/15 App Router app emits MCP, OpenAPI, JSON-LD, and llms.txt automatically. Three route handlers, three minutes, zero migration.',
    install: 'npm install @ahtmljs/next @ahtmljs/schema',
    setup: `// app/.well-known/ahtml.json/route.ts
import { createManifestRoute } from '@ahtmljs/next/manifest';
import { ahtmlConfig } from '@/lib/ahtml-config';
export const { GET } = createManifestRoute(ahtmlConfig);

// app/ahtml/[[...path]]/route.ts
import { createSnapshotRoute } from '@ahtmljs/next/snapshot';
import { buildSnapshot } from '@/lib/snapshots';
export const { GET } = createSnapshotRoute(buildSnapshot);

// app/llms.txt/route.ts
import { createLlmsTxtRoute } from '@ahtmljs/next/llms-txt';
import { ahtmlConfig } from '@/lib/ahtml-config';
export const { GET } = createLlmsTxtRoute(() => ({ /* ... */ }), ahtmlConfig);`,
    notes: [
      'Works with App Router and Pages Router (App Router preferred).',
      'Edge runtime compatible.',
      'Auto-extracts from existing schema.org JSON-LD on most Shopify/WordPress storefronts.',
      'This very site (ahtml.dev) dogfoods @ahtmljs/next — view /ahtml or /llms.txt to see live output.',
    ],
  },

  vite: {
    slug: 'vite',
    framework: 'Vite',
    pkg: '@ahtmljs/vite',
    status: 'shipped',
    title: 'AHTML for Vite — single plugin, all endpoints',
    description:
      'Add @ahtmljs/vite to your vite.config.ts and your SPA or SSR app exposes /ahtml, /llms.txt, /.well-known/ahtml.json, and an MCP descriptor with one plugin entry.',
    install: 'npm install @ahtmljs/vite @ahtmljs/schema',
    setup: `// vite.config.ts
import { defineConfig } from 'vite';
import { ahtml } from '@ahtmljs/vite';

export default defineConfig({
  plugins: [
    ahtml({
      manifest: () => import('./src/ahtml.manifest'),
      snapshot: () => import('./src/ahtml.snapshot'),
    }),
  ],
});`,
    notes: [
      'Works with vanilla Vite SPA, SvelteKit dev mode, Astro, and Solid Start.',
      'Dev-mode HMR refreshes the snapshot when your data file changes.',
      'For prod, pair with your SSR/SSG host of choice — output is plain HTTP.',
    ],
  },

  sveltekit: {
    slug: 'sveltekit',
    framework: 'SvelteKit',
    pkg: '@ahtmljs/vite',
    status: 'shipped',
    title: 'AHTML for SvelteKit — endpoints via Vite plugin',
    description:
      'SvelteKit ships on Vite, so @ahtmljs/vite handles all four endpoints with no SvelteKit-specific install. Two server endpoints, same as any Svelte route.',
    install: 'npm install @ahtmljs/vite @ahtmljs/schema',
    setup: `// vite.config.ts
import { sveltekit } from '@sveltejs/kit/vite';
import { ahtml } from '@ahtmljs/vite';

export default {
  plugins: [
    sveltekit(),
    ahtml({ manifest: ..., snapshot: ... }),
  ],
};`,
    notes: [
      'Plays nicely with SvelteKit adapters (node, vercel, cloudflare, static).',
      'Use +server.ts endpoints if you prefer route-handler style over the plugin.',
      'See the Vite integration page for shared options.',
    ],
  },

  astro: {
    slug: 'astro',
    framework: 'Astro',
    pkg: '@ahtmljs/vite',
    status: 'roadmap',
    title: 'AHTML for Astro — Vite plugin today, native integration v0.2',
    description:
      'Astro is on Vite, so @ahtmljs/vite works in content-heavy Astro sites today. A native @ahtmljs/astro integration with content-collection auto-extraction is on the v0.2 roadmap.',
    install: 'npm install @ahtmljs/vite @ahtmljs/schema',
    setup: `// astro.config.mjs
import { defineConfig } from 'astro/config';
import { ahtml } from '@ahtmljs/vite';

export default defineConfig({
  vite: {
    plugins: [ahtml({ manifest: ..., snapshot: ... })],
  },
});`,
    notes: [
      'Works with hybrid SSR and static output.',
      'Native @ahtmljs/astro will auto-extract from content collections (v0.2).',
      'Track progress at github.com/DibbayajyotiRoy/AHTML/blob/main/PLAN.md.',
    ],
  },

  remix: {
    slug: 'remix',
    framework: 'Remix / React Router 7',
    pkg: '@ahtmljs/agent',
    status: 'roadmap',
    title: 'AHTML for Remix — route resources today, native plugin v0.2',
    description:
      'You can serve AHTML from Remix today using resource routes and @ahtmljs/agent. A native plugin that hooks into Remix loaders is on the v0.2 roadmap.',
    install: 'npm install @ahtmljs/agent @ahtmljs/schema',
    setup: `// app/routes/ahtml.tsx
import { buildAhtmlResponse } from '@ahtmljs/agent';
import { ahtmlConfig } from '~/lib/ahtml-config';
import { buildSnapshot } from '~/lib/snapshots';

export async function loader({ request }: { request: Request }) {
  return buildAhtmlResponse(request, ahtmlConfig, buildSnapshot);
}`,
    notes: [
      'Same approach works for React Router 7 (the merged Remix successor).',
      'Use a $.tsx splat if you need /ahtml/:type/:id paths.',
      'A first-class plugin is tracked in the v0.2 roadmap.',
    ],
  },
};

export const INTEGRATION_SLUGS = Object.keys(INTEGRATIONS);

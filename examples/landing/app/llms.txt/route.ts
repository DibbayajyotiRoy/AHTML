import { createLlmsTxtRoute } from '@ahtmljs/next/llms-txt';
import { ahtmlConfig } from '@/lib/ahtml-config';

export const { GET } = createLlmsTxtRoute(
  () => ({
    title: 'AHTML — the HTML of the agent web',
    description:
      'Write your page once. AHTML emits MCP, OpenAPI, JSON-LD, llms.txt, and a typed semantic snapshot using 5-10× fewer tokens than HTML on lean pages, 50-100× on production-bloated pages — from your existing Next.js, Vite, or SvelteKit app.',
    sections: [
      {
        name: 'Get started',
        items: [
          { title: 'Install', url: 'https://npmjs.com/package/@ahtmljs/next', description: 'npm install @ahtmljs/next' },
          { title: 'Quickstart', url: 'https://github.com/DibbayajyotiRoy/AHTML#install-in-3-minutes', description: 'three files, three minutes' },
          { title: 'v0.1 spec', url: 'https://github.com/DibbayajyotiRoy/AHTML/blob/main/SPEC.md', description: 'formal schema, action contract, policy block' },
          { title: 'Plan', url: 'https://github.com/DibbayajyotiRoy/AHTML/blob/main/PLAN.md', description: 'phases 0–3, risks, prior art' },
        ],
      },
      {
        name: 'Demo',
        items: [
          { title: 'Product: MacBook Pro 14" M3', url: 'https://ahtml.dev/demo/products/mbp-14-m3' },
          { title: 'Product: MacBook Pro 16" M3 Pro', url: 'https://ahtml.dev/demo/products/mbp-16-m3' },
          { title: 'Product: Apple Watch Ultra 2', url: 'https://ahtml.dev/demo/products/aw-ultra-2' },
          { title: 'Product: iPad Pro 13" M4', url: 'https://ahtml.dev/demo/products/ipad-pro-m4' },
        ],
      },
      {
        name: 'Machine-readable',
        items: [
          { title: 'Site manifest', url: 'https://ahtml.dev/.well-known/ahtml.json' },
          { title: 'AHTML snapshot (compact)', url: 'https://ahtml.dev/ahtml' },
          { title: 'AHTML snapshot (json)', url: 'https://ahtml.dev/ahtml?fmt=json' },
          { title: 'MCP tools', url: 'https://ahtml.dev/ahtml/mcp.json' },
          { title: 'OpenAPI 3.1', url: 'https://ahtml.dev/ahtml/openapi.json' },
        ],
      },
    ],
    ahtml_manifest_url: 'https://ahtml.dev/.well-known/ahtml.json',
  }),
  ahtmlConfig,
);

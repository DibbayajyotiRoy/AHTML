import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // PostHog reverse proxy (EU). Static/array rewrites must precede the catch-all.
  // https://posthog.com/docs/advanced/proxy/nextjs
  async rewrites() {
    return [
      { source: '/ingest/static/:path*', destination: 'https://eu-assets.i.posthog.com/static/:path*' },
      { source: '/ingest/array/:path*', destination: 'https://eu-assets.i.posthog.com/array/:path*' },
      { source: '/ingest/:path*', destination: 'https://eu.i.posthog.com/:path*' },
    ];
  },
  // PostHog's API uses trailing slashes (e.g. /e/); don't let Next redirect them.
  skipTrailingSlashRedirect: true,
  // npm workspaces symlink workspace packages into node_modules but Next's
  // resolver falls back to TS source for workspace packages. Pinning aliases
  // to the built dist/ files makes resolution deterministic. Build the
  // packages first: `npm run build --workspaces`.
  webpack: (config) => {
    const dist = (p) => path.resolve(__dirname, '../../packages', p);
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      '@ahtmljs/schema$': dist('schema/dist/index.js'),
      '@ahtmljs/next$': dist('next/dist/index.js'),
      '@ahtmljs/next/handler$': dist('next/dist/handler.js'),
      '@ahtmljs/next/well-known$': dist('next/dist/well-known.js'),
      '@ahtmljs/next/llms-txt$': dist('next/dist/llms-txt.js'),
      '@ahtmljs/next/mcp$': dist('next/dist/mcp.js'),
      '@ahtmljs/next/openapi$': dist('next/dist/openapi.js'),
    };
    return config;
  },
};

export default nextConfig;

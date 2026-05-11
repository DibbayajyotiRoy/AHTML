import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // npm workspaces symlink workspace packages into node_modules but Next's
  // resolver falls back to TS source for workspace packages. Pinning aliases
  // to the built dist/ files makes resolution deterministic. Build the
  // packages first: `npm run build --workspaces`.
  webpack: (config) => {
    const dist = (p) => path.resolve(__dirname, '../../packages', p);
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      '@ahtml/schema$': dist('schema/dist/index.js'),
      '@ahtml/next$': dist('next/dist/index.js'),
      '@ahtml/next/handler$': dist('next/dist/handler.js'),
      '@ahtml/next/well-known$': dist('next/dist/well-known.js'),
      '@ahtml/next/llms-txt$': dist('next/dist/llms-txt.js'),
      '@ahtml/next/mcp$': dist('next/dist/mcp.js'),
      '@ahtml/next/openapi$': dist('next/dist/openapi.js'),
    };
    return config;
  },
};

export default nextConfig;

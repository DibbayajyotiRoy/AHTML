/**
 * Canonical AHTML config for the landing.
 *
 * Imported both by next.config.mjs (build-time / framework metadata) and by
 * the route handlers (runtime). Defining it once here means a single source
 * of truth that survives Next.js's runtime boundary between the config and
 * the request handlers.
 */

import type { AHTMLConfig } from '@ahtmljs/next';

export const ahtmlConfig: AHTMLConfig = {
  site: process.env.SITE_URL ?? 'https://github.com/DibbayajyotiRoy/AHTML',
  default_ttl: 600,
  policy: {
    agents_welcome: true,
    license: 'MIT',
    rate_limit: '300/min',
    contact: 'rdibbayajyoti@gmail.com',
    terms_url: 'https://github.com/DibbayajyotiRoy/AHTML#license',
    republish: 'attribution_only',
    caching: { allowed: true, ttl: 600 },
  },
  routes: [
    { path: '/', page_type: 'home' },
    { path: '/demo/products/mbp-14-m3', page_type: 'product_detail' },
    { path: '/demo/products/mbp-16-m3', page_type: 'product_detail' },
    { path: '/demo/products/aw-ultra-2', page_type: 'product_detail' },
    { path: '/demo/products/ipad-pro-m4', page_type: 'product_detail' },
  ],
  emit_mcp: true,
  emit_openapi: true,
};

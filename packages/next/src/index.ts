/**
 * @ahtmljs/next — Next.js plugin.
 *
 * Quickstart:
 *
 *   // next.config.js
 *   import { withAHTML } from '@ahtmljs/next';
 *   export default withAHTML({
 *     // your existing next config
 *   }, {
 *     site: 'https://shop.example.com',
 *     policy: {
 *       agents_welcome: true,
 *       license: 'CC-BY-4.0',
 *       rate_limit: '100/min',
 *       contact: 'agents@example.com',
 *     },
 *   });
 *
 *   // app/ahtml/[...path]/route.ts
 *   import { createAHTMLRoute } from '@ahtmljs/next/handler';
 *   import { buildSnapshot } from '../../lib/ahtml';
 *   export const { GET, HEAD } = createAHTMLRoute(buildSnapshot);
 *
 *   // app/.well-known/ahtml.json/route.ts
 *   import { createWellKnownRoute } from '@ahtmljs/next/well-known';
 *   export const { GET } = createWellKnownRoute();
 */

import type { Policy, VerifyKey } from '@ahtmljs/schema';

export interface AHTMLConfig {
  site: string;
  policy?: Policy;
  /** Default TTL in seconds applied to snapshots that don't set their own. */
  default_ttl?: number;
  /** Routes that should appear in /.well-known/ahtml.json. */
  routes?: Array<{ path: string; page_type: string }>;
  /** Emit MCP tools at /ahtml/mcp.json — default true. */
  emit_mcp?: boolean;
  /** Emit OpenAPI at /ahtml/openapi.json — default true. */
  emit_openapi?: boolean;
  /** v0.9.5: when true, agents without a valid HTTP Message Signature get policy downgrade. */
  verifyAgents?: boolean;
  /** v0.9.5: keys used to verify incoming agent HTTP Message Signatures. */
  agentKeys?: VerifyKey[];
}

let _config: AHTMLConfig | undefined;

export function withAHTML<T extends Record<string, unknown>>(
  nextConfig: T,
  ahtmlConfig: AHTMLConfig,
): T & { __ahtml: AHTMLConfig } {
  _config = ahtmlConfig;
  if (typeof globalThis !== 'undefined') {
    (globalThis as { __ahtml_config?: AHTMLConfig }).__ahtml_config = ahtmlConfig;
  }
  return { ...nextConfig, __ahtml: ahtmlConfig };
}

export function getConfig(): AHTMLConfig {
  if (_config) return _config;
  const g = (globalThis as { __ahtml_config?: AHTMLConfig }).__ahtml_config;
  if (g) return g;
  return {
    site: '',
    policy: { agents_welcome: true },
  };
}

export type { Policy };

export { withPaymentGuard } from './policy.js';

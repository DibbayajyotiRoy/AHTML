/**
 * llms.txt emitter — thin Next.js adapter as of v0.8.0.
 *
 * All rendering logic now lives in `@ahtmljs/schema`'s framework-neutral
 * `buildLlmsTxt`. This module only translates the Next-side `AHTMLConfig`
 * into the schema's `LlmsTxtConfig` and serves the result as a Request →
 * Response handler.
 */

import { buildLlmsTxt, type LegacyLlmsTxtConfig, type LlmsTxtConfig } from '@ahtmljs/schema';
import { getConfig, type AHTMLConfig } from './index.js';

export { buildLlmsTxt } from '@ahtmljs/schema';
export type { LlmsTxtConfig, LegacyLlmsTxtConfig } from '@ahtmljs/schema';

/**
 * v0.8.0: `cfgFn` is polymorphic.
 * - Returns an `AHTMLConfig` → the route shell translates to `LlmsTxtConfig`
 *   (site + routes + contact-derived description).
 * - Returns a rich `LegacyLlmsTxtConfig` (`{title, sections?, ahtml_manifest_url?}`)
 *   → forwarded verbatim; the schema's back-compat renderer emits H2 sections.
 * - Returns the canonical `LlmsTxtConfig` (`{site, ...}`) → forwarded verbatim.
 *
 * v0.4 → v0.7 callers that built a hand-curated llms.txt with sections keep
 * working without any change.
 */
export function createLlmsTxtRoute(
  cfgFn?: () => (AHTMLConfig | LegacyLlmsTxtConfig | LlmsTxtConfig) | Promise<AHTMLConfig | LegacyLlmsTxtConfig | LlmsTxtConfig>,
  configOverride?: AHTMLConfig,
) {
  async function GET(_req: Request): Promise<Response> {
    const resolved = configOverride ?? (cfgFn ? await cfgFn() : getConfig());
    let body: string;
    if (isAhtmlConfig(resolved)) {
      body = buildLlmsTxt({
        site: resolved.site,
        description: resolved.policy?.contact
          ? `Agents welcome — contact: ${resolved.policy.contact}`
          : undefined,
        routes: resolved.routes ?? [],
      });
    } else {
      // LegacyLlmsTxtConfig or LlmsTxtConfig — schema discriminates at render time.
      body = buildLlmsTxt(resolved);
    }
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        'cache-control': 'public, max-age=300',
      },
    });
  }
  return { GET };
}

/** Distinguish an AHTMLConfig (carries `site` + `policy`/`routes`/`default_ttl`) from the LLMs.txt configs (no `policy` field). */
function isAhtmlConfig(c: unknown): c is AHTMLConfig {
  if (!c || typeof c !== 'object') return false;
  const o = c as { site?: unknown; policy?: unknown; default_ttl?: unknown; routes?: unknown; emit_mcp?: unknown; sections?: unknown; title?: unknown };
  // LegacyLlmsTxtConfig has `title` required and (usually) `sections`; canonical LlmsTxtConfig has `site` only.
  // An AHTMLConfig is identified by either `policy`, `default_ttl`, `emit_mcp`, or `emit_openapi`.
  return typeof o.site === 'string' && (
    'policy' in o || 'default_ttl' in o || 'emit_mcp' in o || 'emit_openapi' in o
  );
}

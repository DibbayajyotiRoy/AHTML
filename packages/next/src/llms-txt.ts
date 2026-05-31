/**
 * llms.txt emitter — thin Next.js adapter as of v0.8.0.
 *
 * All rendering logic now lives in `@ahtmljs/schema`'s framework-neutral
 * `buildLlmsTxt`. This module only translates the Next-side `AHTMLConfig`
 * into the schema's `LlmsTxtConfig` and serves the result as a Request →
 * Response handler.
 */

import { buildLlmsTxt } from '@ahtmljs/schema';
import { getConfig, type AHTMLConfig } from './index.js';

export { buildLlmsTxt } from '@ahtmljs/schema';
export type { LlmsTxtConfig } from '@ahtmljs/schema';

export function createLlmsTxtRoute(
  cfgFn?: () => AHTMLConfig | Promise<AHTMLConfig>,
  configOverride?: AHTMLConfig,
) {
  async function GET(_req: Request): Promise<Response> {
    const ahtmlCfg = configOverride ?? (cfgFn ? await cfgFn() : getConfig());
    const body = buildLlmsTxt({
      site: ahtmlCfg.site,
      description: ahtmlCfg.policy?.contact
        ? `Agents welcome — contact: ${ahtmlCfg.policy.contact}`
        : undefined,
      routes: ahtmlCfg.routes ?? [],
    });
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

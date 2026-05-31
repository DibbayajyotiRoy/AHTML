/**
 * @ahtmljs/next — /.well-known/ahtml.json route.
 *
 * As of v0.8.0 this module is a thin Next.js adapter: the manifest is built by
 * the framework-neutral {@link buildWellKnown} in `@ahtmljs/schema`, and this
 * file only owns the Request → Response shell that Next route handlers consume.
 */

import { getConfig, type AHTMLConfig } from './index.js';
import { buildWellKnown, type WellKnownManifest } from '@ahtmljs/schema';

export type { WellKnownManifest };

export function buildManifest(configOverride?: AHTMLConfig): WellKnownManifest {
  const cfg = configOverride ?? getConfig();
  return buildWellKnown({
    site: cfg.site,
    policy: cfg.policy,
    routes: cfg.routes,
    emit_mcp: cfg.emit_mcp,
    emit_openapi: cfg.emit_openapi,
  });
}

export function createWellKnownRoute(configOverride?: AHTMLConfig) {
  function GET(_req: Request): Response {
    const m = buildManifest(configOverride);
    return new Response(JSON.stringify(m, null, 2), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'public, max-age=300, must-revalidate',
        'x-ahtml-version': '0.1',
      },
    });
  }
  return { GET };
}

/**
 * /.well-known/ahtml.json — the site-wide AHTML manifest.
 *
 * Tells agents:
 *   - this site speaks AHTML
 *   - the policy (terms, rate limit, auth scheme, contact)
 *   - the route map (what kinds of pages exist + where to fetch their snapshots)
 *   - where to find the MCP and OpenAPI emissions
 *
 * Single source of truth. Agents fetch this ONCE, then resolve any URL
 * on the site to its snapshot endpoint deterministically.
 */

import { getConfig, type AHTMLConfig } from './index.js';

export interface WellKnownManifest {
  ahtml: '0.1';
  site: string;
  policy: Record<string, unknown>;
  snapshot_url_template: string;
  routes?: Array<{ path: string; page_type: string; snapshot_url: string }>;
  endpoints: {
    snapshot: string;
    diff_param: string;
    mcp?: string;
    openapi?: string;
  };
  formats: Array<{ media_type: string; description: string }>;
  generated_at: string;
}

export function buildManifest(configOverride?: AHTMLConfig): WellKnownManifest {
  const cfg = configOverride ?? getConfig();
  const base = cfg.site.replace(/\/$/, '');
  const snapshotTemplate = `${base}/ahtml/{path}`;
  return {
    ahtml: '0.1',
    site: base,
    policy: (cfg.policy as unknown as Record<string, unknown>) ?? { agents_welcome: true },
    snapshot_url_template: snapshotTemplate,
    routes: cfg.routes?.map((r) => ({
      path: r.path,
      page_type: r.page_type,
      snapshot_url: `${base}/ahtml${r.path.startsWith('/') ? r.path : '/' + r.path}`,
    })),
    endpoints: {
      snapshot: snapshotTemplate,
      diff_param: 'since',
      mcp: cfg.emit_mcp !== false ? `${base}/ahtml/mcp.json` : undefined,
      openapi: cfg.emit_openapi !== false ? `${base}/ahtml/openapi.json` : undefined,
    },
    formats: [
      { media_type: 'application/ahtml+text', description: 'Token-optimal compact text. Default for LLM agents.' },
      { media_type: 'application/ahtml+json', description: 'Canonical JSON. Use for programmatic consumers and signature verification.' },
      { media_type: 'application/ahtml-diff+json', description: 'Returned for ?since=<etag> requests; minimal change list.' },
    ],
    generated_at: new Date().toISOString(),
  };
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

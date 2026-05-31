/**
 * /.well-known/ahtml.json — the site-wide AHTML manifest (framework-neutral).
 *
 * Canonical implementation as of v0.8.0: every framework adapter
 * (`@ahtmljs/next`, `@ahtmljs/vite`, future hono / sveltekit / astro shells)
 * MUST delegate to {@link buildWellKnown} so the wire-format stays bit-identical
 * across runtimes. Adapters keep only their thin Request/Response shell.
 *
 * The manifest tells agents:
 *   - this site speaks AHTML
 *   - the policy (terms, rate limit, auth scheme, contact)
 *   - the route map (what kinds of pages exist + where to fetch their snapshots)
 *   - where to find the MCP and OpenAPI emissions
 *
 * Agents fetch this once, then resolve any URL on the site to its snapshot
 * endpoint deterministically.
 */

import type { Policy } from '../types.js';

/** Route entry as accepted by {@link buildWellKnown}. */
export interface WellKnownRouteInput {
  path: string;
  page_type: string;
}

/** Input to {@link buildWellKnown} — framework-neutral. */
export interface WellKnownConfig {
  /** Canonical site origin, e.g. `"https://example.com"`. Trailing slash is normalized away. */
  site: string;
  /** Optional published policy block. Defaults to `{ agents_welcome: true }`. */
  policy?: Policy;
  /** Declared site routes (path + AHTML page_type). */
  routes?: WellKnownRouteInput[];
  /** Whether to advertise an MCP manifest endpoint. Default: true. */
  emit_mcp?: boolean;
  /** Whether to advertise an OpenAPI document endpoint. Default: true. */
  emit_openapi?: boolean;
}

/** The wire-shape served at `/.well-known/ahtml.json`. */
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

/**
 * Build the AHTML well-known manifest from a framework-neutral config.
 *
 * Pure function: no I/O, deterministic except for `generated_at` (current ISO timestamp).
 * Trailing slashes on `site` are stripped before composing URLs; route paths are
 * normalized to a leading `/` when composing their `snapshot_url`.
 */
export function buildWellKnown(config: WellKnownConfig): WellKnownManifest {
  const base = config.site.replace(/\/$/, '');
  const snapshotTemplate = `${base}/ahtml/{path}`;
  return {
    ahtml: '0.1',
    site: base,
    policy: (config.policy as unknown as Record<string, unknown>) ?? { agents_welcome: true },
    snapshot_url_template: snapshotTemplate,
    routes: config.routes?.map((r) => ({
      path: r.path,
      page_type: r.page_type,
      snapshot_url: `${base}/ahtml${r.path.startsWith('/') ? r.path : '/' + r.path}`,
    })),
    endpoints: {
      snapshot: snapshotTemplate,
      diff_param: 'since',
      mcp: config.emit_mcp !== false ? `${base}/ahtml/mcp.json` : undefined,
      openapi: config.emit_openapi !== false ? `${base}/ahtml/openapi.json` : undefined,
    },
    formats: [
      { media_type: 'application/ahtml+text', description: 'Token-optimal compact text. Default for LLM agents.' },
      { media_type: 'application/ahtml+json', description: 'Canonical JSON. Use for programmatic consumers and signature verification.' },
      { media_type: 'application/ahtml-diff+json', description: 'Returned for ?since=<etag> requests; minimal change list.' },
    ],
    generated_at: new Date().toISOString(),
  };
}

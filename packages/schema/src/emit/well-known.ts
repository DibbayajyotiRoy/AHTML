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
  /** v0.9.5: URL to the RSL 1.0 declaration. Present when policy has content_signals or license. */
  rsl_url?: string;
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
  const policy = config.policy ?? { agents_welcome: true };
  const policyOut: Record<string, unknown> = {
    agents_welcome: policy.agents_welcome,
    ...(policy.license ? { license: policy.license } : {}),
    ...(policy.rate_limit ? { rate_limit: policy.rate_limit } : {}),
    ...(policy.actions_require ? { actions_require: policy.actions_require } : {}),
    ...(policy.contact ? { contact: policy.contact } : {}),
    ...(policy.terms_url ? { terms_url: policy.terms_url } : {}),
    ...(policy.attribution_required !== undefined ? { attribution_required: policy.attribution_required } : {}),
    ...(policy.republish ? { republish: policy.republish } : {}),
    ...(policy.caching ? { caching: policy.caching } : {}),
    ...(policy.verified_agents_only !== undefined ? { verified_agents_only: policy.verified_agents_only } : {}),
    ...(policy.per_agent_policy ? { per_agent_policy: policy.per_agent_policy } : {}),
    ...(policy.content_signals ? { content_signals: policy.content_signals } : {}),
  };
  return {
    ahtml: '0.1',
    site: base,
    policy: policyOut,
    ...(policy.content_signals || policy.license ? { rsl_url: `${base}/rsl.txt` } : {}),
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

/**
 * llms.txt emitter — framework-neutral.
 *
 * Canonical implementation as of v0.8.0: every framework adapter
 * (`@ahtmljs/next`, `@ahtmljs/vite`, future hono / sveltekit / astro shells)
 * MUST delegate to {@link buildLlmsTxt}. Adapters keep only the request
 * handler that serves the returned string at `/llms.txt` with
 * `text/markdown; charset=utf-8`.
 *
 * Compatibility shim with Jeremy Howard's convention (Sept 2024). ~10% of
 * sites adopted as of May 2026; used by Cursor / Continue / Cline /
 * Mintlify-style IDE agents. AHTML is a strict superset: adopters get both
 * lanes for free from a single route declaration.
 *
 * Format reference: https://llmstxt.org
 *
 *   # Site Name
 *
 *   > One-line description of the site
 *
 *   ## Section
 *
 *   - [Page title](url): one-line description
 */

import type { Snapshot } from '../types.js';

/** Route entry as accepted by {@link buildLlmsTxt}. */
export interface LlmsTxtRouteInput {
  path: string;
  page_type: string;
}

/** Input to {@link buildLlmsTxt} — framework-neutral. */
export interface LlmsTxtConfig {
  /** Canonical site origin, e.g. `"https://example.com"`. Trailing slash is normalized away. */
  site: string;
  /** Optional H1 override. Defaults to the URL host parsed from `site`. */
  title?: string;
  /** Optional blockquote one-liner. Defaults to `"AHTML-enabled site"`. */
  description?: string;
  /** Declared site routes (path + AHTML page_type). */
  routes?: LlmsTxtRouteInput[];
}

/**
 * Pre-v0.8 (v0.4 → v0.7) rich-sections shape — kept as a back-compat
 * overload so direct callers don't need to rewrite. Use {@link LlmsTxtConfig}
 * for new code; this shape is also accepted but no longer the canonical form.
 */
export interface LegacyLlmsTxtConfig {
  /** H1 (required in the legacy shape). */
  title: string;
  /** Optional blockquote one-liner. */
  description?: string;
  /** Optional grouped sections — each becomes an `## H2` block. */
  sections?: Array<{
    name: string;
    items?: Array<{ title: string; url: string; description?: string }>;
  }>;
  /** Optional pointer appended as `## Machine-readable` → AHTML manifest. */
  ahtml_manifest_url?: string;
}

/** Type guard for the v0.4–v0.7 legacy shape (lacks `site`, may carry `sections`). */
function isLegacyConfig(c: LlmsTxtConfig | LegacyLlmsTxtConfig): c is LegacyLlmsTxtConfig {
  return !('site' in c) || (c as { site?: unknown }).site === undefined;
}

/**
 * Build the `llms.txt` body for a site.
 *
 * v0.8.0+ canonical shape: `{ site, title?, description?, routes? }` — emits a
 * single `## Pages` section listing each route plus a `## Machine-readable`
 * pointer to the well-known AHTML manifest. When `snaps` is provided, snapshot
 * URLs not already covered by `routes` are appended (deduped by absolute URL).
 *
 * Back-compat: also accepts the v0.4 → v0.7 rich shape
 * `{ title, description?, sections?, ahtml_manifest_url? }`. In that mode each
 * section becomes an `## H2` block and `ahtml_manifest_url` is appended as
 * `## Machine-readable`. Detected automatically — no flag required.
 */
export function buildLlmsTxt(
  config: LlmsTxtConfig | LegacyLlmsTxtConfig,
  snaps?: Snapshot[],
): string {
  if (isLegacyConfig(config)) return buildLegacy(config);
  const base = config.site.replace(/\/$/, '');
  const title = config.title ?? hostFromUrl(config.site);
  const description = config.description ?? 'AHTML-enabled site';

  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`> ${description}`);
  lines.push('');

  lines.push('## Pages');
  lines.push('');

  const seen = new Set<string>();
  for (const r of config.routes ?? []) {
    const url = base + (r.path.startsWith('/') ? r.path : '/' + r.path);
    if (seen.has(url)) continue;
    seen.add(url);
    lines.push(`- [${r.path}](${url}): ${r.page_type}`);
  }

  // Optional: surface snapshot URLs not already covered by configured routes.
  // Lets sites that build snapshots dynamically still appear in /llms.txt.
  for (const s of snaps ?? []) {
    if (seen.has(s.url)) continue;
    seen.add(s.url);
    const label = s.url.startsWith(base) ? s.url.slice(base.length) || '/' : s.url;
    lines.push(`- [${label}](${s.url}): ${s.page_type}`);
  }
  lines.push('');

  lines.push('## Machine-readable');
  lines.push('');
  lines.push(`- [AHTML manifest](${base}/.well-known/ahtml.json): Structured semantic snapshots, typed actions, MCP-compatible tools, OpenAPI`);
  lines.push('');

  return lines.join('\n');
}

/** Best-effort host extraction. Falls back to the raw string for non-URLs. */
function hostFromUrl(u: string): string {
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
}

/**
 * v0.4 → v0.7 legacy renderer. Kept as a back-compat path so direct callers
 * who passed `{title, description, sections, ahtml_manifest_url}` continue to
 * produce the same output they did pre-v0.8.
 */
function buildLegacy(cfg: LegacyLlmsTxtConfig): string {
  const lines: string[] = [];
  lines.push(`# ${cfg.title}`);
  lines.push('');
  if (cfg.description) {
    lines.push(`> ${cfg.description}`);
    lines.push('');
  }

  const sections = cfg.sections && cfg.sections.length
    ? cfg.sections
    : [{ name: 'Pages', items: [] as Array<{ title: string; url: string; description?: string }> }];

  for (const section of sections) {
    lines.push(`## ${section.name}`);
    lines.push('');
    for (const item of section.items ?? []) {
      const desc = item.description ? `: ${item.description}` : '';
      lines.push(`- [${item.title}](${item.url})${desc}`);
    }
    lines.push('');
  }

  if (cfg.ahtml_manifest_url) {
    lines.push('## Machine-readable');
    lines.push('');
    lines.push(`- [AHTML manifest](${cfg.ahtml_manifest_url}): Structured semantic snapshots, typed actions, MCP-compatible tools, OpenAPI`);
    lines.push('');
  }

  return lines.join('\n');
}

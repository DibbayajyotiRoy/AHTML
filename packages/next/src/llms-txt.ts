/**
 * llms.txt emitter — compatibility shim with Jeremy Howard's convention
 * (Sept 2024). ~10% of sites adopted as of May 2026; used by Cursor /
 * Continue / Cline / Mintlify-style IDE agents.
 *
 * AHTML is a strict superset. We auto-emit /llms.txt from the same
 * configured routes that feed /.well-known/ahtml.json — adopters get
 * both lanes for free, with zero extra work.
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

import { getConfig, type AHTMLConfig } from './index.js';

export interface LlmsTxtConfig {
  /** The H1 of the file. Defaults to URL host. */
  title?: string;
  /** Blockquote one-liner under the title. */
  description?: string;
  /** Optional content groupings — defaults to one untitled section. */
  sections?: Array<{
    name: string;
    items?: Array<{ title: string; url: string; description?: string }>;
  }>;
  /** Optional pointer to fuller AHTML manifest. */
  ahtml_manifest_url?: string;
}

export function buildLlmsTxt(cfg: LlmsTxtConfig): string {
  const lines: string[] = [];
  lines.push(`# ${cfg.title ?? 'Site'}`);
  lines.push('');
  if (cfg.description) {
    lines.push(`> ${cfg.description}`);
    lines.push('');
  }

  const sections = cfg.sections && cfg.sections.length
    ? cfg.sections
    : [{ name: 'Pages', items: [] }];

  for (const section of sections) {
    lines.push(`## ${section.name}`);
    lines.push('');
    for (const item of section.items ?? []) {
      const tail = item.description ? `: ${item.description}` : '';
      lines.push(`- [${item.title}](${item.url})${tail}`);
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

export function createLlmsTxtRoute(
  cfgFn?: () => LlmsTxtConfig | Promise<LlmsTxtConfig>,
  configOverride?: AHTMLConfig,
) {
  async function GET(_req: Request): Promise<Response> {
    const ahtmlCfg = configOverride ?? getConfig();
    const cfg: LlmsTxtConfig = cfgFn
      ? await cfgFn()
      : {
          title: hostFromUrl(ahtmlCfg.site),
          description: ahtmlCfg.policy?.contact ? `Agents welcome — contact: ${ahtmlCfg.policy.contact}` : undefined,
          sections: [
            {
              name: 'Pages',
              items: (ahtmlCfg.routes ?? []).map((r) => ({
                title: r.path,
                url: ahtmlCfg.site.replace(/\/$/, '') + r.path,
                description: r.page_type,
              })),
            },
          ],
          ahtml_manifest_url: ahtmlCfg.site.replace(/\/$/, '') + '/.well-known/ahtml.json',
        };
    const body = buildLlmsTxt(cfg);
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

function hostFromUrl(u: string): string {
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
}

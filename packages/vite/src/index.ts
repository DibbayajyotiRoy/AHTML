/**
 * @ahtmljs/vite — Vite plugin for AHTML.
 *
 * Adds three endpoints to any Vite-based dev server (or production
 * Vite-built site behind any Node serve):
 *
 *   GET /ahtml/<path>           → AHTML snapshot (compact / json / diff)
 *   GET /.well-known/ahtml.json → site manifest
 *   GET /llms.txt               → Jeremy Howard convention shim
 *
 * Usage:
 *
 *   // vite.config.ts
 *   import { ahtml } from '@ahtmljs/vite';
 *   export default defineConfig({
 *     plugins: [
 *       ahtml({
 *         site: 'https://shop.com',
 *         policy: { agents_welcome: true, rate_limit: '100/min' },
 *         buildSnapshot: async (path, req) => {
 *           // your snapshot logic here
 *         },
 *       }),
 *     ],
 *   });
 *
 * Works with SvelteKit, SolidStart, vanilla Vite, and any framework that
 * accepts Vite plugins. For Astro, prefer @ahtmljs/astro (similar shape).
 */

import { toJson, toCompact, computeEtag, diff, type Snapshot, type Policy } from '@ahtmljs/schema';

// Minimal Vite plugin type — we don't depend on Vite at runtime (peerDep).
interface ViteServer {
  middlewares: {
    use: (handler: (req: IncomingLike, res: ServerResponseLike, next: () => void) => void) => void;
  };
}
interface VitePluginShape {
  name: string;
  configureServer?(server: ViteServer): void;
}

interface IncomingLike {
  url?: string;
  method?: string;
  headers: Record<string, string | string[] | undefined>;
}
interface ServerResponseLike {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string | null): void;
  writableEnded?: boolean;
}

export interface AHTMLViteConfig {
  /** Canonical public site URL (used in snapshot URLs + the well-known manifest). */
  site: string;
  /** Site-level policy. Required: `agents_welcome`. */
  policy?: Policy;
  /** Default TTL in seconds applied to snapshots that don't set their own. */
  default_ttl?: number;
  /** Routes for /.well-known/ahtml.json discovery. */
  routes?: Array<{ path: string; page_type: string }>;
  /**
   * Build a snapshot for a given path. Return null for paths that have no
   * agent representation. Same signature as @ahtmljs/next's createAHTMLRoute.
   */
  buildSnapshot: (pathSegments: string[], req: { url: string; headers: Record<string, string | undefined> }) => Promise<Snapshot | null> | Snapshot | null;
  /** Custom contact for the auto-generated /llms.txt. */
  llms_contact?: string;
  /** Emit MCP / OpenAPI manifests (default: true). */
  emit_mcp?: boolean;
  emit_openapi?: boolean;
}

export function ahtml(config: AHTMLViteConfig): VitePluginShape {
  // Per-process snapshot cache for the diff endpoint.
  const cache = new Map<string, Snapshot>();

  return {
    name: '@ahtmljs/vite',
    configureServer(server: ViteServer) {
      server.middlewares.use(async (req, res, next) => {
        const reqUrl = req.url ?? '/';
        const fullUrl = config.site.replace(/\/$/, '') + reqUrl;
        try {
          // /.well-known/ahtml.json
          if (reqUrl === '/.well-known/ahtml.json' || reqUrl.startsWith('/.well-known/ahtml.json?')) {
            return wellKnown(config, res);
          }
          // /llms.txt
          if (reqUrl === '/llms.txt' || reqUrl.startsWith('/llms.txt?')) {
            return llmsTxt(config, res);
          }
          // /ahtml/<path>
          if (reqUrl === '/ahtml' || reqUrl.startsWith('/ahtml/') || reqUrl.startsWith('/ahtml?')) {
            return ahtmlRoute(config, cache, req, res, fullUrl, reqUrl);
          }
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: 'snapshot_failed', detail: String(err) }));
          return;
        }
        next();
      });
    },
  };
}

async function ahtmlRoute(
  config: AHTMLViteConfig,
  cache: Map<string, Snapshot>,
  req: IncomingLike,
  res: ServerResponseLike,
  fullUrl: string,
  reqUrl: string,
) {
  // Strip /ahtml prefix + parse query
  const [pathPart, queryPart] = reqUrl.replace(/^\/ahtml\/?/, '').split('?');
  const segments = (pathPart ?? '').split('/').filter(Boolean);
  const query = new URLSearchParams(queryPart ?? '');

  const headerObj: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    headerObj[k.toLowerCase()] = Array.isArray(v) ? v.join(',') : v;
  }

  // Policy gate
  if (config.policy?.agents_welcome === false) {
    res.statusCode = 403;
    res.setHeader('content-type', 'application/json');
    res.setHeader('x-ahtml-policy', 'agents_not_welcome');
    res.end(JSON.stringify({ error: 'agents_not_welcome' }));
    return;
  }

  // Special endpoints: /ahtml/mcp.json and /ahtml/openapi.json (lazy emit)
  if (segments.length === 1 && segments[0] === 'mcp.json' && config.emit_mcp !== false) {
    // Minimal MCP shape — collect from cached snapshots
    const tools: unknown[] = [];
    for (const snap of cache.values()) {
      for (const action of snap.actions) {
        tools.push({
          name: `${snap.page_type}.${action.id}`,
          description: action.label ?? action.category ?? action.id,
          inputSchema: action.input ?? { type: 'object' },
          annotations: {
            auth: action.auth, cost: action.cost, reversible: action.reversible,
            side_effects: action.side_effects, confirmation: action.confirmation,
            execute_url: action.execute_url, snapshot_url: snap.url,
          },
        });
      }
    }
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ schema_version: '0.1', server: { name: config.site, url: config.site }, tools }, null, 2));
    return;
  }

  let snap: Snapshot | null;
  try {
    snap = await config.buildSnapshot(segments, { url: fullUrl, headers: headerObj });
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'snapshot_build_failed', detail: String(err) }));
    return;
  }
  if (!snap) {
    res.statusCode = 404;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'no_snapshot' }));
    return;
  }

  // Apply defaults
  if (config.policy && !snap.policy) snap.policy = config.policy;
  if (config.default_ttl && snap.ttl == null) snap.ttl = config.default_ttl;

  const etag = snap.etag ?? computeEtag(snap);
  snap.etag = etag;
  const cacheKey = snap.url;

  // Diff endpoint via ?since=<etag>
  const sinceEtag = query.get('since');
  if (sinceEtag) {
    const prev = cache.get(cacheKey);
    if (prev && (prev.etag === sinceEtag || computeEtag(prev) === sinceEtag)) {
      const d = diff(prev, snap);
      cache.set(cacheKey, snap);
      if (d.changes.length === 0) {
        res.statusCode = 304;
        res.setHeader('etag', etag);
        res.end();
        return;
      }
      res.statusCode = 200;
      res.setHeader('content-type', 'application/ahtml-diff+json');
      res.setHeader('etag', etag);
      res.setHeader('cache-control', cacheControl(snap, config));
      res.setHeader('x-ahtml-version', '0.1');
      res.end(JSON.stringify(d));
      return;
    }
  }

  // Conditional GET
  const ifNoneMatch = headerObj['if-none-match'];
  if (ifNoneMatch === etag) {
    res.statusCode = 304;
    res.setHeader('etag', etag);
    res.setHeader('cache-control', cacheControl(snap, config));
    res.end();
    return;
  }

  cache.set(cacheKey, snap);
  const fmt = pickFormat(headerObj['accept'] ?? '');
  const body = fmt === 'json' ? toJson(snap) : toCompact(snap);
  res.statusCode = 200;
  res.setHeader('content-type', fmt === 'json' ? 'application/ahtml+json' : 'application/ahtml+text; charset=utf-8');
  res.setHeader('etag', etag);
  res.setHeader('cache-control', cacheControl(snap, config));
  res.setHeader('last-modified', new Date(snap.fetched_at).toUTCString());
  res.setHeader('x-ahtml-version', '0.1');
  res.setHeader('vary', 'Accept');
  res.end(body);
}

function wellKnown(config: AHTMLViteConfig, res: ServerResponseLike) {
  const base = config.site.replace(/\/$/, '');
  const manifest = {
    ahtml: '0.1',
    site: base,
    policy: config.policy ?? { agents_welcome: true },
    snapshot_url_template: `${base}/ahtml/{path}`,
    routes: config.routes?.map((r) => ({
      path: r.path,
      page_type: r.page_type,
      snapshot_url: `${base}/ahtml${r.path.startsWith('/') ? r.path : '/' + r.path}`,
    })),
    endpoints: {
      snapshot: `${base}/ahtml/{path}`,
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
    generated_by: '@ahtmljs/vite 0.1.0',
  };
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'public, max-age=300');
  res.end(JSON.stringify(manifest, null, 2));
}

function llmsTxt(config: AHTMLViteConfig, res: ServerResponseLike) {
  const base = config.site.replace(/\/$/, '');
  const host = (() => {
    try { return new URL(base).host; } catch { return base; }
  })();
  const lines: string[] = [];
  lines.push(`# ${host}`);
  lines.push('');
  if (config.llms_contact ?? config.policy?.contact) {
    lines.push(`> Agents welcome. Contact: ${config.llms_contact ?? config.policy?.contact}`);
    lines.push('');
  }
  if (config.routes?.length) {
    lines.push('## Pages');
    lines.push('');
    for (const route of config.routes) {
      lines.push(`- [${route.path}](${base}${route.path}): ${route.page_type}`);
    }
    lines.push('');
  }
  lines.push('## Machine-readable');
  lines.push('');
  lines.push(`- [AHTML manifest](${base}/.well-known/ahtml.json): structured semantic snapshots, typed actions, MCP-compatible tools, OpenAPI`);
  lines.push('');
  res.statusCode = 200;
  res.setHeader('content-type', 'text/markdown; charset=utf-8');
  res.setHeader('cache-control', 'public, max-age=300');
  res.end(lines.join('\n'));
}

function cacheControl(snap: Snapshot, config: AHTMLViteConfig): string {
  const ttl = snap.ttl ?? config.default_ttl ?? 60;
  return `public, max-age=${ttl}, must-revalidate`;
}

function pickFormat(accept: string): 'json' | 'compact' {
  if (/application\/ahtml\+json/.test(accept)) return 'json';
  if (/application\/ahtml\+text/.test(accept)) return 'compact';
  if (/application\/json/.test(accept) && !/text/.test(accept)) return 'json';
  return 'compact';
}

export type { Snapshot, Policy } from '@ahtmljs/schema';

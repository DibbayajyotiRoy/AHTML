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

  // Special endpoints: /ahtml/mcp.json and /ahtml/openapi.json (lazy emit
  // from the snapshot cache; cold cache produces empty tools/paths — call a
  // /ahtml/<page> first to warm it).
  if (segments.length === 1 && segments[0] === 'mcp.json' && config.emit_mcp !== false) {
    const tools: unknown[] = [];
    for (const snap of cache.values()) {
      for (const action of snap.actions) {
        // Strip raw $refs — the schema component they reference may not exist
        // on the consuming end, and bare $refs produce invalid MCP. Same
        // policy as @ahtmljs/next's mcp emitter.
        const inputSchema =
          action.input && '$ref' in action.input
            ? { type: 'object' }
            : action.input ?? { type: 'object', properties: {} };
        tools.push({
          name: `${snap.page_type}.${action.id}`,
          description: action.label ?? action.category ?? action.id,
          inputSchema,
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
  if (segments.length === 1 && segments[0] === 'openapi.json' && config.emit_openapi !== false) {
    const doc = mkOpenApiDoc(config, cache);
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(doc, null, 2));
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

/**
 * Minimal OpenAPI 3.1 emission for the vite plugin. Lives here rather than
 * importing @ahtmljs/next because vite shouldn't depend on the Next adapter;
 * the duplication will be removed once the shared framework-neutral helpers
 * land in @ahtmljs/schema.
 */
function mkOpenApiDoc(
  config: AHTMLViteConfig,
  cache: Map<string, Snapshot>,
): Record<string, unknown> {
  const baseUrl = config.site.replace(/\/$/, '');
  const paths: Record<string, Record<string, unknown>> = {};
  const securitySchemes: Record<string, unknown> = {};

  for (const snap of cache.values()) {
    const p = snap.url.replace(baseUrl, '') || '/';
    paths['/ahtml' + p] = {
      get: {
        summary: `AHTML snapshot of ${p}`,
        responses: {
          '200': {
            description: 'snapshot',
            content: {
              'application/ahtml+text': { schema: { type: 'string' } },
              'application/ahtml+json': { schema: { $ref: '#/components/schemas/Snapshot' } },
            },
          },
          '304': { description: 'not modified' },
        },
      },
    };

    for (const a of snap.actions) {
      if (!a.execute_url) continue;
      const verb = (a.method ?? 'post').toLowerCase();
      const op: Record<string, unknown> = {
        summary: a.label ?? a.id,
        operationId: a.id,
        responses: { '200': { description: 'success' } },
      };
      if (a.input) op.requestBody = { content: { 'application/json': { schema: a.input } } };
      if (a.auth && a.auth !== 'none') {
        if (typeof a.auth === 'string') {
          securitySchemes.bearer ??= { type: 'http', scheme: 'bearer' };
          op.security = [{ bearer: [] }];
        } else {
          securitySchemes[a.auth.scheme] ??= { type: 'http', scheme: a.auth.scheme };
          op.security = [{ [a.auth.scheme]: a.auth.scopes ?? [] }];
        }
      }
      (paths[a.execute_url] ??= {})[verb] = op;
    }
  }

  return {
    openapi: '3.1.0',
    info: { title: config.site, version: '1.0.0' },
    servers: [{ url: baseUrl }],
    paths,
    components: {
      schemas: {
        Snapshot: { $ref: 'https://raw.githubusercontent.com/DibbayajyotiRoy/AHTML/main/packages/schema/src/schema.json' },
      },
      ...(Object.keys(securitySchemes).length > 0 && { securitySchemes }),
    },
  };
}

/**
 * RFC 7231 q-value aware Accept parsing. Mirror of next/handler.ts#chooseFormat;
 * the two will be unified into @ahtmljs/schema once we extract the shared
 * framework-neutral helpers (tracked: issue #29 in v0.4 audit).
 */
function pickFormat(accept: string): 'json' | 'compact' {
  if (!accept) return 'compact';
  let bestJson = -1;
  let bestCompact = -1;
  for (const raw of accept.split(',')) {
    const parts = raw.trim().split(';').map((p) => p.trim());
    const type = (parts.shift() ?? '').toLowerCase();
    if (!type) continue;
    let q = 1;
    for (const p of parts) {
      const m = p.match(/^q=([0-9]*\.?[0-9]+)$/i);
      if (m) q = Math.max(0, Math.min(1, parseFloat(m[1]!)));
    }
    if (type === 'application/ahtml+json' || type === 'application/json') {
      if (q > bestJson) bestJson = q;
    } else if (type === 'application/ahtml+text' || type === 'text/plain') {
      if (q > bestCompact) bestCompact = q;
    }
  }
  if (bestJson < 0 && bestCompact < 0) return 'compact';
  return bestJson >= bestCompact ? 'json' : 'compact';
}

export type { Snapshot, Policy } from '@ahtmljs/schema';

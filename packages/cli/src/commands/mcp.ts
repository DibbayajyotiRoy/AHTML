/**
 * `ahtml mcp <url>` — stdio MCP proxy (JSON-RPC 2.0).
 *
 * Turns any URL into a local MCP server over stdio. AHTML adopters get
 * manifest-driven routes and actions; plain HTML sites get auto-extracted
 * snapshots via the schema extractors.
 *
 * Usage:
 *   claude mcp add ahtml -- npx @ahtmljs/cli mcp https://shop.example.com
 */

import {
  snapshot,
  toCompact,
} from '@ahtmljs/schema';
import {
  extractFromSchemaOrg,
  extractFromOpenGraph,
  extractFromDataAttrs,
  extractFromMicrodata,
  mergeExtractions,
} from '@ahtmljs/schema/extract';
import { fetchHtml } from '../fetch.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface WellKnownRoute {
  path: string;
  page_type: string;
  snapshot_url: string;
}

interface WellKnownManifest {
  ahtml: string;
  site: string;
  snapshot_url_template?: string;
  routes?: WellKnownRoute[];
  endpoints?: {
    snapshot?: string;
    mcp?: string;
    openapi?: string;
  };
}

interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
}

interface JsonRpcRequest {
  jsonrpc: string;
  id?: unknown;
  method: string;
  params?: unknown;
}

// ── JSON-RPC helpers ─────────────────────────────────────────────────────────

function sendResponse(id: unknown, result: unknown): void {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

function sendError(id: unknown, code: number, message: string): void {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
}

// ── Sitemap parser ───────────────────────────────────────────────────────────

function parseLocElements(xml: string): string[] {
  const locs: string[] = [];
  const re = /<loc>\s*(https?:\/\/[^\s<]+)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) locs.push(m[1]!.trim());
  return locs;
}

// ── Auto-extract snapshot for non-AHTML sites ────────────────────────────────

async function fetchPageCompact(pageUrl: string): Promise<string> {
  const html = await fetchHtml(pageUrl);
  const schemaOrg = extractFromSchemaOrg(html);
  const openGraph = extractFromOpenGraph(html);
  const dataAttrs = extractFromDataAttrs(html);
  const microdata = extractFromMicrodata(html);
  const merged = mergeExtractions([dataAttrs, schemaOrg, microdata, openGraph]);
  const pageType = (merged.page_type as Parameters<typeof snapshot>[1]) ?? 'other';
  let builder = snapshot(pageUrl, pageType);
  for (const entity of merged.entities) builder = builder.add(entity);
  for (const action of merged.actions) builder = builder.action(action);
  const snap = builder.build();
  return toCompact(snap);
}

// ── Main export ──────────────────────────────────────────────────────────────

export async function runMcp(targetUrl: string): Promise<number> {
  // 1. Normalize URL
  const siteUrl = targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`;
  const origin = new URL(siteUrl).origin;

  // 2. Probe /.well-known/ahtml.json (suppress all errors)
  let manifest: WellKnownManifest | null = null;
  try {
    const res = await fetch(`${origin}/.well-known/ahtml.json`, {
      headers: { accept: 'application/json', 'user-agent': 'AHTML-CLI/0.9.3' },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      manifest = (await res.json()) as WellKnownManifest;
    }
  } catch {
    // Not an AHTML adopter — that's fine
  }

  process.stderr.write(`[ahtml mcp] Starting proxy for ${siteUrl}\n`);
  process.stderr.write(
    `[ahtml mcp] Site type: ${manifest ? 'AHTML adopter' : 'HTML site (auto-extract)'}\n`,
  );

  // 3. Cache sitemap URLs for non-adopters (lazy — fetched on first use)
  let sitemapUrls: string[] | null = null;
  async function getSitemapUrls(): Promise<string[]> {
    if (sitemapUrls !== null) return sitemapUrls;
    try {
      const xml = await fetchHtml(`${origin}/sitemap.xml`);
      sitemapUrls = parseLocElements(xml).slice(0, 50);
    } catch {
      sitemapUrls = [];
    }
    return sitemapUrls;
  }

  // 4. Build tools list
  function buildTools(): McpTool[] {
    const tools: McpTool[] = [
      {
        name: 'fetch_page',
        description:
          'Fetch a page and return its structured AHTML snapshot. For non-AHTML sites, auto-extracts JSON-LD, OpenGraph, and Microdata into typed entities.',
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'The full URL of the page to fetch.' },
          },
          required: ['url'],
        },
      },
      {
        name: 'list_pages',
        description:
          'List known pages on this site. Returns URL, title, and page type for each page.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'search',
        description: 'Search for pages by keyword. Matches page URLs and titles.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Keyword to search for in page URLs and titles.' },
          },
          required: ['query'],
        },
      },
    ];

    // invoke_action only for AHTML adopters that declare actions
    if (manifest) {
      tools.push({
        name: 'invoke_action',
        description:
          'Invoke an action defined by the AHTML server (e.g. add_to_cart, submit_form).',
        inputSchema: {
          type: 'object',
          properties: {
            page_url: { type: 'string', description: 'URL of the page that owns the action.' },
            action_id: { type: 'string', description: 'The action ID to invoke.' },
            args: { type: 'object', description: 'Optional arguments to pass to the action.' },
          },
          required: ['page_url', 'action_id'],
        },
      });
    }

    return tools;
  }

  // 5. Tool handlers

  async function handleFetchPage(args: Record<string, unknown>): Promise<string> {
    const url = String(args.url ?? '');
    if (!url) return 'Error: url argument is required';
    try {
      if (manifest) {
        // AHTML adopter: use the snapshot endpoint
        const encodedPath = encodeURIComponent(new URL(url).pathname);
        const snapUrl = `${origin}/ahtml/${encodedPath}`;
        const res = await fetch(snapUrl, {
          headers: { accept: 'application/ahtml+text,*/*;q=0.8', 'user-agent': 'AHTML-CLI/0.9.3' },
          signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
        return await res.text();
      } else {
        return await fetchPageCompact(url);
      }
    } catch (err) {
      return `Error fetching page: ${(err as Error)?.message ?? String(err)}`;
    }
  }

  async function handleListPages(): Promise<string> {
    if (manifest?.routes && manifest.routes.length > 0) {
      const pages = manifest.routes.map((r) => ({
        url: `${origin}${r.path.startsWith('/') ? r.path : '/' + r.path}`,
        title: r.path === '/' ? 'Home' : r.path.replace(/^\//, '').replace(/[-_/]/g, ' '),
        page_type: r.page_type,
      }));
      return JSON.stringify(pages, null, 2);
    }

    // Non-adopter: try sitemap
    const urls = await getSitemapUrls();
    if (urls.length > 0) {
      const pages = urls.map((u) => ({
        url: u,
        title: new URL(u).pathname === '/'
          ? 'Home'
          : new URL(u).pathname.replace(/^\//, '').replace(/[-_/]/g, ' '),
        page_type: 'unknown',
      }));
      return JSON.stringify(pages, null, 2);
    }

    // Fallback
    return JSON.stringify([{ url: siteUrl, title: 'Home', page_type: 'home' }], null, 2);
  }

  async function handleSearch(args: Record<string, unknown>): Promise<string> {
    const query = String(args.query ?? '').toLowerCase();
    if (!query) return JSON.stringify([]);

    if (manifest?.routes && manifest.routes.length > 0) {
      const results = manifest.routes
        .filter((r) => r.path.toLowerCase().includes(query) || r.page_type.toLowerCase().includes(query))
        .map((r) => ({
          url: `${origin}${r.path.startsWith('/') ? r.path : '/' + r.path}`,
          title: r.path === '/' ? 'Home' : r.path.replace(/^\//, '').replace(/[-_/]/g, ' '),
          relevance_hint: `Matched route path: ${r.path}`,
        }));
      return JSON.stringify(results, null, 2);
    }

    // Non-adopter: search sitemap
    const urls = await getSitemapUrls();
    const results = urls
      .filter((u) => u.toLowerCase().includes(query))
      .map((u) => ({
        url: u,
        title: new URL(u).pathname === '/'
          ? 'Home'
          : new URL(u).pathname.replace(/^\//, '').replace(/[-_/]/g, ' '),
        relevance_hint: `Matched URL: ${u}`,
      }));
    return JSON.stringify(results, null, 2);
  }

  async function handleInvokeAction(args: Record<string, unknown>): Promise<string> {
    const pageUrl = String(args.page_url ?? '');
    const actionId = String(args.action_id ?? '');
    const actionArgs = (args.args ?? {}) as Record<string, unknown>;

    if (!pageUrl || !actionId) return 'Error: page_url and action_id are required';

    try {
      // Fetch the AHTML snapshot for the page to find the action
      const encodedPath = encodeURIComponent(new URL(pageUrl).pathname);
      const snapUrl = `${origin}/ahtml/${encodedPath}`;
      const res = await fetch(snapUrl, {
        headers: { accept: 'application/ahtml+json', 'user-agent': 'AHTML-CLI/0.9.3' },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching snapshot`);

      const snap = await res.json() as { actions?: Array<{ id: string; execute_url?: string; [k: string]: unknown }> };
      const action = snap.actions?.find((a) => a.id === actionId);

      if (!action) return `Error: action "${actionId}" not found on ${pageUrl}`;

      if (action.execute_url) {
        const execRes = await fetch(action.execute_url as string, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'user-agent': 'AHTML-CLI/0.9.3' },
          body: JSON.stringify(actionArgs),
          signal: AbortSignal.timeout(30_000),
        });
        if (!execRes.ok) throw new Error(`HTTP ${execRes.status} invoking action`);
        return await execRes.text();
      }

      // No execute_url — return the action metadata
      return JSON.stringify(action, null, 2);
    } catch (err) {
      return `Error invoking action: ${(err as Error)?.message ?? String(err)}`;
    }
  }

  // 6. Request dispatcher

  async function handleRequest(line: string): Promise<void> {
    let req: JsonRpcRequest;
    try {
      req = JSON.parse(line) as JsonRpcRequest;
    } catch {
      sendError(null, -32700, 'Parse error');
      return;
    }

    const { id, method, params } = req;

    switch (method) {
      case 'initialize':
        sendResponse(id, {
          protocolVersion: '2024-11-05',
          serverInfo: { name: 'ahtml-mcp', version: '0.9.3' },
          capabilities: { tools: {} },
        });
        return;

      case 'notifications/initialized':
        // One-way notification — no response
        return;

      case 'tools/list':
        sendResponse(id, { tools: buildTools() });
        return;

      case 'tools/call': {
        const p = params as { name?: string; arguments?: Record<string, unknown> } | undefined;
        const toolName = p?.name ?? '';
        const toolArgs = p?.arguments ?? {};

        let resultText: string;
        switch (toolName) {
          case 'fetch_page':
            resultText = await handleFetchPage(toolArgs);
            break;
          case 'list_pages':
            resultText = await handleListPages();
            break;
          case 'search':
            resultText = await handleSearch(toolArgs);
            break;
          case 'invoke_action':
            if (!manifest) {
              resultText = 'Error: invoke_action is only available for AHTML adopter sites';
            } else {
              resultText = await handleInvokeAction(toolArgs);
            }
            break;
          default:
            sendError(id, -32602, `Unknown tool: ${toolName}`);
            return;
        }

        sendResponse(id, { content: [{ type: 'text', text: resultText }] });
        return;
      }

      default:
        sendError(id, -32601, 'Method not found');
    }
  }

  // 7. stdin reading loop

  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk: string) => {
    buf += chunk;
    let nl: number;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) {
        // fire-and-forget per message
        handleRequest(line).catch((err: unknown) => {
          process.stderr.write(`[ahtml mcp] handler error: ${String(err)}\n`);
        });
      }
    }
  });

  return new Promise<number>((resolve) => {
    process.stdin.on('end', () => resolve(0));
    process.stdin.on('error', () => resolve(1));
  });
}

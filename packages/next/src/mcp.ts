/**
 * Emit MCP (Model Context Protocol) tool definitions from AHTML actions.
 *
 * Any AHTML snapshot already carries typed action contracts. By emitting
 * those at /ahtml/mcp.json, the site automatically exposes itself as an
 * MCP server-compatible tool surface — no separate MCP server required.
 */

import type { Snapshot, Action } from '@ahtml/schema';

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

export interface McpManifest {
  schema_version: '0.1';
  server: { name: string; url: string };
  tools: McpToolDefinition[];
}

export function snapshotsToMcp(server: { name: string; url: string }, snaps: Snapshot[]): McpManifest {
  const tools: McpToolDefinition[] = [];
  const seen = new Set<string>();
  for (const s of snaps) {
    for (const a of s.actions) {
      const name = `${s.page_type}.${a.id}`;
      if (seen.has(name)) continue;
      seen.add(name);
      tools.push(actionToTool(name, a, s));
    }
  }
  return { schema_version: '0.1', server, tools };
}

function actionToTool(name: string, a: Action, s: Snapshot): McpToolDefinition {
  const inputSchema = (a.input && '$ref' in a.input ? { type: 'object' } : a.input) ?? {
    type: 'object',
    properties: {},
  };
  const annotations: Record<string, unknown> = {};
  if (a.auth) annotations.auth = a.auth;
  if (a.cost) annotations.cost = a.cost;
  if (a.reversible) annotations.reversible = a.reversible;
  if (a.side_effects) annotations.side_effects = a.side_effects;
  if (a.confirmation) annotations.confirmation = a.confirmation;
  if (a.rate_limit) annotations.rate_limit = a.rate_limit;
  if (a.execute_url) annotations.execute_url = a.execute_url;
  if (a.preview_url) annotations.preview_url = a.preview_url;
  annotations.snapshot_url = s.url;

  return {
    name,
    description: a.label ?? `${a.category ?? 'action'} on ${s.page_type}`,
    inputSchema: inputSchema as Record<string, unknown>,
    annotations,
  };
}

export function createMcpRoute(getAllSnapshots: () => Snapshot[] | Promise<Snapshot[]>) {
  async function GET(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const snaps = await getAllSnapshots();
    const m = snapshotsToMcp(
      { name: 'ahtml', url: `${url.protocol}//${url.host}` },
      snaps,
    );
    return new Response(JSON.stringify(m, null, 2), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  return { GET };
}

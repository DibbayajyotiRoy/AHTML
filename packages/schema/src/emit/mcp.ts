/**
 * Emit MCP (Model Context Protocol) tool definitions from AHTML snapshots —
 * framework-neutral.
 *
 * Canonical implementation as of v0.8.0: every framework adapter (`@ahtmljs/next`,
 * `@ahtmljs/vite`, future hono / sveltekit / astro shells) MUST delegate to
 * {@link snapshotsToMcp}. Adapters keep only the request handler that picks
 * up the current host and serializes the manifest to JSON.
 *
 * AHTML snapshots already carry typed action contracts. By emitting them at
 * `/ahtml/mcp.json`, a site automatically exposes itself as an MCP server-
 * compatible tool surface — no separate MCP server required.
 */

import type { Action, Snapshot } from '../types.js';

/** A single MCP tool descriptor. */
export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

/** The wire-shape served at `/ahtml/mcp.json`. */
export interface McpManifest {
  schema_version: '0.1';
  server: { name: string; url: string };
  tools: McpToolDefinition[];
}

/**
 * Roll up every action in `snaps` into a single MCP tool catalog.
 *
 * Tools are deduplicated by `<page_type>.<action.id>` so multi-route sites
 * don't emit the same tool many times. Order follows snapshot/action insertion
 * order; consumers should not rely on alphabetical ordering.
 */
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

/**
 * Translate one AHTML {@link Action} into an MCP tool definition.
 *
 * `$ref` inputs collapse to an empty `{ type: 'object' }` shell because MCP
 * clients can't dereference our schema registry; the AHTML annotations carry
 * the rest of the contract (auth, cost, side effects, etc.).
 */
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

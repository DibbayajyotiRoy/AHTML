/**
 * Next.js adapter for the AHTML MCP manifest endpoint. As of v0.8.0 this module
 * is a thin shell that re-exports the framework-neutral emitter from
 * `@ahtmljs/schema` and wraps it in a Next-flavored Request → Response handler.
 */

import { snapshotsToMcp, type Snapshot } from '@ahtmljs/schema';

export { snapshotsToMcp };
export type { McpManifest, McpToolDefinition } from '@ahtmljs/schema';

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

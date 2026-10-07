/**
 * Next.js adapter for the A2A (Agent2Agent) bridge — same shell as
 * {@link createMcpRoute}. Mount ONE route handler for both URLs:
 *
 *   // app/.well-known/agent-card.json/route.ts   (serves the Agent Card)
 *   // app/ahtml/a2a/route.ts                     (serves JSON-RPC)
 *   import { createA2ARoute } from '@ahtmljs/next/a2a';
 *   export const { GET, POST } = createA2ARoute(() => buildHomeSnapshot(), {
 *     url: 'https://shop.example.com/ahtml/a2a',
 *     // invoke: async (actionId, input) => ...   // omit = dry-run only
 *   });
 *
 * Safe by default: without `invoke` nothing executes; priced / irreversible
 * actions always need `metadata.confirm=true` as well.
 */

import { createA2AHandler, type A2AHandlerOptions, type Snapshot } from '@ahtmljs/schema';
import { getConfig } from './index.js';

export type { A2AHandlerOptions };

export function createA2ARoute(
  getSnapshot: (req: Request) => Snapshot | Promise<Snapshot>,
  opts: A2AHandlerOptions,
) {
  const handle = createA2AHandler(getSnapshot, opts);
  async function route(req: Request): Promise<Response> {
    // Same opt-out as the snapshot route: no agent traffic when the site says no.
    if (getConfig().policy?.agents_welcome === false) {
      return new Response(
        JSON.stringify({ error: 'agents_not_welcome', message: 'this site has not opted into agent traffic' }),
        { status: 403, headers: { 'content-type': 'application/json', 'x-ahtml-policy': 'agents_not_welcome' } },
      );
    }
    return handle(req);
  }
  return { GET: route, POST: route };
}

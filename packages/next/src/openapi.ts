/**
 * OpenAPI emitter — thin Next.js adapter as of v0.8.0. The document-building
 * logic lives in `@ahtmljs/schema` (see `schema/src/emit/openapi.ts`); this
 * module only keeps the Request handler that resolves `baseUrl` from the
 * incoming host and serializes the document to JSON.
 */

import { snapshotsToOpenApi } from '@ahtmljs/schema';
import type { OpenApiOptions, Snapshot } from '@ahtmljs/schema';

export { snapshotsToOpenApi } from '@ahtmljs/schema';
export type { OpenApiOptions } from '@ahtmljs/schema';

export function createOpenApiRoute(
  getAllSnapshots: () => Snapshot[] | Promise<Snapshot[]>,
  opts: Partial<OpenApiOptions> = {},
) {
  async function GET(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const snaps = await getAllSnapshots();
    const doc = snapshotsToOpenApi(
      {
        title: opts.title ?? 'AHTML',
        baseUrl: opts.baseUrl ?? `${url.protocol}//${url.host}`,
        version: opts.version,
        contact: opts.contact,
      },
      snaps,
    );
    return new Response(JSON.stringify(doc, null, 2), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  return { GET };
}

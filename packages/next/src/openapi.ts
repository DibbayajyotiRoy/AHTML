/**
 * Emit an OpenAPI 3.1 document describing the snapshot endpoints and
 * any action endpoints declared on snapshots' actions.
 */

import type { Snapshot } from '@ahtml/schema';

export function snapshotsToOpenApi(opts: { title: string; baseUrl: string }, snaps: Snapshot[]): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const s of snaps) {
    const path = s.url.replace(opts.baseUrl, '') || '/';
    const ahtmlPath = '/ahtml' + path;
    paths[ahtmlPath] = {
      get: {
        summary: `AHTML snapshot of ${path}`,
        responses: {
          '200': {
            description: 'snapshot',
            content: {
              'application/ahtml+text': { schema: { type: 'string' } },
              'application/ahtml+json': { schema: { $ref: 'https://ahtml.dev/schema/v0.1/snapshot.json' } },
            },
          },
          '304': { description: 'not modified' },
        },
      },
    };
  }

  for (const s of snaps) {
    for (const a of s.actions) {
      if (!a.execute_url) continue;
      const verb = (a.method ?? 'post').toLowerCase();
      const path = (paths[a.execute_url] ??= {});
      path[verb] = {
        summary: a.label ?? a.id,
        operationId: a.id,
        security: a.auth && a.auth !== 'none' ? [{ bearer: [] }] : undefined,
        requestBody: a.input ? { content: { 'application/json': { schema: a.input } } } : undefined,
        responses: {
          '200': {
            description: 'success',
            ...(a.output && { content: { 'application/json': { schema: a.output } } }),
          },
        },
        'x-ahtml-cost': a.cost,
        'x-ahtml-reversible': a.reversible,
        'x-ahtml-side-effects': a.side_effects,
        'x-ahtml-confirmation': a.confirmation,
      };
    }
  }

  return {
    openapi: '3.1.0',
    info: { title: opts.title, version: '0.1' },
    servers: [{ url: opts.baseUrl }],
    paths,
    components: {
      securitySchemes: {
        bearer: { type: 'http', scheme: 'bearer' },
      },
    },
  };
}

export function createOpenApiRoute(getAllSnapshots: () => Snapshot[] | Promise<Snapshot[]>) {
  async function GET(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const snaps = await getAllSnapshots();
    const doc = snapshotsToOpenApi(
      { title: 'AHTML', baseUrl: `${url.protocol}//${url.host}` },
      snaps,
    );
    return new Response(JSON.stringify(doc, null, 2), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  return { GET };
}

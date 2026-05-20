/**
 * Emit an OpenAPI 3.1 document describing the snapshot endpoints and
 * any action endpoints declared on snapshots' actions.
 *
 * Security: an action's `auth` may be a string sentinel
 * (`required`/`optional`/`none`) or an object `{ scheme, scopes? }`. We
 * register only the schemes actually referenced and emit a per-operation
 * `security` requirement that matches — no more "everything is bearer".
 */

import type { Snapshot, Action } from '@ahtmljs/schema';

export interface OpenApiOptions {
  title: string;
  baseUrl: string;
  /** OpenAPI `info.version` — your API version, not the AHTML schema version. */
  version?: string;
  /** Optional contact block for `info.contact`. */
  contact?: { name?: string; url?: string; email?: string };
}

export function snapshotsToOpenApi(opts: OpenApiOptions, snaps: Snapshot[]): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  const securitySchemes: Record<string, unknown> = {};

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
              'application/ahtml+json': { schema: { $ref: '#/components/schemas/Snapshot' } },
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
      const security = authToSecurity(a, securitySchemes);
      const op: Record<string, unknown> = {
        summary: a.label ?? a.id,
        operationId: a.id,
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
      if (security) op.security = security;
      path[verb] = op;
    }
  }

  return {
    openapi: '3.1.0',
    info: {
      title: opts.title,
      version: opts.version ?? '1.0.0',
      ...(opts.contact && { contact: opts.contact }),
    },
    servers: [{ url: opts.baseUrl }],
    paths,
    components: {
      // `Snapshot` is a thin reference to the canonical schema — clients can
      // dereference the AHTML spec for the full definition.
      schemas: {
        Snapshot: { $ref: 'https://raw.githubusercontent.com/DibbayajyotiRoy/AHTML/main/packages/schema/src/schema.json' },
      },
      ...(Object.keys(securitySchemes).length > 0 && { securitySchemes }),
    },
  };
}

/**
 * Translate an action's `auth` into an OpenAPI security requirement, registering
 * any scheme we reference into `securitySchemes`. Returns `undefined` when the
 * action declares no auth (or `'none'`), so callers can omit the field cleanly.
 */
function authToSecurity(a: Action, securitySchemes: Record<string, unknown>): unknown[] | undefined {
  if (!a.auth || a.auth === 'none') return undefined;

  // String form ('required' | 'optional') — generic bearer fallback, which is
  // the AHTML default for "this needs auth, scheme not specified".
  if (typeof a.auth === 'string') {
    securitySchemes.bearer ??= { type: 'http', scheme: 'bearer' };
    return [{ bearer: [] }];
  }

  // Object form { scheme, scopes? } — honor the scheme name.
  const { scheme, scopes } = a.auth;
  if (!securitySchemes[scheme]) {
    securitySchemes[scheme] = describeScheme(scheme);
  }
  return [{ [scheme]: scopes ?? [] }];
}

function describeScheme(scheme: string): Record<string, unknown> {
  if (scheme === 'oauth2') {
    return {
      type: 'oauth2',
      flows: { authorizationCode: { authorizationUrl: '', tokenUrl: '', scopes: {} } },
    };
  }
  if (scheme === 'bearer' || scheme === 'jwt') return { type: 'http', scheme: 'bearer' };
  if (scheme === 'basic') return { type: 'http', scheme: 'basic' };
  if (scheme === 'apiKey') return { type: 'apiKey', in: 'header', name: 'X-API-Key' };
  // Fallback: treat as a custom HTTP scheme. Lets sites declare scheme names
  // OpenAPI doesn't know about (e.g. "hmac") without us erroring out.
  return { type: 'http', scheme };
}

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

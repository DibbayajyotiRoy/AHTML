/**
 * `ahtml bridge <url> [--port 8787] [--host 127.0.0.1]` — one local server that
 * speaks BOTH agent protocols for any URL:
 *
 *   A2A  GET  /.well-known/agent-card.json   Agent Card (skills = snapshot actions)
 *        POST /a2a                           JSON-RPC (SendMessage / message/send, GetTask / tasks/get)
 *   MCP  POST /mcp                           Streamable-HTTP-style JSON-RPC (same tools as `ahtml mcp`)
 *
 * AHTML adopters get their typed actions as A2A skills; plain HTML sites get an
 * extracted snapshot (read-only: extracted snapshots never carry actions).
 *
 * Safety: A2A actions that are priced, irreversible or confirmation-required are
 * dry-run only unless the caller sends `metadata.confirm=true`. Binds to
 * 127.0.0.1 by default and rejects foreign Host headers (DNS rebinding) and
 * non-JSON POSTs (cross-site form posts).
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createA2AHandler, type Snapshot } from '@ahtmljs/schema';
import { AHTMLClient } from '@ahtmljs/agent';
import { createMcpHandler, type JsonRpcRequest } from './mcp.js';

export interface BridgeOptions {
  port?: number;
  host?: string;
}

export interface RunningBridge {
  server: Server;
  port: number;
  a2aUrl: string;
  cardUrl: string;
  mcpUrl: string;
  close(): Promise<void>;
}

const MAX_BODY = 1_000_000;
const SNAPSHOT_TTL_MS = 30_000;
const MCP_VERSIONS = ['2025-06-18', '2025-03-26'];

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function toRequest(req: IncomingMessage, base: string): Promise<Request> {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
    else if (v !== undefined) headers.set(k, v);
  }
  let body: string | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const c of req) {
      size += (c as Buffer).length;
      if (size > MAX_BODY) throw new Error('payload too large');
      chunks.push(c as Buffer);
    }
    body = Buffer.concat(chunks).toString('utf8'); // JSON-RPC only
  }
  return new Request(new URL(req.url ?? '/', base), { method: req.method, headers, body });
}

async function send(res: ServerResponse, r: Response): Promise<void> {
  const headers: Record<string, string> = {};
  r.headers.forEach((v, k) => (headers[k] = v));
  res.writeHead(r.status, headers);
  res.end(Buffer.from(await r.arrayBuffer()));
}

/** Start the bridge for `targetUrl`. Resolves once listening. */
export async function startBridge(targetUrl: string, opts: BridgeOptions = {}): Promise<RunningBridge> {
  const host = opts.host ?? '127.0.0.1';
  const pageUrl = targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`;

  // Shared by A2A (snapshot + executor) — fetched lazily, cached briefly.
  const client = new AHTMLClient();
  let cached: { at: number; snap: Snapshot } | undefined;
  const getSnapshot = async (): Promise<Snapshot> => {
    if (cached && Date.now() - cached.at < SNAPSHOT_TTL_MS) return cached.snap;
    const snap = (await client.fetchPage(pageUrl)).snapshot;
    cached = { at: Date.now(), snap };
    return snap;
  };
  const invoke = async (actionId: string, input: unknown): Promise<unknown> => {
    const snap = await getSnapshot();
    const a = snap.actions.find((x) => x.id === actionId);
    if (!a?.execute_url) throw new Error(`action "${actionId}" has no execute_url`);
    const target = new URL(a.execute_url, snap.url);
    const method = a.method ?? 'POST';
    if (method === 'GET') {
      for (const [k, v] of Object.entries(input as Record<string, unknown>)) target.searchParams.set(k, String(v));
    }
    const res = await fetch(target, {
      method,
      headers: { 'content-type': 'application/json', 'user-agent': 'AHTML-CLI-bridge' },
      body: method === 'GET' ? undefined : JSON.stringify(input),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from execute_url`);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  };

  const mcp = await createMcpHandler(pageUrl);
  let a2a: ((r: Request) => Promise<Response>) | undefined;
  const allowedHosts = new Set(['localhost', '127.0.0.1', '[::1]', host]);

  async function mcpHttp(req: Request): Promise<Response> {
    if (req.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
    if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
      return json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Content-Type must be application/json' } }, 415);
    }
    let msg: unknown;
    try {
      msg = await req.json();
    } catch {
      return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    }
    if (typeof msg !== 'object' || msg === null || Array.isArray(msg) || typeof (msg as JsonRpcRequest).method !== 'string') {
      return json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } });
    }
    const rpc = msg as JsonRpcRequest;
    const reply = await mcp.handle(rpc);
    if (!reply || rpc.id === undefined) return new Response(null, { status: 202 }); // notification
    if ('error' in reply) return json({ jsonrpc: '2.0', id: rpc.id, error: reply.error });
    // Echo the client's protocol version when we know it (tools-only, wire-identical).
    const r = reply.result as { protocolVersion?: string };
    const asked = (rpc.params as { protocolVersion?: string } | undefined)?.protocolVersion;
    if (rpc.method === 'initialize' && asked && MCP_VERSIONS.includes(asked)) r.protocolVersion = asked;
    return json({ jsonrpc: '2.0', id: rpc.id, result: reply.result });
  }

  const server = createServer((req, res) => {
    (async () => {
      const hostName = (req.headers.host ?? '').replace(/:\d+$/, '');
      if (!allowedHosts.has(hostName)) return send(res, json({ error: 'forbidden_host' }, 403));
      const r = await toRequest(req, `http://${req.headers.host}`);
      const path = new URL(r.url).pathname;
      if (path === '/.well-known/agent-card.json' && r.method === 'GET') return send(res, await a2a!(r));
      if (path === '/a2a') return send(res, await a2a!(r));
      if (path === '/mcp') return send(res, await mcpHttp(r));
      if (path === '/' && r.method === 'GET') {
        return send(res, json({ agent_card: bridge.cardUrl, a2a: bridge.a2aUrl, mcp: bridge.mcpUrl }));
      }
      return send(res, json({ error: 'not_found' }, 404));
    })().catch((err: unknown) => {
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'bridge_error', detail: (err as Error)?.message ?? String(err) }));
      } else res.end();
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port ?? 8787, host, resolve);
  });
  const port = (server.address() as AddressInfo).port;
  const base = `http://${host.includes(':') ? `[${host}]` : host}:${port}`;
  a2a = createA2AHandler(getSnapshot, { url: `${base}/a2a`, invoke });
  const bridge: RunningBridge = {
    server,
    port,
    a2aUrl: `${base}/a2a`,
    cardUrl: `${base}/.well-known/agent-card.json`,
    mcpUrl: `${base}/mcp`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections?.();
      }),
  };
  return bridge;
}

/** CLI entry: start, print the connect one-liners, run until Ctrl+C. */
export async function runBridge(targetUrl: string, opts: BridgeOptions = {}): Promise<number> {
  let bridge: RunningBridge;
  try {
    bridge = await startBridge(targetUrl, opts);
  } catch (err) {
    process.stderr.write(`error: could not start bridge: ${(err as Error)?.message ?? String(err)}\n`);
    return 1;
  }
  const local = `http://localhost:${bridge.port}`;
  process.stdout.write(
    `AHTML bridge for ${targetUrl}\n\n` +
      `  A2A agent card  ${bridge.cardUrl}\n` +
      `  A2A endpoint    ${bridge.a2aUrl}   (SendMessage / message/send, GetTask / tasks/get)\n` +
      `  MCP endpoint    ${bridge.mcpUrl}\n\n` +
      `Connect:\n` +
      `  claude mcp add --transport http ahtml ${local}/mcp\n` +
      `  A2A clients:    point them at ${local}  (card: ${local}/.well-known/agent-card.json)\n\n` +
      `Priced / irreversible / confirmation-required actions stay dry-run over A2A\n` +
      `until the request carries metadata.confirm=true. Ctrl+C to stop.\n`,
  );
  return new Promise<number>((resolve) => {
    const stop = () => void bridge.close().then(() => resolve(0));
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
}

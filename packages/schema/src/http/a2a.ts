/**
 * A2A (Agent2Agent) JSON-RPC bridge for any AHTML snapshot — framework-neutral
 * `(Request) => Promise<Response>`.
 *
 *   GET   → the Agent Card (mount at `/.well-known/agent-card.json`)
 *   POST  → JSON-RPC 2.0 (mount anywhere, e.g. `/ahtml/a2a`)
 *
 * Spec: A2A v1.0.1 (https://a2a-protocol.org/latest/specification/) AND v0.3.0
 * (https://a2a-protocol.org/v0.3.0/specification/), negotiated per request by
 * method name, exactly as spec §3.6.2 allows ("agents CAN expose multiple
 * interfaces ... with different versions under the same URL"):
 *
 *   `SendMessage` / `GetTask`      → 1.0 wire shapes (member-based Part,
 *                                    `TASK_STATE_*`, `ROLE_AGENT`, `{task}`)
 *   `message/send` / `tasks/get`   → 0.3 wire shapes (`kind`, `input-required`)
 *
 * Message input: a DataPart `{ skill, input }` calls a skill; any TextPart
 * answers with the `read_snapshot` skill. Safety (SPEC §4.6): an action that is
 * priced, irreversible or confirmation-required is NEVER executed by default —
 * the task comes back `input-required` carrying the {@link createSimulateHandler}
 * dry-run. It executes only when `metadata.confirm === true` AND `opts.invoke`
 * is set. Without `invoke` the bridge is read-only/dry-run for every action.
 *
 * Out of scope (declared in the card: streaming=false, pushNotifications=false):
 * `SendStreamingMessage`, `ListTasks`, `CancelTask`, push notifications. Tasks
 * live in a bounded in-memory map per handler instance (lost on restart / not
 * shared across serverless isolates).
 */

import type { Action, Snapshot } from '../types.js';
import { track } from '../telemetry.js';
import { VERSION } from '../version.js';
import { toCompact } from '../format-compact.js';
import { toJson } from '../format-json.js';
import { toMarkdown } from '../format-markdown.js';
import { createSimulateHandler, type SimulatedResponseBody } from '../simulate.js';
import {
  A2A_READ_SNAPSHOT_SKILL,
  a2aConfirmReasons,
  toA2AAgentCard,
  type A2AAgentCardOptions,
} from '../emit/a2a.js';

export interface A2AHandlerOptions extends A2AAgentCardOptions {
  /**
   * Executes a (confirmed or safe) action. Receives the snapshot action id and
   * the caller's `input`. Own input validation: the bridge only checks that
   * `input` is a JSON object. Omit to keep the bridge dry-run only.
   */
  invoke?: (actionId: string, input: unknown) => Promise<unknown>;
}

type Obj = Record<string, unknown>;
type State = 'input-required' | 'completed' | 'failed' | 'rejected';
type Part = { text: string } | { data: Obj };

interface StoredTask {
  id: string;
  contextId: string;
  state: State;
  text: string;
  artifact?: { name: string; parts: Part[] };
  at: string;
}

const MAX_TASKS = 200;
const SUPPORTED_VERSIONS = ['0.3', '1.0'];

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const uuid = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
const json = (body: unknown, status = 200, extra: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...extra } });

/** Thrown inside method handlers to become a JSON-RPC error. */
class RpcError extends Error {
  constructor(readonly code: number, message: string) {
    super(message);
  }
}

/** Render the neutral stored task in the requested protocol dialect. */
function render(t: StoredTask, v1: boolean): Obj {
  const part = (p: Part): Obj =>
    'text' in p
      ? v1 ? { text: p.text, mediaType: 'text/plain' } : { kind: 'text', text: p.text }
      : v1 ? { data: p.data, mediaType: 'application/json' } : { kind: 'data', data: p.data };
  const message: Obj = {
    messageId: uuid(),
    contextId: t.contextId,
    taskId: t.id,
    role: v1 ? 'ROLE_AGENT' : 'agent',
    parts: [part({ text: t.text })],
    ...(v1 ? {} : { kind: 'message' }),
  };
  return {
    id: t.id,
    contextId: t.contextId,
    status: {
      state: v1 ? `TASK_STATE_${t.state.toUpperCase().replace('-', '_')}` : t.state,
      message,
      timestamp: t.at,
    },
    ...(t.artifact
      ? { artifacts: [{ artifactId: `${t.id}-1`, name: t.artifact.name, parts: t.artifact.parts.map(part) }] }
      : {}),
    ...(v1 ? {} : { kind: 'task' }),
  };
}

/** Dry-run via the producer-side simulate handler (never touches the real action). */
async function simulate(action: Action, input: Obj): Promise<SimulatedResponseBody> {
  const run = createSimulateHandler({ action, predict: () => ({}) });
  const res = await run(new Request('http://a2a.invalid/dry-run', { method: 'POST', body: JSON.stringify(input) }));
  return (await res.json()) as SimulatedResponseBody;
}

export function createA2AHandler(
  getSnapshot: (req: Request) => Snapshot | Promise<Snapshot>,
  opts: A2AHandlerOptions,
): (req: Request) => Promise<Response> {
  const tasks = new Map<string, StoredTask>();
  const save = (t: StoredTask): StoredTask => {
    tasks.delete(t.id);
    tasks.set(t.id, t);
    if (tasks.size > MAX_TASKS) tasks.delete(tasks.keys().next().value as string);
    return t;
  };

  async function sendMessage(req: Request, params: unknown): Promise<StoredTask> {
    const p = isObj(params) ? params : {};
    const m = p.message;
    if (!isObj(m) || !Array.isArray(m.parts) || m.parts.length === 0) {
      throw new RpcError(-32602, 'Invalid params: message.parts must be a non-empty array');
    }
    const meta = (v: unknown) => (isObj(v) && isObj(v.metadata) ? v.metadata : {});
    const confirm = meta(p).confirm === true || meta(m).confirm === true;

    // Parts (both dialects): DataPart = `data` object, TextPart = `text` string.
    let call: Obj | undefined;
    const texts: string[] = [];
    for (const part of m.parts as unknown[]) {
      if (isObj(part) && isObj(part.data)) call ??= part.data;
      else if (isObj(part) && typeof part.text === 'string') texts.push(part.text);
    }
    if (!call && texts.length === 0) {
      throw new RpcError(-32005, 'Content type not supported: send a text part or a data part {skill, input}');
    }
    if (call && typeof call.skill !== 'string') {
      throw new RpcError(-32602, 'Invalid params: data part must be {"skill": string, "input"?: object}');
    }
    if (call && call.input !== undefined && !isObj(call.input)) {
      throw new RpcError(-32602, 'Invalid params: data part input must be a JSON object');
    }
    const skill = call ? (call.skill as string) : A2A_READ_SNAPSHOT_SKILL;
    const input: Obj = call && isObj(call.input) ? call.input : {};

    // Continue an interrupted task, or start a new one.
    let id = uuid();
    let contextId = typeof m.contextId === 'string' ? m.contextId : uuid();
    if (typeof m.taskId === 'string') {
      const prev = tasks.get(m.taskId);
      if (!prev) throw new RpcError(-32001, 'Task not found');
      if (prev.state !== 'input-required') {
        throw new RpcError(-32602, `Task ${prev.id} is in terminal state ${prev.state} and cannot be continued`);
      }
      id = prev.id;
      contextId = prev.contextId;
    }
    const at = () => new Date().toISOString();
    const done = (state: State, text: string, artifact?: StoredTask['artifact']) =>
      save({ id, contextId, state, text, artifact, at: at() });

    const snap = await getSnapshot(req);

    if (skill === A2A_READ_SNAPSHOT_SKILL) {
      const f = input.format;
      const body = f === 'markdown' ? toMarkdown(snap) : f === 'json' ? toJson(snap) : toCompact(snap);
      return done('completed', `AHTML snapshot of ${snap.url}`, { name: 'snapshot', parts: [{ text: body }] });
    }

    const action = snap.actions.find((a) => a.id === skill);
    if (!action) {
      const known = [A2A_READ_SNAPSHOT_SKILL, ...snap.actions.map((a) => a.id)].join(', ');
      throw new RpcError(-32602, `Invalid params: unknown skill "${skill}". Available: ${known}`);
    }

    const reasons = a2aConfirmReasons(action);
    const needsConfirm = reasons.length > 0;

    if (opts.invoke && (!needsConfirm || confirm)) {
      try {
        const result = await opts.invoke(action.id, input);
        return done('completed', `Executed "${action.id}".`, {
          name: 'result',
          parts: [{ data: { skill: action.id, result } }],
        });
      } catch (err) {
        const msg = (err instanceof Error ? err.message : String(err)).slice(0, 300);
        return done('failed', `Action "${action.id}" failed: ${msg}`);
      }
    }

    // Dry-run only: never executed.
    const sim = await simulate(action, input);
    const would_execute = {
      action_id: action.id,
      input,
      ...(action.side_effects ? { side_effects: action.side_effects } : {}),
      ...(needsConfirm ? { requires: reasons } : {}),
    };
    const artifact = { name: 'simulation', parts: [{ data: { ...sim, would_execute } as Obj }] };
    if (needsConfirm && !confirm) {
      return done(
        'input-required',
        `Dry run only: "${action.id}" is ${reasons.join(' + ')} and was NOT executed. ` +
          (opts.invoke
            ? 'Resend with metadata.confirm=true to execute.'
            : 'This bridge has no executor configured, so it can only be simulated.'),
        artifact,
      );
    }
    return done('rejected', `Dry run only: this bridge has no executor configured, so "${action.id}" was not executed.`, artifact);
  }

  function getTask(params: unknown): StoredTask {
    const id = isObj(params) ? params.id : undefined;
    if (typeof id !== 'string' || !id) throw new RpcError(-32602, 'Invalid params: id is required');
    const t = tasks.get(id);
    if (!t) throw new RpcError(-32001, 'Task not found');
    return t;
  }

  async function rpc(req: Request): Promise<Response> {
    if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
      return json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Content-Type must be application/json' } }, 415);
    }
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    }
    const id = isObj(body) && (typeof body.id === 'string' || typeof body.id === 'number') ? body.id : null;
    const fail = (code: number, message: string) => json({ jsonrpc: '2.0', id, error: { code, message } });
    if (!isObj(body) || body.jsonrpc !== '2.0' || typeof body.method !== 'string' || id === null) {
      return fail(-32600, 'Invalid Request');
    }
    const method = body.method;
    const v1 = method === 'SendMessage' || method === 'GetTask';
    if (!v1 && method !== 'message/send' && method !== 'tasks/get') return fail(-32601, 'Method not found');

    const ver = req.headers.get('a2a-version');
    if (ver && !SUPPORTED_VERSIONS.includes(ver.split('.').slice(0, 2).join('.'))) {
      return fail(-32009, `Version not supported: ${ver} (supported: ${SUPPORTED_VERSIONS.join(', ')})`);
    }

    try {
      const sending = method === 'SendMessage' || method === 'message/send';
      const task = render(sending ? await sendMessage(req, body.params) : getTask(body.params), v1);
      return json({ jsonrpc: '2.0', id, result: sending && v1 ? { task } : task });
    } catch (err) {
      if (err instanceof RpcError) return fail(err.code, err.message);
      return fail(-32603, 'Internal error');
    }
  }

  return async function handle(req: Request): Promise<Response> {
    if (req.method === 'GET') {
      try {
        return json(toA2AAgentCard(await getSnapshot(req), opts), 200, {
          'cache-control': 'public, max-age=300, must-revalidate',
        });
      } catch {
        return json({ error: 'a2a_card_failed' }, 500);
      }
    }
    if (req.method === 'POST') {
      track('@ahtmljs/schema', VERSION, 'a2a.request');
      return rpc(req);
    }
    return json({ error: 'method_not_allowed' }, 405, { allow: 'GET, POST' });
  };
}

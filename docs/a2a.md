# A2A + MCP auto-bridge

Any AHTML snapshot becomes a Google [A2A](https://a2a-protocol.org/latest/specification/)
(Agent2Agent) agent and an MCP server with zero configuration. Actions are
already typed contracts, so each one becomes an A2A skill.

Spec targeted: **A2A v1.0.1** (`a2a-protocol.org/latest`), with the **v0.3.0**
wire format served alongside it on the same URL (many clients still speak 0.3).

## Hono (on by default)

```ts
import { Hono } from 'hono';
import { mountAHTML } from '@ahtmljs/hono';

const app = new Hono();
mountAHTML(app, {
  site: 'https://shop.example.com',
  routes: [{ path: '/', page_type: 'home' }],
  snapshotBuilder: async (segments, req) => /* ... */,
  // a2a: false,                       // opt out
  // a2aInvoke: async (actionId, input) => runAction(actionId, input), // opt in to execution
});
```

Adds `GET /.well-known/agent-card.json` and `POST /ahtml/a2a`. The agent
exposes the distinct actions of every declared route. The card is advertised as
`endpoints.a2a` in `/.well-known/ahtml.json` only with an explicit `a2a: true`
(or `buildWellKnown({ emit_a2a: true })`), so the default manifest stays
byte-identical across adapters. Other runtimes use
`createA2AHandler(getSnapshot, { url, invoke? })` from `@ahtmljs/schema`
directly (it is a plain `(Request) => Promise<Response>`); Next.js has
`createA2ARoute` in `@ahtmljs/next/a2a` (`export const { GET, POST } = ...`).

## CLI: any URL, both protocols

```bash
npx @ahtmljs/cli bridge https://shop.example.com --port 8787
claude mcp add --transport http ahtml http://localhost:8787/mcp   # MCP
# A2A clients: card at http://localhost:8787/.well-known/agent-card.json
```

AHTML adopters expose their typed actions; plain HTML sites get an extracted,
read-only snapshot (extracted snapshots never carry actions). The server binds
to `127.0.0.1`, refuses foreign `Host` headers and non-JSON POSTs.

## What the agent does

| Skill | How to call | Result |
| --- | --- | --- |
| `read_snapshot` | any text message, or `{"skill":"read_snapshot","input":{"format":"markdown"}}` | snapshot as compact text (`compact` / `markdown` / `json`) |
| one per action | DataPart `{"skill":"<action id>","input":{...}}` | task with the action result |

JSON-RPC methods: `SendMessage` / `message/send` and `GetTask` / `tasks/get`
(1.0 and 0.3 names, each answered in its own dialect). Streaming, push
notifications, `ListTasks` and `CancelTask` are not implemented (the card says
so). Tasks are kept in a bounded in-memory map per handler instance.

```json
{ "jsonrpc": "2.0", "id": 1, "method": "message/send",
  "params": { "message": { "messageId": "m1", "role": "user",
    "parts": [{ "kind": "data", "data": { "skill": "purchase", "input": { "sku": "mbp" } } }] } } }
```

## Safety: priced and irreversible actions are never silent

An action is **gated** when it is priced (`cost.amount > 0`, purchase or
subscription cost, or a `charge_card` side effect), declared irreversible
(`reversible: false`, or an undeclared `delete`), or has
`confirmation: "required"` (SPEC section 4.6).

- Gated, no confirmation: the task comes back `input-required` carrying the
  `simulate()` dry-run (`simulated: true`, `would_charge`, `reversal`,
  `would_execute`). Nothing is executed.
- Re-send with `"metadata": { "confirm": true }` (on the params or the message;
  only the boolean `true` counts, optionally continuing the task via
  `message.taskId`) to execute.
- Safe actions execute directly.
- No `invoke` configured (the Hono default): nothing ever executes. Safe
  actions return the simulation with state `rejected`; gated ones `input-required`.
- The bridge checks that `input` is a JSON object; validating it against the
  action schema is the executor's job (`invoke` / `execute_url`).

The CLI executor POSTs the input to the action's `execute_url` (resolved
against the page URL). Note that `ahtml mcp` / the `/mcp` endpoint keep their
existing `invoke_action` tool, which relies on the MCP client's own per-call
approval and does not apply this gate.

## Errors

JSON-RPC 2.0: `-32700` parse, `-32600` invalid request (also non-JSON content
type, HTTP 415), `-32601` unknown method, `-32602` invalid params (unknown
skill, bad part, continuing a finished task), `-32603` internal. A2A:
`-32001` task not found, `-32005` unsupported content type (file-only
messages), `-32009` unsupported `A2A-Version` (`0.3` and `1.0` accepted).

## Agent card compatibility

`toA2AAgentCard(snapshot, { url, version?, provider?, legacy? })` returns the
1.0 card (`supportedInterfaces[]` with `protocolBinding: "JSONRPC"`) plus the
v0.3 connection fields (`protocolVersion`, `url`, `preferredTransport`) and a
second 0.3 interface. The official 1.0 SDKs parse cards ignoring unknown
fields; 0.3 SDKs ignore `supportedInterfaces`. Pass `legacy: false` for a pure
1.0 card.

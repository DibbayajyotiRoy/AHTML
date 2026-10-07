/**
 * Emit a Google A2A (Agent2Agent) Agent Card from an AHTML snapshot —
 * framework-neutral.
 *
 * Spec targeted: A2A v1.0.1 (https://a2a-protocol.org/latest/specification/,
 * proto at github.com/a2aproject/A2A/blob/v1.0.1/specification/a2a.proto).
 * The card is served at `/.well-known/agent-card.json` (RFC 8615).
 *
 * v1.0 replaced the v0.3 connection fields (`protocolVersion`, `url`,
 * `preferredTransport`) with `supportedInterfaces[]`, but v0.3 clients are
 * still common. By default the card therefore carries BOTH: a 1.0 interface
 * and a 0.3 interface (both are spec-valid `AgentInterface` entries, the spec
 * lets one agent expose several versions at the same URL) plus the three
 * legacy top-level v0.3 fields. The official 1.0 SDKs parse cards with
 * `ignore_unknown_fields`, and v0.3 SDKs ignore `supportedInterfaces`.
 * Pass `legacy: false` for a pure 1.0 card.
 *
 * One skill per snapshot action plus the built-in `read_snapshot` skill.
 */

import type { Action, JsonSchema, Snapshot } from '../types.js';
import { track } from '../telemetry.js';
import { VERSION } from '../version.js';

/** Id of the built-in skill that returns the snapshot itself. */
export const A2A_READ_SNAPSHOT_SKILL = 'read_snapshot';

/** v1.0 `AgentInterface`. */
export interface A2AInterface {
  url: string;
  protocolBinding: 'JSONRPC';
  /** `Major.Minor` per spec §3.6. */
  protocolVersion: string;
}

/** `AgentSkill` — `id`, `name`, `description`, `tags` are required by the spec. */
export interface A2ASkill {
  id: string;
  name: string;
  description: string;
  tags: string[];
  examples?: string[];
  inputModes?: string[];
  outputModes?: string[];
}

/** `AgentCard` (v1.0 shape + optional v0.3 compatibility fields). */
export interface A2AAgentCard {
  name: string;
  description: string;
  version: string;
  supportedInterfaces: A2AInterface[];
  provider?: { organization: string; url: string };
  capabilities: { streaming: boolean; pushNotifications: boolean };
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: A2ASkill[];
  /** v0.3 compat (omitted when `legacy: false`). */
  protocolVersion?: string;
  url?: string;
  preferredTransport?: 'JSONRPC';
}

export interface A2AAgentCardOptions {
  /** Absolute URL of the A2A JSON-RPC endpoint (where `SendMessage` is POSTed). */
  url: string;
  /** Agent version shown on the card. Default `"1.0.0"`. */
  version?: string;
  provider?: { organization: string; url: string };
  /** Also emit v0.3 connection fields + a 0.3 interface. Default true. */
  legacy?: boolean;
}

/**
 * Why an action must not run without explicit confirmation (SPEC §4.6 + the
 * priced/irreversible rules of the A2A bridge). Empty array = safe to execute.
 * An undeclared `reversible` on a `delete` action counts as irreversible.
 */
export function a2aConfirmReasons(a: Action): string[] {
  const r: string[] = [];
  if (a.confirmation === 'required') r.push('confirmation required');
  const c = a.cost;
  if (
    (c && ((c.amount ?? 0) > 0 || c.category === 'purchase' || c.category === 'subscription')) ||
    a.side_effects?.includes('charge_card')
  ) {
    r.push('priced');
  }
  const rev = a.reversible as unknown;
  const declaredIrreversible =
    rev === false || (typeof rev === 'object' && rev !== null && (rev as { reversible?: unknown }).reversible === false);
  if (declaredIrreversible || (rev == null && a.category === 'delete')) r.push('irreversible');
  return r;
}

/** `{ prop: <zero value> }` skeleton so a skill example is valid JSON. */
function skeleton(a: Action): Record<string, unknown> {
  const props = (a.input as JsonSchema | undefined)?.properties ?? {};
  const zero = (t?: string) =>
    t === 'number' || t === 'integer' ? 0 : t === 'boolean' ? false : t === 'array' ? [] : t === 'object' ? {} : '';
  return Object.fromEntries(Object.entries(props).map(([k, v]) => [k, zero(v?.type)]));
}

/**
 * Build the A2A Agent Card for `snapshot`.
 *
 * Pure function: deterministic for a given snapshot + options.
 */
export function toA2AAgentCard(snapshot: Snapshot, opts: A2AAgentCardOptions): A2AAgentCard {
  track('@ahtmljs/schema', VERSION, 'a2a.card');
  let host = snapshot.url;
  try {
    host = new URL(snapshot.url).hostname;
  } catch {
    /* keep the raw string */
  }
  const skills: A2ASkill[] = [
    {
      id: A2A_READ_SNAPSHOT_SKILL,
      name: 'Read page snapshot',
      description: `Returns the AHTML snapshot of ${snapshot.url} (entities, actions, policy) as compact text. Send any text message, or {"skill":"read_snapshot","input":{"format":"compact|markdown|json"}}.`,
      tags: ['ahtml', 'read', 'snapshot'],
      examples: ['What is on this page?', '{"skill":"read_snapshot","input":{"format":"markdown"}}'],
      inputModes: ['text/plain', 'application/json'],
      outputModes: ['text/plain', 'application/json'],
    },
  ];
  const seen = new Set<string>([A2A_READ_SNAPSHOT_SKILL]);
  for (const a of snapshot.actions) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    const reasons = a2aConfirmReasons(a);
    skills.push({
      id: a.id,
      name: a.label ?? a.id,
      description:
        `${a.label ?? a.id}${a.category ? ` (${a.category})` : ''}. Call with a DataPart {"skill":"${a.id}","input":{...}}.` +
        (reasons.length
          ? ` Dry-run only (${reasons.join(', ')}): the response is a simulation until the request carries metadata.confirm=true.`
          : ''),
      tags: ['ahtml', a.category ?? 'action', ...(reasons.length ? ['requires-confirmation'] : [])],
      examples: [JSON.stringify({ skill: a.id, input: skeleton(a) })],
      inputModes: ['application/json'],
      outputModes: ['application/json'],
    });
  }

  const interfaces: A2AInterface[] = [{ url: opts.url, protocolBinding: 'JSONRPC', protocolVersion: '1.0' }];
  const legacy = opts.legacy !== false;
  if (legacy) interfaces.push({ url: opts.url, protocolBinding: 'JSONRPC', protocolVersion: '0.3' });

  const n = skills.length - 1;
  return {
    name: `${host} (AHTML)`,
    description:
      `A2A bridge for ${snapshot.url}: read its AHTML snapshot${n ? ` and call ${n} typed action${n === 1 ? '' : 's'}` : ''}. ` +
      'Priced, irreversible or confirmation-required actions are dry-run only unless the caller sets metadata.confirm=true.',
    version: opts.version ?? '1.0.0',
    supportedInterfaces: interfaces,
    ...(opts.provider ? { provider: opts.provider } : {}),
    capabilities: { streaming: false, pushNotifications: false },
    defaultInputModes: ['text/plain', 'application/json'],
    defaultOutputModes: ['text/plain', 'application/json'],
    skills,
    ...(legacy ? { protocolVersion: '0.3.0', url: opts.url, preferredTransport: 'JSONRPC' as const } : {}),
  };
}

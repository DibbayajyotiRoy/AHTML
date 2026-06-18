/**
 * @ahtmljs/webmcp — Register AHTML actions as WebMCP browser tools.
 *
 * AHTML's action metadata (cost, reversibility, confirmation, side-effects)
 * is richer than WebMCP's baseline — that's the differentiator, surfaced as
 * tool annotations.
 *
 * Usage:
 *   import { registerAhtmlTools } from '@ahtmljs/webmcp';
 *   const page = await client.fetchPage(location.href);
 *   registerAhtmlTools(page.snapshot);
 */

import type { Snapshot, Action } from '@ahtmljs/schema';

/** A registered WebMCP tool handle. Call `unregister()` to remove it. */
export interface AhtmlTool {
  name: string;
  unregister(): void;
}

/** Options for `registerAhtmlTools()`. */
export interface RegisterOptions {
  /** Override the base URL for action execution. Default: current origin. */
  baseUrl?: string;
  /** Custom fetch implementation (default: globalThis.fetch). */
  fetch?: typeof fetch;
}

/**
 * Registers all actions in the snapshot as WebMCP tools.
 * Uses the native WebMCP API when available (Chrome 149+), and always
 * populates `window.__AHTML_TOOLS__` as a stable fallback for the bookmarklet.
 */
export function registerAhtmlTools(snap: Snapshot, opts: RegisterOptions = {}): AhtmlTool[] {
  const tools: AhtmlTool[] = [];
  const registry = getRegistry();

  for (const action of snap.actions) {
    const tool = buildTool(action, snap.url, opts);
    const handle = registerTool(tool, registry);
    tools.push(handle);
  }

  return tools;
}

/**
 * Unregister all tools registered for this page.
 * Useful in SPAs when the page type changes.
 */
export function unregisterAll(): void {
  const registry = getRegistry();
  for (const tool of Object.values(registry)) {
    if (tool && typeof tool._unregister === 'function') tool._unregister();
  }
  // Clear our registry
  (globalThis as Record<string, unknown>)['__AHTML_TOOLS__'] = {};
}

// ─── Internal ─────────────────────────────────────────────────────────────────

interface McpToolDescriptor {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<string>;
  _unregister?: () => void;
}

type Registry = Record<string, McpToolDescriptor>;

function getRegistry(): Registry {
  const g = globalThis as Record<string, unknown>;
  if (!g['__AHTML_TOOLS__']) g['__AHTML_TOOLS__'] = {};
  return g['__AHTML_TOOLS__'] as Registry;
}

function buildTool(action: Action, pageUrl: string, opts: RegisterOptions): McpToolDescriptor {
  const fetcher = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const annotations: Record<string, unknown> = {};

  // Populate WebMCP annotations from AHTML's richer metadata.
  // ActionCost.amount and .currency are optional; category is always present.
  if (action.cost) {
    const { amount, currency, category } = action.cost;
    const costParts: string[] = [category];
    if (amount != null) costParts.unshift(String(amount));
    if (currency) costParts.splice(amount != null ? 1 : 0, 0, currency);
    annotations['x-ahtml-cost'] = costParts.join(' ');
  }
  if (action.reversible) {
    annotations['x-ahtml-reversible'] = action.reversible.reversible;
    if (action.reversible.reversible && action.reversible.window) {
      annotations['x-ahtml-reversible-window'] = action.reversible.window;
    }
  }
  if (action.side_effects?.length) {
    annotations['x-ahtml-side-effects'] = action.side_effects.join(', ');
  }
  if (action.confirmation && action.confirmation !== 'none') {
    annotations['x-ahtml-confirmation'] = action.confirmation;
  }
  if (action.auth && action.auth !== 'none') {
    annotations['x-ahtml-auth'] =
      typeof action.auth === 'string' ? action.auth : action.auth.scheme;
  }

  const description = buildDescription(action);

  return {
    name: action.id,
    description,
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: true,
    },
    annotations,
    async execute(args: Record<string, unknown>): Promise<string> {
      const execUrl =
        action.execute_url ?? `${new URL(pageUrl).origin}/ahtml/actions/${action.id}`;
      const method = action.method ?? 'POST';
      try {
        const res = await fetcher(execUrl, {
          method,
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ action: action.id, ...args }),
        });
        return await res.text();
      } catch (err) {
        return JSON.stringify({ error: (err as Error).message });
      }
    },
  };
}

function registerTool(tool: McpToolDescriptor, registry: Registry): AhtmlTool {
  // Always populate the fallback registry (bookmarklet reads this)
  registry[tool.name] = tool;

  // Try native WebMCP API (Chrome 149+ origin trial).
  // The exact API shape may change as the spec matures — we detect by
  // checking for the registration function rather than a version number.
  let nativeUnregister: (() => void) | null = null;
  const nav =
    typeof navigator !== 'undefined' ? (navigator as unknown as Record<string, unknown>) : {};

  // Proposed shape 1: navigator.ml.tools.register({ name, description, parameters, handler })
  const mlTools = (nav['ml'] as Record<string, unknown> | undefined)?.['tools'] as
    | Record<string, unknown>
    | undefined;
  if (mlTools && typeof mlTools['register'] === 'function') {
    try {
      const handle = (mlTools['register'] as Function)({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        annotations: tool.annotations,
        handler: tool.execute,
      });
      if (handle && typeof (handle as Record<string, unknown>)['unregister'] === 'function') {
        nativeUnregister = () =>
          ((handle as Record<string, unknown>)['unregister'] as () => void)();
      }
    } catch {
      // API not ready or different shape — fall back to __AHTML_TOOLS__ only
    }
  }

  // Proposed shape 2: window.registerMCPTool(descriptor)
  const win =
    typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>) : {};
  if (!nativeUnregister && typeof win['registerMCPTool'] === 'function') {
    try {
      (win['registerMCPTool'] as Function)({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.parameters,
        annotations: tool.annotations,
        handler: tool.execute,
      });
    } catch { /* ignore */ }
  }

  const unregister = (): void => {
    delete registry[tool.name];
    if (nativeUnregister) nativeUnregister();
  };

  tool._unregister = unregister;
  return { name: tool.name, unregister };
}

function buildDescription(action: Action): string {
  const parts: string[] = [];

  if (action.label) parts.push(action.label);

  const target = action.target;
  if (target) {
    parts.push(`Target: ${Array.isArray(target) ? target.join(', ') : target}`);
  }

  if (action.cost) {
    const { amount, currency, category } = action.cost;
    if (amount != null && currency) {
      parts.push(`Cost: ${amount} ${currency}`);
    } else {
      parts.push(`Cost: ${category}`);
    }
  }

  const auth = action.auth;
  if (auth && auth !== 'none') {
    parts.push(`Auth: ${typeof auth === 'string' ? auth : auth.scheme}`);
  }

  if (action.reversible?.reversible === false) parts.push('Not reversible');

  return parts.length > 0
    ? parts.join('. ') + '.'
    : `Invoke the ${action.id} action on this page.`;
}

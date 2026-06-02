/**
 * doctor() — external auditor for the AHTML discovery chain.
 *
 * Given a live site URL, walks every endpoint an AHTML-aware agent will
 * touch and reports — endpoint by endpoint — what is well-formed, what is
 * a warning, and what is broken. The output is a structured
 * {@link DoctorReport} so the CLI front-end can render it however it
 * wants (ANSI today, JSON tomorrow, GitHub Actions annotations later).
 *
 * Design notes:
 *   - Pure with respect to its dependencies. `fetch` and the snapshot
 *     fetcher are injectable so the unit tests can drive every branch
 *     without a network.
 *   - Edge-runtime safe: no `node:*` imports anywhere. The hot path is
 *     just `fetch` plus `@ahtmljs/schema` validators.
 *   - Optional checks (`llms.txt`, MCP, OpenAPI) downgrade to `warn` when
 *     missing — only the well-known manifest and the snapshot at /ahtml
 *     are hard requirements for a green report.
 */

import {
  validate,
  lint,
  AHTMLError,
  type Snapshot,
} from '@ahtmljs/schema';
import { AHTMLClient } from '@ahtmljs/agent';

/** A single audit step in the discovery chain. */
export interface DoctorCheck {
  /** Stable, human-readable label, e.g. `".well-known/ahtml.json"`. */
  name: string;
  /** `pass` = check succeeded; `warn` = optional thing missing or low-impact issue; `fail` = required thing broken. */
  status: 'pass' | 'warn' | 'fail';
  /** One-line context — what was found or what went wrong. */
  detail?: string;
  /** Concrete next step when status is not `pass`. */
  hint?: string;
}

/** Aggregate result for one `doctor()` invocation. */
export interface DoctorReport {
  /** The URL the audit was run against (normalized, trailing slash stripped). */
  url: string;
  /** Per-step results in walk order. */
  checks: DoctorCheck[];
  /** Tallies of statuses across {@link checks}. */
  totals: { pass: number; warn: number; fail: number };
}

/** Options for {@link doctor}. */
export interface DoctorOptions {
  /** Override the global `fetch` (used by the unit tests). */
  fetch?: typeof fetch;
  /** Inject a pre-built `AHTMLClient` (used by the unit tests). */
  client?: AHTMLClient;
  /** Per-request timeout in ms. Default 15_000. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Audit a live AHTML deployment and return a structured report.
 *
 * Walks, in order:
 *   1. `<origin>/.well-known/ahtml.json`
 *   2. The snapshot at `<origin>/ahtml` (validated + linted)
 *   3. `<origin>/ahtml/mcp.json` (if the manifest advertises it)
 *   4. `<origin>/ahtml/openapi.json` (if the manifest advertises it)
 *   5. `<origin>/llms.txt`
 *
 * The well-known step is a hard gate — if it fails or is missing,
 * subsequent steps are skipped (recorded as `warn` with a "skipped"
 * detail) because their URLs are derived from the manifest endpoints.
 */
export async function doctor(
  url: string,
  opts: DoctorOptions = {},
): Promise<DoctorReport> {
  const origin = normalizeOrigin(url);
  const fetcher = opts.fetch ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const checks: DoctorCheck[] = [];

  // 1) /.well-known/ahtml.json — must exist, must parse, must have v0.1 shape.
  const wkUrl = `${origin}/.well-known/ahtml.json`;
  const wk = await fetchJson(fetcher, wkUrl, timeoutMs);
  if (!wk.ok) {
    checks.push({
      name: '.well-known/ahtml.json',
      status: 'fail',
      detail: wk.detail,
      hint: 'Serve a manifest at /.well-known/ahtml.json — use buildWellKnown() from @ahtmljs/schema.',
    });
    skipDownstream(checks);
    return finalize(origin, checks);
  }

  const manifest = wk.body as Record<string, unknown> | null;
  const wkIssue = validateWellKnown(manifest);
  if (wkIssue) {
    checks.push({
      name: '.well-known/ahtml.json',
      status: 'fail',
      detail: wkIssue,
      hint: 'The manifest must be `{ ahtml: "0.1", site, endpoints }`. Regenerate it with buildWellKnown().',
    });
    skipDownstream(checks);
    return finalize(origin, checks);
  }
  checks.push({
    name: '.well-known/ahtml.json',
    status: 'pass',
    detail: `site=${(manifest as Record<string, unknown>).site as string}`,
  });

  const endpoints = (manifest as { endpoints: { snapshot?: string; mcp?: string; openapi?: string } }).endpoints;
  const snapshotUrl = `${origin}/ahtml`;

  // 2) /ahtml — must exist, must validate, must (ideally) carry at least one entity.
  const client = opts.client ?? new AHTMLClient(opts.fetch ? { fetch: opts.fetch } : {});
  let snap: Snapshot | null = null;
  try {
    snap = await client.fetch(snapshotUrl, { noCache: true, format: 'json' });
  } catch (err) {
    const e = AHTMLError.is(err) ? err : null;
    checks.push({
      name: '/ahtml (snapshot fetch)',
      status: 'fail',
      detail: e ? `${e.code}: ${e.message}` : (err as Error).message,
      hint: e?.hint ?? 'Mount the AHTML snapshot route — see @ahtmljs/next or @ahtmljs/hono.',
    });
    skipDownstream(checks, ['validate', 'lint', 'mcp', 'openapi', 'llms.txt']);
    return finalize(origin, checks);
  }

  // 2a) validate()
  const issues = validate(snap);
  if (issues.length > 0) {
    const first = issues[0]!;
    checks.push({
      name: '/ahtml validate()',
      status: 'fail',
      detail: `${issues.length} issue(s); first at ${first.path}: ${first.message}`,
      hint: 'Run validate(snapshot) in your build to surface every issue before deploy.',
    });
  } else {
    checks.push({
      name: '/ahtml validate()',
      status: 'pass',
      detail: `page_type=${snap.page_type}, entities=${snap.entities.length}, actions=${snap.actions.length}`,
    });
  }

  // 2b) entity-presence sanity check.
  if (snap.entities.length === 0) {
    checks.push({
      name: '/ahtml entities',
      status: 'warn',
      detail: 'Snapshot has 0 entities — agents will find no objects to reason about.',
      hint: 'Add at least one Entity (Product / Document / Dataset / Profile / Task) via SnapshotBuilder.',
    });
  } else {
    checks.push({
      name: '/ahtml entities',
      status: 'pass',
      detail: `${snap.entities.length} entit${snap.entities.length === 1 ? 'y' : 'ies'}`,
    });
  }

  // 3) lint()
  const warnings = lint(snap);
  if (warnings.length === 0) {
    checks.push({ name: '/ahtml lint()', status: 'pass', detail: 'no warnings' });
  } else {
    const first = warnings[0]!;
    checks.push({
      name: '/ahtml lint()',
      status: 'warn',
      detail: `${warnings.length} warning(s); first: [${first.rule}] ${first.message}`,
      hint: first.hint ?? 'Run lint(snapshot) locally and address each rule, or disable specific rules with { disable: [...] }.',
    });
  }

  // 4) /ahtml/mcp.json — only required when advertised.
  if (endpoints?.mcp) {
    const mcp = await fetchJson(fetcher, endpoints.mcp, timeoutMs);
    if (!mcp.ok) {
      checks.push({
        name: '/ahtml/mcp.json',
        status: 'fail',
        detail: mcp.detail,
        hint: 'The manifest advertises an MCP endpoint but it did not resolve. Mount it with snapshotsToMcp().',
      });
    } else {
      const issue = validateMcp(mcp.body);
      if (issue) {
        checks.push({ name: '/ahtml/mcp.json', status: 'fail', detail: issue, hint: 'Regenerate with snapshotsToMcp() — every manifest needs schema_version, server, and tools.' });
      } else {
        const toolCount = ((mcp.body as { tools: unknown[] }).tools ?? []).length;
        checks.push({ name: '/ahtml/mcp.json', status: 'pass', detail: `${toolCount} tool(s)` });
      }
    }
  } else {
    checks.push({
      name: '/ahtml/mcp.json',
      status: 'warn',
      detail: 'Not advertised in manifest.endpoints.mcp',
      hint: 'Enable emit_mcp in buildWellKnown() to advertise the MCP catalog to agents.',
    });
  }

  // 5) /ahtml/openapi.json — only required when advertised.
  if (endpoints?.openapi) {
    const oa = await fetchJson(fetcher, endpoints.openapi, timeoutMs);
    if (!oa.ok) {
      checks.push({
        name: '/ahtml/openapi.json',
        status: 'fail',
        detail: oa.detail,
        hint: 'The manifest advertises an OpenAPI endpoint but it did not resolve. Mount it with snapshotsToOpenApi().',
      });
    } else {
      const issue = validateOpenApi(oa.body);
      if (issue) {
        checks.push({ name: '/ahtml/openapi.json', status: 'fail', detail: issue, hint: 'Regenerate with snapshotsToOpenApi() — version must be 3.1.0.' });
      } else {
        checks.push({ name: '/ahtml/openapi.json', status: 'pass', detail: 'OpenAPI 3.1.0' });
      }
    }
  } else {
    checks.push({
      name: '/ahtml/openapi.json',
      status: 'warn',
      detail: 'Not advertised in manifest.endpoints.openapi',
      hint: 'Enable emit_openapi in buildWellKnown() to expose actions as an OpenAPI document.',
    });
  }

  // 6) /llms.txt — optional but recommended.
  const llmsUrl = `${origin}/llms.txt`;
  const llms = await fetchText(fetcher, llmsUrl, timeoutMs);
  if (!llms.ok) {
    checks.push({
      name: '/llms.txt',
      status: 'warn',
      detail: llms.detail,
      hint: 'Serve a /llms.txt — use buildLlmsTxt() from @ahtmljs/schema.',
    });
  } else if (!llms.body.trimStart().startsWith('#')) {
    checks.push({
      name: '/llms.txt',
      status: 'warn',
      detail: 'File present but does not start with a Markdown heading (# ...).',
      hint: 'The llms.txt spec expects an H1 site title on the first non-blank line.',
    });
  } else {
    checks.push({ name: '/llms.txt', status: 'pass', detail: `${llms.body.length} bytes` });
  }

  return finalize(origin, checks);
}

/** Validate the well-known manifest shape — `ahtml: '0.1'`, `site`, `endpoints`. */
function validateWellKnown(m: Record<string, unknown> | null): string | null {
  if (!m || typeof m !== 'object') return 'Response was not a JSON object.';
  if (m.ahtml !== '0.1') return `Expected ahtml: "0.1", got ${JSON.stringify(m.ahtml)}.`;
  if (typeof m.site !== 'string' || m.site.length === 0) return 'Field `site` missing or empty.';
  if (typeof m.endpoints !== 'object' || m.endpoints === null) return 'Field `endpoints` missing or not an object.';
  return null;
}

/** Validate the minimum MCP manifest shape. */
function validateMcp(m: unknown): string | null {
  if (!m || typeof m !== 'object') return 'Response was not a JSON object.';
  const o = m as Record<string, unknown>;
  if (typeof o.schema_version !== 'string') return 'Field `schema_version` missing.';
  if (!o.server || typeof o.server !== 'object') return 'Field `server` missing or not an object.';
  if (!Array.isArray(o.tools)) return 'Field `tools` missing or not an array.';
  return null;
}

/** Validate the minimum OpenAPI shape — version must be 3.1.0. */
function validateOpenApi(m: unknown): string | null {
  if (!m || typeof m !== 'object') return 'Response was not a JSON object.';
  const o = m as Record<string, unknown>;
  if (o.openapi !== '3.1.0') return `Expected openapi: "3.1.0", got ${JSON.stringify(o.openapi)}.`;
  return null;
}

/** Mark a fixed list of downstream checks as `warn: skipped`. */
function skipDownstream(
  checks: DoctorCheck[],
  names: string[] = ['/ahtml', 'validate', 'lint', 'mcp', 'openapi', 'llms.txt'],
): void {
  for (const n of names) {
    checks.push({
      name: n,
      status: 'warn',
      detail: 'skipped — upstream check failed',
    });
  }
}

/** Tally totals and return the report. */
function finalize(url: string, checks: DoctorCheck[]): DoctorReport {
  const totals = { pass: 0, warn: 0, fail: 0 };
  for (const c of checks) totals[c.status] += 1;
  return { url, checks, totals };
}

/** Strip trailing slash from a URL so URL composition is deterministic. */
function normalizeOrigin(u: string): string {
  return u.replace(/\/+$/, '');
}

/** Bounded `fetch` -> JSON helper that never throws. */
async function fetchJson(
  fetcher: typeof fetch,
  url: string,
  timeoutMs: number,
): Promise<{ ok: true; body: unknown } | { ok: false; detail: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetcher(url, { signal: ctrl.signal });
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status} ${res.statusText}` };
    try {
      return { ok: true, body: await res.json() };
    } catch (err) {
      return { ok: false, detail: `JSON parse failed: ${(err as Error).message}` };
    }
  } catch (err) {
    return { ok: false, detail: `fetch failed: ${(err as Error).message}` };
  } finally {
    clearTimeout(timer);
  }
}

/** Bounded `fetch` -> text helper that never throws. */
async function fetchText(
  fetcher: typeof fetch,
  url: string,
  timeoutMs: number,
): Promise<{ ok: true; body: string } | { ok: false; detail: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetcher(url, { signal: ctrl.signal });
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status} ${res.statusText}` };
    return { ok: true, body: await res.text() };
  } catch (err) {
    return { ok: false, detail: `fetch failed: ${(err as Error).message}` };
  } finally {
    clearTimeout(timer);
  }
}

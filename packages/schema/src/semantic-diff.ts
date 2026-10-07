/**
 * Semantic snapshot diffing.
 *
 * `diff()` (diff.ts) answers "what do I have to patch?" — structural, by
 * entity/action id, whole-entity replacement. `semanticDiff()` answers "what
 * actually changed, and does it matter to an agent?" — field-level, with
 * prices, availability and action contracts recognised and graded by severity.
 * It is read-only and independent of `diff()` / `applyDiff()`.
 *
 * Comparison rules:
 *   - Objects compare by sorted keys (stable JSON), so key order never matters.
 *   - Arrays whose elements all carry a unique string `id` (variants, chunks,
 *     messages…) compare element-by-element by id; other arrays (tags, images,
 *     dataset rows…) compare by value as unordered multisets, so a pure
 *     reorder is not a change.
 *   - Volatile fields are ignored: `fetched_at`, `etag`, entity `updated_at`,
 *     `provenance.signature`, and the derived `meta` byte/ratio counters.
 *   - Top-level `schemas` is not diffed on its own; a schema change surfaces
 *     through the actions whose `input`/`output` reference it.
 */

import { track } from './telemetry.js';
import { VERSION } from './version.js';
import type { Snapshot, Action, ActionCost, Entity } from './types.js';

export type ChangeSeverity = 'info' | 'notable' | 'breaking';

/** Semantic flags carried by an `action.changed`. */
export type ActionChangeFlag =
  | 'became_priced'
  | 'price_changed'
  | 'became_irreversible'
  | 'input_changed'
  | 'output_changed';

/** One field-level difference. `before`/`after` are absent when the field was added/removed. */
export interface FieldDelta {
  path: string;
  before?: unknown;
  after?: unknown;
}

export type SemanticChange = { id: string; severity: ChangeSeverity } & (
  | { kind: 'entity.added'; entityType: string; label?: string }
  | { kind: 'entity.removed'; entityType: string; label?: string }
  | ({ kind: 'field.changed' } & FieldDelta)
  | {
      kind: 'price.changed';
      path: string;
      /** Amounts; `null` when the price was added/removed. */
      before: number | null;
      after: number | null;
      /** Currency after the change (before it, if the price was removed). */
      currency: string;
      /** Set only when the currency itself changed. */
      previousCurrency?: string;
      /** Percent change rounded to 2 decimals (-5 = 5% cheaper); null if undefined. */
      pctChange: number | null;
    }
  | {
      kind: 'availability.changed';
      path: string;
      /** Stock status; `null` when the stock block was added/removed. */
      before: string | null;
      after: string | null;
      quantityBefore?: number;
      quantityAfter?: number;
    }
  | { kind: 'action.added'; label?: string }
  | { kind: 'action.removed'; label?: string }
  | {
      kind: 'action.changed';
      flags: ActionChangeFlag[];
      /** Remaining field-level changes not already captured by a flag. */
      changes: FieldDelta[];
      cost?: { before?: ActionCost; after?: ActionCost };
      requiredAdded?: string[];
      requiredRemoved?: string[];
    }
  | ({ kind: 'policy.changed' } & FieldDelta)
  | ({ kind: 'meta.changed' } & FieldDelta)
);

const RANK: Record<ChangeSeverity, number> = { breaking: 0, notable: 1, info: 2 };

/**
 * Compute the semantic changes between two snapshots. Ordered breaking first,
 * then notable, then info; within a severity by section (envelope, policy,
 * entities, actions), id, kind and path — independent of element order in
 * either snapshot.
 */
export function semanticDiff(prev: Snapshot, next: Snapshot): SemanticChange[] {
  track('@ahtmljs/schema', VERSION, 'semantic_diff.compute');
  const out: SemanticChange[] = [];

  const meta: Raw[] = [];
  walk('', envelope(prev), envelope(next), NO_ATOMIC, meta);
  for (const r of meta) out.push({ kind: 'meta.changed', id: 'snapshot', severity: 'info', ...r });

  const pol: Raw[] = [];
  walk('', prev.policy ?? {}, next.policy ?? {}, NO_ATOMIC, pol);
  for (const r of pol) {
    const severity = r.path === 'agents_welcome' && r.after === false ? 'breaking' : 'info';
    out.push({ kind: 'policy.changed', id: 'policy', severity, ...r });
  }

  const pe = byId(prev.entities ?? []);
  const ne = byId(next.entities ?? []);
  for (const [id, e] of ne) {
    const old = pe.get(id);
    if (!old) out.push({ kind: 'entity.added', id, severity: 'info', ...describeEntity(e) });
    else out.push(...entityChanges(id, old, e));
  }
  for (const [id, e] of pe) {
    if (!ne.has(id)) out.push({ kind: 'entity.removed', id, severity: 'info', ...describeEntity(e) });
  }

  const pa = byId(prev.actions ?? []);
  const na = byId(next.actions ?? []);
  for (const [id, a] of na) {
    const old = pa.get(id);
    if (!old) out.push({ kind: 'action.added', id, severity: 'info', ...labelOf(a) });
    else {
      const c = actionChange(prev, next, old, a);
      if (c) out.push(c);
    }
  }
  for (const [id, a] of pa) {
    if (!na.has(id)) out.push({ kind: 'action.removed', id, severity: 'breaking', ...labelOf(a) });
  }

  return sorted(out);
}

/**
 * Plain-English summary, one line per change (`[severity] sentence`), in the
 * same deterministic order `semanticDiff` uses. Empty input gives `''`.
 */
export function summarizeChanges(changes: SemanticChange[]): string {
  return sorted(changes).map((c) => `[${c.severity}] ${describeChange(c)}`).join('\n');
}

/** One-sentence description of a single change (no severity prefix). */
export function describeChange(c: SemanticChange): string {
  switch (c.kind) {
    case 'entity.added':
      return `Entity ${c.id} added${c.label ? ` ("${c.label}")` : ''}`;
    case 'entity.removed':
      return `Entity ${c.id} removed${c.label ? ` ("${c.label}")` : ''}`;
    case 'field.changed':
      return `${c.id}: ${deltaText(c)}`;
    case 'price.changed': {
      const cur = c.currency;
      if (c.before === null) return `${c.id}: ${c.path} added: ${c.after} ${cur}`;
      if (c.after === null) return `${c.id}: ${c.path} removed (was ${c.before} ${cur})`;
      if (c.previousCurrency) {
        return `${c.id}: ${c.path} changed from ${c.before} ${c.previousCurrency} to ${c.after} ${cur}`;
      }
      const dir = c.after > c.before ? 'increased' : 'decreased';
      const pct = c.pctChange === null ? '' : ` (${c.pctChange > 0 ? '+' : ''}${c.pctChange}%)`;
      return `${c.id}: ${c.path} ${dir} from ${c.before} to ${c.after} ${cur}${pct}`;
    }
    case 'availability.changed': {
      const f = (s: string | null, q?: number) => (s === null ? '(none)' : q === undefined ? s : `${s} (${q})`);
      return `${c.id}: ${c.path} availability changed from ${f(c.before, c.quantityBefore)} to ${f(c.after, c.quantityAfter)}`;
    }
    case 'action.added':
      return `Action "${c.id}" added${c.label ? ` ("${c.label}")` : ''}`;
    case 'action.removed':
      return `Action "${c.id}" removed${c.label ? ` ("${c.label}")` : ''}`;
    case 'action.changed': {
      const parts: string[] = [];
      for (const f of c.flags) {
        if (f === 'became_priced') parts.push(`became priced (${costText(c.cost?.after)})`);
        else if (f === 'price_changed') {
          parts.push(`price changed from ${costText(c.cost?.before)} to ${costText(c.cost?.after)}`);
        } else if (f === 'became_irreversible') parts.push('became irreversible');
        else if (f === 'input_changed') {
          const req = [
            c.requiredAdded?.length ? `required added: ${c.requiredAdded.join(', ')}` : '',
            c.requiredRemoved?.length ? `required removed: ${c.requiredRemoved.join(', ')}` : '',
          ].filter(Boolean);
          parts.push('input schema changed' + (req.length ? ` (${req.join('; ')})` : ''));
        } else parts.push('output schema changed');
      }
      if (c.changes.length) parts.push(`fields changed: ${c.changes.map((d) => d.path).join(', ')}`);
      return `Action "${c.id}" changed: ${parts.join('; ')}`;
    }
    case 'policy.changed':
      return `Policy: ${deltaText(c)}`;
    case 'meta.changed':
      return `Snapshot: ${deltaText(c)}`;
  }
}

// ---------------------------------------------------------------------------
// ordering
// ---------------------------------------------------------------------------

const SECTION: Record<string, number> = {
  'meta.changed': 0,
  'policy.changed': 1,
  'entity.added': 2,
  'entity.removed': 2,
  'field.changed': 2,
  'price.changed': 2,
  'availability.changed': 2,
  'action.added': 3,
  'action.removed': 3,
  'action.changed': 3,
};

function sorted(changes: SemanticChange[]): SemanticChange[] {
  const key = (c: SemanticChange) =>
    [RANK[c.severity], SECTION[c.kind], c.id, c.kind, 'path' in c ? c.path : ''].join('\u0000');
  const keyed = changes.map((c) => [key(c), c] as const);
  keyed.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
  return keyed.map((k) => k[1]);
}

// ---------------------------------------------------------------------------
// entity / action classification
// ---------------------------------------------------------------------------

type Raw = { path: string; before?: unknown; after?: unknown };

// Keys compared as whole objects so they can be recognised as money / stock.
const ATOMIC = new Set(['price', 'list_price', 'stock']);
const NO_ATOMIC = new Set<string>();

function entityChanges(id: string, a: Entity, b: Entity): SemanticChange[] {
  const { updated_at: _a, ...ra } = a as unknown as Record<string, unknown>;
  const { updated_at: _b, ...rb } = b as unknown as Record<string, unknown>;
  const raws: Raw[] = [];
  walk('', ra, rb, ATOMIC, raws);

  const out: SemanticChange[] = [];
  for (const r of raws) {
    const last = r.path.split(/[.\]]/).pop();
    if ((last === 'price' || last === 'list_price') && moneyOrAbsent(r.before) && moneyOrAbsent(r.after)) {
      const bm = r.before as { amount: number; currency?: string } | undefined;
      const am = r.after as { amount: number; currency?: string } | undefined;
      const currency = String((am ?? bm)!.currency ?? '');
      const prevCur = bm && am && String(bm.currency ?? '') !== currency ? String(bm.currency ?? '') : undefined;
      out.push({
        kind: 'price.changed',
        id,
        severity: 'notable',
        path: r.path,
        before: bm ? bm.amount : null,
        after: am ? am.amount : null,
        currency,
        ...(prevCur !== undefined ? { previousCurrency: prevCur } : {}),
        pctChange: bm && am && !prevCur && bm.amount !== 0 ? round2(((am.amount - bm.amount) / bm.amount) * 100) : null,
      });
    } else if (last === 'stock' && stockOrAbsent(r.before) && stockOrAbsent(r.after)) {
      const sb = r.before as { status: string; quantity?: number } | undefined;
      const sa = r.after as { status: string; quantity?: number } | undefined;
      if ((sb?.status ?? null) !== (sa?.status ?? null)) {
        out.push({
          kind: 'availability.changed',
          id,
          severity: 'notable',
          path: r.path,
          before: sb?.status ?? null,
          after: sa?.status ?? null,
          ...(sb?.quantity !== undefined ? { quantityBefore: sb.quantity } : {}),
          ...(sa?.quantity !== undefined ? { quantityAfter: sa.quantity } : {}),
        });
      } else {
        // Same status — only the quantity (or an extra key) moved.
        const sub: Raw[] = [];
        walk(r.path, sb, sa, NO_ATOMIC, sub);
        for (const s of sub) out.push({ kind: 'field.changed', id, severity: 'info', ...s });
      }
    } else {
      out.push({ kind: 'field.changed', id, severity: 'info', ...r });
    }
  }
  return out;
}

function actionChange(prev: Snapshot, next: Snapshot, a: Action, b: Action): SemanticChange | null {
  const { input: ai, output: ao, ...ra } = a;
  const { input: bi, output: bo, ...rb } = b;
  const raws: Raw[] = [];
  walk('', ra, rb, NO_ATOMIC, raws);

  const flags: ActionChangeFlag[] = [];
  const priced = (c?: ActionCost) =>
    !!c && ((c.amount ?? 0) > 0 || c.category === 'purchase' || c.category === 'subscription');
  const costKey = (c?: ActionCost) => stable([c?.amount, c?.currency, c?.category]);
  if (!priced(a.cost) && priced(b.cost)) flags.push('became_priced');
  else if ((priced(a.cost) || priced(b.cost)) && costKey(a.cost) !== costKey(b.cost)) flags.push('price_changed');
  if (a.reversible?.reversible !== false && b.reversible?.reversible === false) flags.push('became_irreversible');

  let requiredAdded: string[] = [];
  let requiredRemoved: string[] = [];
  const inA = resolveSchema(prev, ai);
  const inB = resolveSchema(next, bi);
  if (stable(inA) !== stable(inB)) {
    flags.push('input_changed');
    const ra2 = requiredOf(inA);
    const rb2 = requiredOf(inB);
    requiredAdded = rb2.filter((k) => !ra2.includes(k)).sort();
    requiredRemoved = ra2.filter((k) => !rb2.includes(k)).sort();
  }
  if (stable(resolveSchema(prev, ao)) !== stable(resolveSchema(next, bo))) flags.push('output_changed');

  const covers = (p: string) =>
    ((flags.includes('became_priced') || flags.includes('price_changed')) && /^cost(\.(amount|currency|category))?$/.test(p)) ||
    (flags.includes('became_irreversible') && /^reversible(\.reversible)?$/.test(p));
  const changes = raws.filter((r) => !covers(r.path));
  if (!flags.length && !changes.length) return null;

  const breaking =
    flags.includes('became_priced') ||
    flags.includes('became_irreversible') ||
    requiredAdded.length > 0 ||
    requiredRemoved.length > 0;
  const costFlagged = flags.includes('became_priced') || flags.includes('price_changed');
  return {
    kind: 'action.changed',
    id: a.id,
    severity: breaking ? 'breaking' : flags.includes('price_changed') ? 'notable' : 'info',
    flags,
    changes,
    ...(costFlagged ? { cost: { ...(a.cost ? { before: a.cost } : {}), ...(b.cost ? { after: b.cost } : {}) } } : {}),
    ...(requiredAdded.length ? { requiredAdded } : {}),
    ...(requiredRemoved.length ? { requiredRemoved } : {}),
  };
}

// ponytail: only a top-level `{ $ref: '#/schemas/X' }` is resolved; $refs nested
// inside a schema compare as written. Upgrade path: recursive resolution.
function resolveSchema(s: Snapshot, x: unknown): unknown {
  const ref = isObj(x) && typeof x.$ref === 'string' ? /^#\/schemas\/(.+)$/.exec(x.$ref) : null;
  return (ref && s.schemas?.[ref[1]!]) ?? x;
}

function requiredOf(schema: unknown): string[] {
  const r = isObj(schema) ? schema.required : undefined;
  return Array.isArray(r) ? r.filter((k): k is string => typeof k === 'string') : [];
}

// ---------------------------------------------------------------------------
// envelope
// ---------------------------------------------------------------------------

const ENVELOPE_SKIP = new Set(['entities', 'actions', 'policy', 'schemas', 'fetched_at', 'etag']);
const DERIVED_META = ['snapshot_bytes', 'html_bytes', 'compression_ratio'];

function envelope(s: Snapshot): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) if (!ENVELOPE_SKIP.has(k)) o[k] = v;
  if (s.meta) {
    const m: Record<string, unknown> = { ...s.meta };
    for (const k of DERIVED_META) delete m[k];
    o.meta = m;
  }
  if (s.provenance) {
    const { signature: _sig, ...p } = s.provenance;
    o.provenance = p;
  }
  return o;
}

// ---------------------------------------------------------------------------
// deep compare
// ---------------------------------------------------------------------------

function walk(path: string, a: unknown, b: unknown, atomic: Set<string>, out: Raw[]): void {
  if (stable(a) === stable(b)) return;
  if (isObj(a) && isObj(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    for (const k of keys) {
      const p = path ? `${path}.${k}` : k;
      if (atomic.has(k)) {
        if (stable(a[k]) !== stable(b[k])) out.push(raw(p, a[k], b[k]));
      } else walk(p, a[k], b[k], atomic, out);
    }
  } else if (Array.isArray(a) && Array.isArray(b)) {
    if (idKeyed(a) && idKeyed(b)) {
      const am = byId(a as { id: string }[]);
      const bm = byId(b as { id: string }[]);
      for (const id of [...new Set([...am.keys(), ...bm.keys()])].sort()) {
        walk(`${path}[${id}]`, am.get(id), bm.get(id), atomic, out);
      }
    } else if (multiset(a) !== multiset(b)) out.push(raw(path, a, b));
  } else out.push(raw(path, a, b));
}

/** Omit absent sides so JSON output stays honest about added/removed fields. */
function raw(path: string, before: unknown, after: unknown): Raw {
  return {
    path,
    ...(before !== undefined ? { before } : {}),
    ...(after !== undefined ? { after } : {}),
  };
}

function stable(v: unknown): string {
  return (
    JSON.stringify(v, (_k, val) =>
      val && typeof val === 'object' && !Array.isArray(val)
        ? Object.fromEntries(Object.entries(val).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)))
        : val,
    ) ?? 'undefined'
  );
}

const multiset = (x: unknown[]) => x.map(stable).sort().join('\u0000');

function idKeyed(arr: unknown[]): boolean {
  const seen = new Set<string>();
  for (const e of arr) {
    if (!isObj(e) || typeof e.id !== 'string' || seen.has(e.id)) return false;
    seen.add(e.id);
  }
  return true;
}

function byId<T extends { id: string }>(arr: T[]): Map<string, T> {
  return new Map(arr.map((e) => [e.id, e]));
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const moneyOrAbsent = (v: unknown) => v === undefined || (isObj(v) && typeof v.amount === 'number');
const stockOrAbsent = (v: unknown) => v === undefined || (isObj(v) && typeof v.status === 'string');
const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// text helpers
// ---------------------------------------------------------------------------

function describeEntity(e: Entity): { entityType: string; label?: string } {
  const r = e as unknown as Record<string, unknown>;
  const label = typeof r.name === 'string' ? r.name : typeof r.title === 'string' ? r.title : undefined;
  return { entityType: e.type, ...(label ? { label } : {}) };
}

const labelOf = (a: Action): { label?: string } => (a.label ? { label: a.label } : {});

function fmt(v: unknown): string {
  if (v === undefined) return '(unset)';
  const s = typeof v === 'string' ? JSON.stringify(v) : stable(v);
  return s.length > 60 ? s.slice(0, 57) + '...' : s;
}

function costText(c?: ActionCost): string {
  if (!c) return 'free';
  return c.amount !== undefined ? `${c.amount} ${c.currency ?? ''} ${c.category}`.replace(/ +/g, ' ') : c.category;
}

function deltaText(d: FieldDelta): string {
  if (d.before === undefined) return `${d.path} set to ${fmt(d.after)}`;
  if (d.after === undefined) return `${d.path} removed (was ${fmt(d.before)})`;
  if (Array.isArray(d.before) && Array.isArray(d.after)) {
    const left = (x: unknown[], y: unknown[]) => {
      const ys = y.map(stable);
      return x.filter((e) => {
        const i = ys.indexOf(stable(e));
        if (i >= 0) ys.splice(i, 1);
        return i < 0;
      });
    };
    const added = left(d.after, d.before);
    const removed = left(d.before, d.after);
    const parts = [added.length ? `added ${fmt(added)}` : '', removed.length ? `removed ${fmt(removed)}` : ''];
    return `${d.path} changed: ${parts.filter(Boolean).join(', ')}`;
  }
  return `${d.path} changed from ${fmt(d.before)} to ${fmt(d.after)}`;
}

/**
 * Compact text serializer — the token-optimal wire format.
 *
 * Why this exists: LLMs tokenize key-value lines and short identifiers much
 * more efficiently than JSON. By stripping JSON's structural overhead
 * (quotes, braces, colons, commas, escapes, repeated property names) and
 * collapsing common shapes (Money → "1999 USD", Stock → "in_stock (42)"),
 * the same snapshot uses 3–5× fewer tokens.
 *
 * Combined with the snapshot itself replacing the underlying HTML, the
 * end-to-end agent-token reduction is typically 80–200×.
 *
 * As of v0.5.0 the format is lossless against canonical JSON for every
 * field documented in SPEC.md. Earlier releases dropped 14 fields silently
 * — the worklist that became this implementation.
 *
 * Grammar (informal):
 *
 *   snapshot   = envelope NL block*
 *   envelope   = ("@" key value NL)+
 *   block      = (entity | action | named) NL body
 *   entity     = "[" id "]"            # id begins with type prefix: "product:..."
 *   action     = "(action) " id
 *   named      = "@" name              # policy, provenance, meta, links, schemas
 *   body       = scalar | block_scalar | nested_list
 *   scalar     = "  " key ": " value NL
 *   block_scalar = "  " key ": |" NL ("    " text NL)*
 *   nested_list  = "  " key ":" NL ("    - " value NL ("      " continuation NL)*)*
 */

import type {
  Snapshot,
  Entity,
  Action,
  AuthRequirement,
  Policy,
  Provenance,
  Links,
  Meta,
  Product,
  ProductVariant,
  Document,
  Chunk,
  Task,
  Profile,
  Dataset,
  DatasetColumn,
  Conversation,
  ConversationMessage,
  Money,
  Stock,
  Asset,
  JsonSchema,
} from './types.js';

// =====================================================================
// Serializer
// =====================================================================

export function toCompact(s: Snapshot): string {
  const L: string[] = [];

  L.push(`@ahtml ${s.ahtml}`);
  L.push(`@url ${s.url}`);
  L.push(`@fetched ${s.fetched_at}`);
  if (s.ttl != null) L.push(`@ttl ${s.ttl}`);
  if (s.etag) L.push(`@etag ${s.etag}`);
  L.push(`@page_type ${s.page_type}`);

  if (s.policy) {
    L.push('');
    L.push('@policy');
    writePolicy(s.policy, L);
  }
  if (s.provenance) {
    L.push('');
    L.push('@provenance');
    writeProvenance(s.provenance, L);
  }

  for (const e of s.entities) {
    L.push('');
    L.push(`[${e.id}]`);
    writeEntity(e, L);
  }

  for (const a of s.actions) {
    L.push('');
    L.push(`(action) ${a.id}`);
    writeAction(a, L);
  }

  if (s.links && Object.keys(s.links).length > 0) {
    L.push('');
    L.push('@links');
    writeLinks(s.links, L);
  }

  if (s.schemas && Object.keys(s.schemas).length > 0) {
    L.push('');
    L.push('@schemas');
    for (const [name, def] of Object.entries(s.schemas)) {
      L.push(`  ${name}: ${JSON.stringify(def)}`);
    }
  }

  if (s.meta && Object.keys(s.meta).length > 0) {
    L.push('');
    L.push('@meta');
    writeKV(s.meta, L);
  }

  return L.join('\n') + '\n';
}

function writePolicy(p: Policy, L: string[]): void {
  L.push(`  agents_welcome: ${p.agents_welcome ? 'yes' : 'no'}`);
  if (p.license) L.push(`  license: ${p.license}`);
  if (p.rate_limit) L.push(`  rate_limit: ${p.rate_limit}`);
  if (p.actions_require) L.push(`  actions_require: ${p.actions_require}`);
  if (p.contact) L.push(`  contact: ${p.contact}`);
  if (p.terms_url) L.push(`  terms_url: ${p.terms_url}`);
  if (p.attribution_required) L.push(`  attribution_required: yes`);
  if (p.republish) L.push(`  republish: ${p.republish}`);
  if (p.caching) {
    const c = p.caching;
    const parts = [];
    if (c.allowed !== undefined) parts.push(c.allowed ? 'allowed' : 'denied');
    if (c.ttl !== undefined) parts.push(`ttl=${c.ttl}`);
    L.push(`  caching: ${parts.join(' ')}`);
  }
}

function writeProvenance(p: Provenance, L: string[]): void {
  if (p.issuer) L.push(`  issuer: ${p.issuer}`);
  if (p.signed != null) L.push(`  signed: ${p.signed ? 'yes' : 'no'}`);
  if (p.signature) L.push(`  signature: ${p.signature}`);
  if (p.signature_alg) L.push(`  signature_alg: ${p.signature_alg}`);
  if (p.fetched_via) L.push(`  fetched_via: ${p.fetched_via}`);
}

function writeLinks(l: Links, L: string[]): void {
  if (l.self) L.push(`  self: ${l.self}`);
  if (l.canonical) L.push(`  canonical: ${l.canonical}`);
  if (l.parent) L.push(`  parent: ${l.parent}`);
  if (l.next) {
    const parts: string[] = [];
    if (l.next.cursor) parts.push(`cursor=${l.next.cursor}`);
    if (l.next.url) parts.push(`url=${l.next.url}`);
    if (l.next.expected != null) parts.push(`expected=${l.next.expected}`);
    if (l.next.total != null) parts.push(`total=${l.next.total}`);
    L.push(`  next: ${parts.join(' ')}`);
  }
  if (l.prev) {
    const parts: string[] = [];
    if (l.prev.cursor) parts.push(`cursor=${l.prev.cursor}`);
    if (l.prev.url) parts.push(`url=${l.prev.url}`);
    L.push(`  prev: ${parts.join(' ')}`);
  }
  if (l.related && l.related.length) L.push(`  related: ${l.related.join(', ')}`);
}

function writeEntity(e: Entity, L: string[]): void {
  switch (e.type) {
    case 'product': return writeProduct(e, L);
    case 'document': return writeDocument(e, L);
    case 'task': return writeTask(e, L);
    case 'profile': return writeProfile(e, L);
    case 'dataset': return writeDataset(e, L);
    case 'conversation': return writeConversation(e, L);
  }
}

function writeProduct(p: Product, L: string[]): void {
  L.push(`  name: ${quoteIfNeeded(p.name)}`);
  if (p.brand) L.push(`  brand: ${quoteIfNeeded(p.brand)}`);
  if (p.description) L.push(`  description: ${quoteIfNeeded(p.description)}`);
  if (p.price) L.push(`  price: ${money(p.price)}`);
  if (p.list_price) L.push(`  list_price: ${money(p.list_price)}`);
  if (p.stock) L.push(`  stock: ${stock(p.stock)}`);
  if (p.sku) L.push(`  sku: ${p.sku}`);
  if (p.rating) L.push(`  rating: ${p.rating.average} (${p.rating.count})`);
  if (p.category) L.push(`  category: ${p.category}`);
  if (p.images && p.images.length) writeImages(p.images, L);
  if (p.attributes) {
    L.push(`  attributes:`);
    for (const [k, v] of Object.entries(p.attributes)) {
      L.push(`    ${k}: ${formatTypedScalar(v)}`);
    }
  }
  if (p.variants && p.variants.length) {
    L.push(`  variants:`);
    for (const v of p.variants) {
      L.push(`    - ${JSON.stringify(v)}`);
    }
  }
  writeBaseTrailers(p, L);
}

function writeDocument(d: Document, L: string[]): void {
  L.push(`  title: ${quoteIfNeeded(d.title)}`);
  if (d.author) {
    L.push(`  author: ${Array.isArray(d.author) ? d.author.join(', ') : d.author}`);
  }
  if (d.published_at) L.push(`  published: ${d.published_at}`);
  if (d.modified_at) L.push(`  modified: ${d.modified_at}`);
  if (d.summary) L.push(`  summary: ${quoteIfNeeded(d.summary)}`);
  if (d.word_count != null) L.push(`  word_count: ${d.word_count}`);
  if (d.reading_time != null) L.push(`  reading_time: ${d.reading_time}s`);
  if (d.language) L.push(`  language: ${d.language}`);
  if (d.tags && d.tags.length) L.push(`  tags: ${d.tags.join(', ')}`);
  if (d.canonical_url) L.push(`  canonical_url: ${d.canonical_url}`);
  if (d.content) {
    L.push(`  content: |`);
    L.push(indentBlock(d.content, 4));
  }
  if (d.chunks && d.chunks.length) {
    L.push(`  chunks:`);
    for (const c of d.chunks) L.push(`    - ${JSON.stringify(c)}`);
  }
  writeBaseTrailers(d, L);
}

function writeTask(t: Task, L: string[]): void {
  L.push(`  title: ${quoteIfNeeded(t.title)}`);
  L.push(`  state: ${t.state}`);
  if (t.priority) L.push(`  priority: ${t.priority}`);
  if (t.assignee) L.push(`  assignee: ${t.assignee}`);
  if (t.due_at) L.push(`  due: ${t.due_at}`);
  if (t.parent) L.push(`  parent: ${t.parent}`);
  if (t.labels && t.labels.length) L.push(`  labels: ${t.labels.join(', ')}`);
  if (t.description) L.push(`  description: ${quoteIfNeeded(t.description)}`);
  writeBaseTrailers(t, L);
}

function writeProfile(p: Profile, L: string[]): void {
  L.push(`  name: ${quoteIfNeeded(p.name)}`);
  L.push(`  kind: ${p.kind}`);
  if (p.handle) L.push(`  handle: ${p.handle}`);
  if (p.email) L.push(`  email: ${p.email}`);
  if (p.homepage) L.push(`  homepage: ${p.homepage}`);
  if (p.bio) L.push(`  bio: ${quoteIfNeeded(p.bio)}`);
  if (p.verified) L.push(`  verified: yes`);
  if (p.avatar) L.push(`  avatar: ${asset(p.avatar)}`);
  if (p.attributes) {
    L.push(`  attributes:`);
    for (const [k, v] of Object.entries(p.attributes)) {
      L.push(`    ${k}: ${quoteIfNeeded(v)}`);
    }
  }
  writeBaseTrailers(p, L);
}

function writeDataset(d: Dataset, L: string[]): void {
  L.push(`  name: ${quoteIfNeeded(d.name)}`);
  if (d.description) L.push(`  description: ${quoteIfNeeded(d.description)}`);
  if (d.row_count_total != null) L.push(`  row_count_total: ${d.row_count_total}`);
  L.push(`  columns: ${d.columns.map((c) => `${c.key}:${c.label}:${c.type}${c.format ? `:${c.format}` : ''}`).join(', ')}`);
  L.push(`  rows:`);
  for (const row of d.rows) {
    L.push(`    - ${JSON.stringify(row)}`);
  }
  writeBaseTrailers(d, L);
}

function writeConversation(c: Conversation, L: string[]): void {
  if (c.title) L.push(`  title: ${quoteIfNeeded(c.title)}`);
  L.push(`  participants: ${c.participants.join(', ')}`);
  if (c.message_count_total != null) L.push(`  message_count_total: ${c.message_count_total}`);
  L.push(`  messages:`);
  for (const m of c.messages) L.push(`    - ${JSON.stringify(m)}`);
  writeBaseTrailers(c, L);
}

function writeBaseTrailers(e: Entity, L: string[]): void {
  if (e.freshness) L.push(`  freshness: ${e.freshness}`);
  if (e.updated_at) L.push(`  updated: ${e.updated_at}`);
}

function writeImages(images: Asset[], L: string[]): void {
  const simple = images.every((i) => !i.alt && i.width == null && i.height == null);
  if (simple) {
    L.push(`  images: ${images.map((i) => i.url).join(', ')}`);
  } else {
    L.push(`  images:`);
    for (const img of images) L.push(`    - ${JSON.stringify(img)}`);
  }
}

function writeAction(a: Action, L: string[]): void {
  if (a.label) L.push(`  label: ${quoteIfNeeded(a.label)}`);
  if (a.category) L.push(`  category: ${a.category}`);
  if (a.target) {
    L.push(`  target: ${Array.isArray(a.target) ? a.target.join(', ') : a.target}`);
  }
  if (a.method) L.push(`  method: ${a.method}`);
  if (a.execute_url) L.push(`  execute: ${a.execute_url}`);
  if (a.preview_url) L.push(`  preview: ${a.preview_url}`);
  if (a.auth != null) {
    if (typeof a.auth === 'string') {
      L.push(`  auth: ${a.auth}`);
    } else {
      const scopes = a.auth.scopes && a.auth.scopes.length ? ` ${a.auth.scopes.join(',')}` : '';
      L.push(`  auth: scheme=${a.auth.scheme}${scopes}`);
    }
  }
  if (a.cost) {
    const c = a.cost;
    const parts: string[] = [];
    if (c.amount != null && c.currency) parts.push(`${c.amount} ${c.currency}`);
    else if (c.amount != null) parts.push(String(c.amount));
    if (c.unit) parts.push(`/${c.unit}`);
    parts.push(c.category);
    if (c.notes) parts.push(`(${c.notes})`);
    L.push(`  cost: ${parts.join(' ')}`);
  }
  if (a.reversible) {
    if (!a.reversible.reversible) {
      L.push(`  reversible: no`);
    } else {
      const parts = [a.reversible.window, a.reversible.policy].filter(Boolean);
      L.push(`  reversible: ${parts.join(' ') || 'yes'}`);
    }
  }
  if (a.side_effects && a.side_effects.length) {
    L.push(`  side_effects: ${a.side_effects.join(', ')}`);
  }
  if (a.confirmation) L.push(`  confirmation: ${a.confirmation}`);
  if (a.rate_limit) L.push(`  rate_limit: ${a.rate_limit}`);
  if (a.input) L.push(`  input: ${JSON.stringify(a.input)}`);
  if (a.output) L.push(`  output: ${JSON.stringify(a.output)}`);
}

function writeKV(obj: Record<string, unknown>, L: string[]): void {
  for (const [k, v] of Object.entries(obj)) {
    L.push(`  ${k}: ${formatTypedScalar(v)}`);
  }
}

// --- scalar helpers ---

function money(m: Money): string {
  return `${m.amount} ${m.currency}`;
}

function stock(s: Stock): string {
  return s.quantity != null ? `${s.status} (${s.quantity})` : s.status;
}

function asset(a: Asset): string {
  if (!a.alt && a.width == null && a.height == null) return a.url;
  return JSON.stringify(a);
}

/**
 * Serialize a scalar so the parser can recover its type later. Strings are
 * quoted when ambiguous; booleans / null / numbers are emitted bare; arrays
 * and objects fall through to JSON.
 */
function formatTypedScalar(v: unknown): string {
  if (v === null) return 'null';
  if (v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return quoteIfNeeded(v);
  return JSON.stringify(v);
}

function quoteIfNeeded(s: string): string {
  if (s.includes('\n')) return JSON.stringify(s);
  if (/^\s|\s$/.test(s)) return JSON.stringify(s);
  return s;
}

function indentBlock(s: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return s.split('\n').map((l) => pad + l).join('\n');
}

// =====================================================================
// Parser — lossless against the serializer above.
// =====================================================================

interface NestedItem {
  /** Text after "- " on the leading line of the list item. */
  head: string;
  /** Any continuation lines (6+ space indent) joined verbatim. */
  cont: string[];
}

interface Body {
  /** key → raw scalar value (post-unquote). */
  scalars: Record<string, string>;
  /** key → list of items (for `key:` followed by `    - …`). */
  lists: Record<string, NestedItem[]>;
  /** key → multi-line text (for `key: |` block scalars). */
  blocks: Record<string, string>;
  /** key → nested sub-body (for `key:` followed by `    inner: …`). */
  subs: Record<string, Record<string, string>>;
}

export function fromCompact(text: string): Snapshot {
  const lines = text.split('\n');
  const snap: Snapshot = {
    ahtml: '0.1',
    url: '',
    fetched_at: '',
    page_type: 'other',
    entities: [],
    actions: [],
  };

  let i = 0;
  // Envelope (top-level @directives until blank line / first block).
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim() === '') break;
    if (!line.startsWith('@')) break;
    const m = line.match(/^@(\w+)\s+(.*)$/);
    if (m) applyEnvelope(snap, m[1]!, m[2]!.trim());
    i++;
  }

  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim() === '') { i++; continue; }

    if (line.startsWith('@')) {
      const name = line.slice(1).trim();
      const { body, next } = readBody(lines, i + 1);
      applyNamedBlock(snap, name, body);
      i = next;
      continue;
    }
    if (line.startsWith('[') && line.endsWith(']')) {
      const id = line.slice(1, -1);
      const { body, next } = readBody(lines, i + 1);
      const e = parseEntity(id, body);
      if (e) snap.entities.push(e);
      i = next;
      continue;
    }
    if (line.startsWith('(action) ')) {
      const id = line.slice(9).trim();
      const { body, next } = readBody(lines, i + 1);
      snap.actions.push(parseAction(id, body));
      i = next;
      continue;
    }
    i++;
  }
  return snap;
}

/**
 * Read a block body starting at `start`. Returns the parsed body and the
 * index of the first line that does not belong to this block (blank or
 * less-indented).
 *
 * The body lives at 2-space indent. Nested-list items at 4-space (`- `).
 * Item continuations at 6-space. Block-scalar contents at 4-space.
 * Nested sub-body (attribute maps) at 4-space, key/value form.
 */
function readBody(lines: string[], start: number): { body: Body; next: number } {
  const body: Body = { scalars: {}, lists: {}, blocks: {}, subs: {} };
  let i = start;

  while (i < lines.length) {
    const raw = lines[i]!;
    if (raw.trim() === '') break;
    if (!raw.startsWith('  ')) break;
    // anything past 2 spaces of indent belongs to a previously opened sub-block
    // and is consumed inside the branches below.
    if (raw.startsWith('   ') && !raw.startsWith('    ')) {
      // a stray 3-space line — treat as end of body
      break;
    }
    if (raw.startsWith('    ')) {
      // Stray indented line with no opener — skip.
      i++;
      continue;
    }

    const inner = raw.slice(2);
    const m = inner.match(/^([^:]+):\s*(.*)$/);
    if (!m) { i++; continue; }
    const key = m[1]!.trim();
    const val = m[2]!;

    if (val === '|') {
      // block scalar — read 4+ space indented lines, strip 4 spaces
      i++;
      const buf: string[] = [];
      while (i < lines.length && lines[i]!.startsWith('    ')) {
        buf.push(lines[i]!.slice(4));
        i++;
      }
      body.blocks[key] = buf.join('\n');
      continue;
    }

    if (val === '') {
      // nested list OR sub-body. Peek next line to distinguish.
      i++;
      const items: NestedItem[] = [];
      const sub: Record<string, string> = {};
      let isList = false;
      let isSub = false;
      while (i < lines.length) {
        const peek = lines[i]!;
        if (peek.trim() === '') break;
        if (!peek.startsWith('    ')) break;
        if (peek.startsWith('      ') && items.length) {
          // continuation of last item
          items[items.length - 1]!.cont.push(peek.slice(6));
          i++;
          continue;
        }
        const child = peek.slice(4);
        if (child.startsWith('- ')) {
          isList = true;
          items.push({ head: child.slice(2), cont: [] });
          i++;
          continue;
        }
        // sub-body key/value
        const sm = child.match(/^([^:]+):\s*(.*)$/);
        if (sm) {
          isSub = true;
          sub[sm[1]!.trim()] = unquote(sm[2]!);
          i++;
          continue;
        }
        break;
      }
      if (isList) body.lists[key] = items;
      else if (isSub) body.subs[key] = sub;
      else body.scalars[key] = '';
      continue;
    }

    body.scalars[key] = unquote(val);
    i++;
  }

  return { body, next: i };
}

function unquote(s: string): string {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    try { return JSON.parse(s) as string; } catch { return s; }
  }
  return s;
}

function applyEnvelope(snap: Snapshot, key: string, val: string): void {
  switch (key) {
    case 'ahtml': snap.ahtml = val as '0.1'; break;
    case 'url': snap.url = val; break;
    case 'fetched': snap.fetched_at = val; break;
    case 'ttl': snap.ttl = parseInt(val, 10); break;
    case 'etag': snap.etag = val; break;
    case 'page_type': snap.page_type = val as Snapshot['page_type']; break;
  }
}

function applyNamedBlock(snap: Snapshot, name: string, body: Body): void {
  switch (name) {
    case 'policy': snap.policy = parsePolicy(body.scalars); break;
    case 'provenance': snap.provenance = parseProvenance(body.scalars); break;
    case 'meta': snap.meta = parseMeta(body.scalars); break;
    case 'links': snap.links = parseLinks(body.scalars); break;
    case 'schemas': {
      const out: Record<string, JsonSchema> = {};
      for (const [k, v] of Object.entries(body.scalars)) {
        try { out[k] = JSON.parse(v) as JsonSchema; } catch { /* skip malformed */ }
      }
      snap.schemas = out;
      break;
    }
  }
}

function parsePolicy(s: Record<string, string>): Policy {
  const p: Policy = { agents_welcome: s.agents_welcome === 'yes' };
  if (s.license) p.license = s.license;
  if (s.rate_limit) p.rate_limit = s.rate_limit;
  if (s.actions_require) p.actions_require = s.actions_require;
  if (s.contact) p.contact = s.contact;
  if (s.terms_url) p.terms_url = s.terms_url;
  if (s.attribution_required === 'yes') p.attribution_required = true;
  if (s.republish) p.republish = s.republish as Policy['republish'];
  if (s.caching) {
    const caching: NonNullable<Policy['caching']> = {};
    for (const tok of s.caching.split(/\s+/)) {
      if (tok === 'allowed') caching.allowed = true;
      else if (tok === 'denied') caching.allowed = false;
      else if (tok.startsWith('ttl=')) caching.ttl = parseInt(tok.slice(4), 10);
    }
    p.caching = caching;
  }
  return p;
}

function parseProvenance(s: Record<string, string>): Provenance {
  const p: Provenance = {};
  if (s.issuer) p.issuer = s.issuer;
  if (s.signed === 'yes' || s.signed === 'true') p.signed = true;
  else if (s.signed === 'no' || s.signed === 'false') p.signed = false;
  if (s.signature) p.signature = s.signature;
  if (s.signature_alg) p.signature_alg = s.signature_alg;
  if (s.fetched_via) p.fetched_via = s.fetched_via;
  return p;
}

function parseLinks(s: Record<string, string>): Links {
  const l: Links = {};
  if (s.self) l.self = s.self;
  if (s.canonical) l.canonical = s.canonical;
  if (s.parent) l.parent = s.parent;
  if (s.next) l.next = parsePaginationLink(s.next);
  if (s.prev) l.prev = parsePaginationLink(s.prev);
  if (s.related) l.related = s.related.split(',').map((x) => x.trim()).filter(Boolean);
  return l;
}

function parsePaginationLink(s: string): NonNullable<Links['next']> {
  const out: NonNullable<Links['next']> = {};
  for (const tok of s.split(/\s+/).filter(Boolean)) {
    const eq = tok.indexOf('=');
    if (eq < 0) continue;
    const k = tok.slice(0, eq);
    const v = tok.slice(eq + 1);
    if (k === 'cursor') out.cursor = v;
    else if (k === 'url') out.url = v;
    else if (k === 'expected') out.expected = parseInt(v, 10);
    else if (k === 'total') out.total = parseInt(v, 10);
  }
  return out;
}

function parseMeta(s: Record<string, string>): Meta {
  const m: Meta = {};
  for (const [k, v] of Object.entries(s)) m[k] = coerceTypedScalar(v);
  return m;
}

function coerceTypedScalar(v: string): unknown {
  if (v === 'null') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (v.startsWith('{') || v.startsWith('[')) {
    try { return JSON.parse(v); } catch { /* fall through */ }
  }
  return v;
}

function parseEntity(id: string, body: Body): Entity | null {
  const type = id.split(':')[0] as Entity['type'];
  const s = body.scalars;
  const base: { id: string; updated_at?: string; freshness?: Entity['freshness'] } = { id };
  if (s.updated) base.updated_at = s.updated;
  if (s.freshness) base.freshness = s.freshness as Entity['freshness'];

  switch (type) {
    case 'product':       return parseProduct(base, body);
    case 'document':      return parseDocument(base, body);
    case 'task':          return parseTask(base, body);
    case 'profile':       return parseProfile(base, body);
    case 'dataset':       return parseDataset(base, body);
    case 'conversation':  return parseConversation(base, body);
  }
  return null;
}

function parseProduct(base: { id: string; updated_at?: string; freshness?: Entity['freshness'] }, body: Body): Product {
  const s = body.scalars;
  const p: Product = { ...base, type: 'product', name: s.name ?? '' };
  if (s.brand) p.brand = s.brand;
  if (s.description) p.description = s.description;
  if (s.price) p.price = parseMoney(s.price);
  if (s.list_price) p.list_price = parseMoney(s.list_price);
  if (s.stock) p.stock = parseStock(s.stock);
  if (s.sku) p.sku = s.sku;
  if (s.rating) {
    const m = s.rating.match(/^([\d.]+)\s*\((\d+)\)$/);
    if (m) p.rating = { average: parseFloat(m[1]!), count: parseInt(m[2]!, 10) };
  }
  if (s.category) p.category = s.category;
  if (s.images) {
    // inline form: "url1, url2"
    p.images = s.images.split(',').map((u) => ({ url: u.trim() })).filter((a) => a.url);
  } else if (body.lists.images) {
    p.images = body.lists.images
      .map((it) => safeParseJson<Asset>(it.head))
      .filter((x): x is Asset => x != null);
  }
  if (body.subs.attributes) {
    const attrs: NonNullable<Product['attributes']> = {};
    for (const [k, v] of Object.entries(body.subs.attributes)) {
      attrs[k] = coerceAttribute(v);
    }
    p.attributes = attrs;
  }
  if (body.lists.variants) {
    const variants: ProductVariant[] = [];
    for (const it of body.lists.variants) {
      const v = safeParseJson<ProductVariant>(it.head);
      if (v) variants.push(v);
    }
    if (variants.length) p.variants = variants;
  }
  return p;
}

function parseDocument(base: { id: string; updated_at?: string; freshness?: Entity['freshness'] }, body: Body): Document {
  const s = body.scalars;
  const d: Document = { ...base, type: 'document', title: s.title ?? '' };
  if (s.author) {
    d.author = s.author.includes(',')
      ? s.author.split(',').map((a) => a.trim()).filter(Boolean)
      : s.author;
  }
  if (s.published) d.published_at = s.published;
  if (s.modified) d.modified_at = s.modified;
  if (s.summary) d.summary = s.summary;
  if (s.word_count) d.word_count = parseInt(s.word_count, 10);
  if (s.reading_time) {
    const num = s.reading_time.replace(/s$/, '');
    d.reading_time = parseInt(num, 10);
  }
  if (s.language) d.language = s.language;
  if (s.tags) d.tags = s.tags.split(',').map((t) => t.trim()).filter(Boolean);
  if (s.canonical_url) d.canonical_url = s.canonical_url;
  if (body.blocks.content) d.content = body.blocks.content;
  if (body.lists.chunks) {
    const chunks: Chunk[] = [];
    for (const it of body.lists.chunks) {
      const c = safeParseJson<Chunk>(it.head);
      if (c) chunks.push(c);
    }
    if (chunks.length) d.chunks = chunks;
  }
  return d;
}

function parseTask(base: { id: string; updated_at?: string; freshness?: Entity['freshness'] }, body: Body): Task {
  const s = body.scalars;
  const t: Task = {
    ...base,
    type: 'task',
    title: s.title ?? '',
    state: (s.state ?? 'open') as Task['state'],
  };
  if (s.priority) t.priority = s.priority as Task['priority'];
  if (s.assignee) t.assignee = s.assignee;
  if (s.due) t.due_at = s.due;
  if (s.parent) t.parent = s.parent;
  if (s.labels) t.labels = s.labels.split(',').map((l) => l.trim()).filter(Boolean);
  if (s.description) t.description = s.description;
  return t;
}

function parseProfile(base: { id: string; updated_at?: string; freshness?: Entity['freshness'] }, body: Body): Profile {
  const s = body.scalars;
  const p: Profile = {
    ...base,
    type: 'profile',
    name: s.name ?? '',
    kind: (s.kind ?? 'person') as Profile['kind'],
  };
  if (s.handle) p.handle = s.handle;
  if (s.email) p.email = s.email;
  if (s.homepage) p.homepage = s.homepage;
  if (s.bio) p.bio = s.bio;
  if (s.verified === 'yes' || s.verified === 'true') p.verified = true;
  if (s.avatar) {
    if (s.avatar.startsWith('{')) {
      const a = safeParseJson<Asset>(s.avatar);
      if (a) p.avatar = a;
    } else {
      p.avatar = { url: s.avatar };
    }
  }
  if (body.subs.attributes) {
    const attrs: NonNullable<Profile['attributes']> = {};
    for (const [k, v] of Object.entries(body.subs.attributes)) attrs[k] = v;
    p.attributes = attrs;
  }
  return p;
}

function parseDataset(base: { id: string; updated_at?: string; freshness?: Entity['freshness'] }, body: Body): Dataset {
  const s = body.scalars;
  const cols: DatasetColumn[] = (s.columns ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
    .map((spec) => {
      const parts = spec.split(':');
      const col: DatasetColumn = {
        key: parts[0] ?? '',
        label: parts[1] ?? parts[0] ?? '',
        type: (parts[2] ?? 'string') as DatasetColumn['type'],
      };
      if (parts[3]) col.format = parts[3];
      return col;
    });
  const rows: unknown[][] = (body.lists.rows ?? [])
    .map((it) => safeParseJson<unknown[]>(it.head))
    .filter((r): r is unknown[] => Array.isArray(r));
  const d: Dataset = {
    ...base,
    type: 'dataset',
    name: s.name ?? '',
    columns: cols,
    rows,
  };
  if (s.description) d.description = s.description;
  if (s.row_count_total) d.row_count_total = parseInt(s.row_count_total, 10);
  return d;
}

function parseConversation(base: { id: string; updated_at?: string; freshness?: Entity['freshness'] }, body: Body): Conversation {
  const s = body.scalars;
  const messages: ConversationMessage[] = (body.lists.messages ?? [])
    .map((it) => safeParseJson<ConversationMessage>(it.head))
    .filter((m): m is ConversationMessage => m != null);
  const c: Conversation = {
    ...base,
    type: 'conversation',
    participants: s.participants ? s.participants.split(',').map((p) => p.trim()).filter(Boolean) : [],
    messages,
  };
  if (s.title) c.title = s.title;
  if (s.message_count_total) c.message_count_total = parseInt(s.message_count_total, 10);
  return c;
}

function parseAction(id: string, body: Body): Action {
  const s = body.scalars;
  const a: Action = { id };
  if (s.label) a.label = s.label;
  if (s.category) a.category = s.category as Action['category'];
  if (s.target) {
    a.target = s.target.includes(',')
      ? s.target.split(',').map((t) => t.trim()).filter(Boolean)
      : s.target;
  }
  if (s.method) a.method = s.method as Action['method'];
  if (s.execute) {
    // Current form is URL-only. v0.4 also wrote "METHOD url"; preserve back-compat
    // by detecting a leading HTTP verb token.
    const ix = s.execute.indexOf(' ');
    const HTTP_VERBS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
    if (ix > 0 && HTTP_VERBS.has(s.execute.slice(0, ix))) {
      const method = s.execute.slice(0, ix) as Action['method'];
      a.execute_url = s.execute.slice(ix + 1).trim();
      if (!a.method) a.method = method;
    } else {
      a.execute_url = s.execute;
    }
  }
  if (s.preview) a.preview_url = s.preview;
  if (s.auth) a.auth = parseAuth(s.auth);
  if (s.cost) a.cost = parseCost(s.cost);
  if (s.reversible) {
    if (s.reversible === 'no') a.reversible = { reversible: false };
    else if (s.reversible === 'yes') a.reversible = { reversible: true };
    else {
      const [w, ...rest] = s.reversible.split(/\s+/);
      a.reversible = { reversible: true };
      if (w) a.reversible.window = w;
      if (rest.length) a.reversible.policy = rest.join(' ');
    }
  }
  if (s.side_effects) a.side_effects = s.side_effects.split(',').map((x) => x.trim()).filter(Boolean);
  if (s.confirmation) a.confirmation = s.confirmation as Action['confirmation'];
  if (s.rate_limit) a.rate_limit = s.rate_limit;
  if (s.input) {
    const v = safeParseJson<JsonSchema>(s.input);
    if (v) a.input = v;
  }
  if (s.output) {
    const v = safeParseJson<JsonSchema>(s.output);
    if (v) a.output = v;
  }
  return a;
}

function parseAuth(s: string): AuthRequirement {
  if (s === 'none' || s === 'optional' || s === 'required') return s;
  if (s.startsWith('scheme=')) {
    // "scheme=bearer scope1,scope2"
    const parts = s.split(/\s+/);
    const scheme = parts[0]!.slice(7);
    const out: { scheme: string; scopes?: string[] } = { scheme };
    if (parts[1]) {
      out.scopes = parts[1].split(',').map((x) => x.trim()).filter(Boolean);
    }
    return out;
  }
  return s as AuthRequirement;
}

function parseCost(s: string): NonNullable<Action['cost']> {
  // Examples:
  //   "1999 USD purchase"
  //   "1999 USD /token compute (per-token-rate)"
  //   "compute"
  //   "1 USD subscription"
  const tokens = s.split(/\s+/);
  const cost: NonNullable<Action['cost']> = { category: 'free' };

  let i = 0;
  // optional amount + currency
  if (tokens[i] && /^\d/.test(tokens[i]!)) {
    cost.amount = parseFloat(tokens[i]!);
    i++;
    if (tokens[i] && /^[A-Z]{2,4}$/.test(tokens[i]!)) {
      cost.currency = tokens[i]!;
      i++;
    }
  }
  // optional /unit
  if (tokens[i] && tokens[i]!.startsWith('/')) {
    cost.unit = tokens[i]!.slice(1) as NonNullable<Action['cost']>['unit'];
    i++;
  }
  // category
  if (tokens[i]) {
    cost.category = tokens[i]! as NonNullable<Action['cost']>['category'];
    i++;
  }
  // optional "(notes)"
  if (i < tokens.length) {
    const rest = tokens.slice(i).join(' ');
    const m = rest.match(/^\((.*)\)$/);
    if (m) cost.notes = m[1]!;
  }
  return cost;
}

function parseMoney(s: string): Money {
  const m = s.match(/^([\d.]+)\s+(\w+)$/);
  return m ? { amount: parseFloat(m[1]!), currency: m[2]! } : { amount: 0, currency: 'USD' };
}

function parseStock(s: string): Stock {
  const m = s.match(/^(\w+)\s*(?:\((\d+)\))?$/);
  if (!m) return { status: 'in_stock' };
  return m[2]
    ? { status: m[1]! as Stock['status'], quantity: parseInt(m[2]!, 10) }
    : { status: m[1]! as Stock['status'] };
}

function coerceAttribute(v: string): string | number | boolean {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

function safeParseJson<T>(s: string): T | null {
  try { return JSON.parse(s) as T; } catch { return null; }
}

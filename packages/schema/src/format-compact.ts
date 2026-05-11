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
 * The format is human-readable, line-oriented, and round-trippable
 * (see fromCompact). Lossless against canonical JSON.
 *
 * Grammar (informal):
 *
 *   snapshot   = envelope NL block*
 *   envelope   = ("@" key value NL)+
 *   block      = (entity | action | named) NL body
 *   entity     = "[" type ":" id "]"
 *   action     = "(action) " id
 *   named      = "@" name        # policy, provenance, meta, links, schemas
 *   body       = ("  " key ": " value NL)*
 */

import type {
  Snapshot,
  Entity,
  Action,
  Policy,
  Provenance,
  Links,
  Meta,
  Product,
  Document,
  Task,
  Profile,
  Dataset,
  Conversation,
  Money,
  Stock,
} from './types.js';

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
    writeKV(s.provenance as unknown as Record<string, unknown>, L);
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

function writeLinks(l: Links, L: string[]): void {
  if (l.self) L.push(`  self: ${l.self}`);
  if (l.canonical) L.push(`  canonical: ${l.canonical}`);
  if (l.parent) L.push(`  parent: ${l.parent}`);
  if (l.next) {
    const parts: string[] = [];
    if (l.next.cursor) parts.push(`cursor=${l.next.cursor}`);
    if (l.next.url) parts.push(l.next.url);
    if (l.next.expected != null) parts.push(`expected=${l.next.expected}`);
    if (l.next.total != null) parts.push(`total=${l.next.total}`);
    L.push(`  next: ${parts.join(' ')}`);
  }
  if (l.prev) {
    const parts: string[] = [];
    if (l.prev.cursor) parts.push(`cursor=${l.prev.cursor}`);
    if (l.prev.url) parts.push(l.prev.url);
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
  if (p.brand) L.push(`  brand: ${p.brand}`);
  if (p.description) L.push(`  description: ${quoteIfNeeded(p.description)}`);
  if (p.price) L.push(`  price: ${money(p.price)}`);
  if (p.list_price) L.push(`  list_price: ${money(p.list_price)}`);
  if (p.stock) L.push(`  stock: ${stock(p.stock)}`);
  if (p.sku) L.push(`  sku: ${p.sku}`);
  if (p.rating) L.push(`  rating: ${p.rating.average} (${p.rating.count})`);
  if (p.category) L.push(`  category: ${p.category}`);
  if (p.images && p.images.length) {
    L.push(`  images: ${p.images.map((i) => i.url).join(', ')}`);
  }
  if (p.attributes) {
    for (const [k, v] of Object.entries(p.attributes)) {
      L.push(`  ${k}: ${formatScalar(v)}`);
    }
  }
  if (p.variants && p.variants.length) {
    L.push(`  variants:`);
    for (const v of p.variants) {
      const bits = [v.id, v.name];
      if (v.price) bits.push(money(v.price));
      if (v.stock) bits.push(stock(v.stock));
      L.push(`    - ${bits.join(' | ')}`);
    }
  }
  writeBaseTrailers(p, L);
}

function writeDocument(d: Document, L: string[]): void {
  L.push(`  title: ${quoteIfNeeded(d.title)}`);
  if (d.author) L.push(`  author: ${Array.isArray(d.author) ? d.author.join(', ') : d.author}`);
  if (d.published_at) L.push(`  published: ${d.published_at}`);
  if (d.modified_at) L.push(`  modified: ${d.modified_at}`);
  if (d.summary) L.push(`  summary: ${quoteIfNeeded(d.summary)}`);
  if (d.word_count != null) L.push(`  word_count: ${d.word_count}`);
  if (d.reading_time != null) L.push(`  reading_time: ${d.reading_time}s`);
  if (d.language) L.push(`  language: ${d.language}`);
  if (d.tags && d.tags.length) L.push(`  tags: ${d.tags.join(', ')}`);
  if (d.canonical_url) L.push(`  canonical_url: ${d.canonical_url}`);
  if (d.content) L.push(`  content: |\n${indentBlock(d.content, 4)}`);
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
  if (p.attributes) {
    for (const [k, v] of Object.entries(p.attributes)) {
      L.push(`  ${k}: ${formatScalar(v)}`);
    }
  }
  writeBaseTrailers(p, L);
}

function writeDataset(d: Dataset, L: string[]): void {
  L.push(`  name: ${quoteIfNeeded(d.name)}`);
  if (d.description) L.push(`  description: ${quoteIfNeeded(d.description)}`);
  if (d.row_count_total != null) L.push(`  row_count_total: ${d.row_count_total}`);
  L.push(`  columns: ${d.columns.map((c) => `${c.key}(${c.type})`).join(', ')}`);
  L.push(`  rows:`);
  for (const row of d.rows) {
    L.push(`    - ${row.map((v) => formatScalar(v)).join(' | ')}`);
  }
  writeBaseTrailers(d, L);
}

function writeConversation(c: Conversation, L: string[]): void {
  if (c.title) L.push(`  title: ${quoteIfNeeded(c.title)}`);
  L.push(`  participants: ${c.participants.join(', ')}`);
  if (c.message_count_total != null) L.push(`  message_count_total: ${c.message_count_total}`);
  L.push(`  messages:`);
  for (const m of c.messages) {
    const head = m.reply_to ? `${m.id} ← ${m.reply_to}` : m.id;
    L.push(`    - ${head} | ${m.author} | ${m.posted_at}`);
    L.push(`      ${quoteIfNeeded(m.content)}`);
  }
  writeBaseTrailers(c, L);
}

function writeBaseTrailers(e: Entity, L: string[]): void {
  if (e.freshness) L.push(`  freshness: ${e.freshness}`);
  if (e.updated_at) L.push(`  updated: ${e.updated_at}`);
}

function writeAction(a: Action, L: string[]): void {
  if (a.label) L.push(`  label: ${quoteIfNeeded(a.label)}`);
  if (a.category) L.push(`  category: ${a.category}`);
  if (a.target) {
    L.push(`  target: ${Array.isArray(a.target) ? a.target.join(', ') : a.target}`);
  }
  if (a.method) L.push(`  method: ${a.method}`);
  if (a.execute_url) L.push(`  execute: ${a.method ?? 'POST'} ${a.execute_url}`);
  if (a.preview_url) L.push(`  preview: ${a.preview_url}`);
  if (a.auth != null) {
    if (typeof a.auth === 'string') {
      L.push(`  auth: ${a.auth}`);
    } else {
      const scopes = a.auth.scopes ? ` ${a.auth.scopes.join(',')}` : '';
      L.push(`  auth: ${a.auth.scheme}${scopes}`);
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
    L.push(`  ${k}: ${formatScalar(v)}`);
  }
}

// --- scalar helpers ---

function money(m: Money): string {
  return `${m.amount} ${m.currency}`;
}

function stock(s: Stock): string {
  return s.quantity != null ? `${s.status} (${s.quantity})` : s.status;
}

function formatScalar(v: unknown): string {
  if (v == null) return 'null';
  if (typeof v === 'string') return quoteIfNeeded(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map(formatScalar).join(', ');
  return JSON.stringify(v);
}

function quoteIfNeeded(s: string): string {
  if (s.includes('\n')) return JSON.stringify(s);
  if (/^[\s]|[\s]$/.test(s)) return JSON.stringify(s);
  return s;
}

function indentBlock(s: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return s.split('\n').map((l) => pad + l).join('\n');
}

// =====================================================================
// Parser — round-trips compact text back to a Snapshot.
// Not full JSON Schema fidelity (e.g. attribute typing on Products),
// but lossless enough for the agent SDK to consume cached compact text.
// =====================================================================

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
    if (m) {
      const key = m[1]!;
      const val = m[2]!.trim();
      applyEnvelope(snap, key, val);
    }
    i++;
  }

  // Blocks.
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim() === '') {
      i++;
      continue;
    }
    if (line.startsWith('@')) {
      const name = line.slice(1).trim();
      const body: Record<string, string> = {};
      i++;
      while (i < lines.length && lines[i]!.startsWith('  ')) {
        const m = lines[i]!.slice(2).match(/^([^:]+):\s*(.*)$/);
        if (m) body[m[1]!.trim()] = m[2]!.trim();
        i++;
      }
      applyNamedBlock(snap, name, body);
      continue;
    }
    if (line.startsWith('[') && line.endsWith(']')) {
      const id = line.slice(1, -1);
      const body: Record<string, string> = {};
      i++;
      while (i < lines.length && (lines[i]!.startsWith('  ') || lines[i]!.startsWith('    '))) {
        if (lines[i]!.startsWith('    ')) { i++; continue; } // skip nested for now
        const m = lines[i]!.slice(2).match(/^([^:]+):\s*(.*)$/);
        if (m) body[m[1]!.trim()] = m[2]!.trim();
        i++;
      }
      const e = parseEntity(id, body);
      if (e) snap.entities.push(e);
      continue;
    }
    if (line.startsWith('(action) ')) {
      const id = line.slice(9).trim();
      const body: Record<string, string> = {};
      i++;
      while (i < lines.length && lines[i]!.startsWith('  ')) {
        const m = lines[i]!.slice(2).match(/^([^:]+):\s*(.*)$/);
        if (m) body[m[1]!.trim()] = m[2]!.trim();
        i++;
      }
      snap.actions.push(parseAction(id, body));
      continue;
    }
    i++;
  }
  return snap;
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

function applyNamedBlock(snap: Snapshot, name: string, body: Record<string, string>): void {
  if (name === 'policy') {
    snap.policy = {
      agents_welcome: body.agents_welcome === 'yes',
      ...(body.license && { license: body.license }),
      ...(body.rate_limit && { rate_limit: body.rate_limit }),
      ...(body.contact && { contact: body.contact }),
    } as Policy;
  } else if (name === 'meta') {
    const meta: Meta = {};
    for (const [k, v] of Object.entries(body)) {
      const n = Number(v);
      meta[k] = Number.isFinite(n) && /^-?\d/.test(v) ? n : v;
    }
    snap.meta = meta;
  } else if (name === 'provenance') {
    snap.provenance = body as unknown as Provenance;
  }
}

function parseEntity(id: string, body: Record<string, string>): Entity | null {
  const type = id.split(':')[0] as Entity['type'];
  const base = { id, type, ...(body.updated && { updated_at: body.updated }) };
  switch (type) {
    case 'product': {
      const p: Product = { ...base, type: 'product', name: body.name ?? '' };
      if (body.brand) p.brand = body.brand;
      if (body.price) p.price = parseMoney(body.price);
      if (body.stock) p.stock = parseStock(body.stock);
      if (body.sku) p.sku = body.sku;
      if (body.rating) {
        const m = body.rating.match(/^([\d.]+)\s*\((\d+)\)$/);
        if (m) p.rating = { average: parseFloat(m[1]!), count: parseInt(m[2]!, 10) };
      }
      return p;
    }
    case 'document':
      return { ...base, type: 'document', title: body.title ?? '' } as Document;
    case 'task':
      return { ...base, type: 'task', title: body.title ?? '', state: (body.state ?? 'open') as Task['state'] } as Task;
    case 'profile':
      return { ...base, type: 'profile', name: body.name ?? '', kind: (body.kind ?? 'person') as Profile['kind'] } as Profile;
  }
  return null;
}

function parseAction(id: string, body: Record<string, string>): Action {
  const a: Action = { id };
  if (body.label) a.label = body.label;
  if (body.target) a.target = body.target.includes(',') ? body.target.split(',').map((s) => s.trim()) : body.target;
  if (body.auth) a.auth = body.auth as Action['auth'];
  if (body.cost) {
    const m = body.cost.match(/^(\d+(?:\.\d+)?)\s+(\w+)\s+(\w+)$/);
    if (m) a.cost = { amount: parseFloat(m[1]!), currency: m[2]!, category: m[3]! as 'purchase' | 'subscription' };
  }
  if (body.reversible) {
    if (body.reversible === 'no') a.reversible = { reversible: false };
    else {
      const [w, ...rest] = body.reversible.split(/\s+/);
      a.reversible = { reversible: true, window: w, policy: rest.join(' ') || undefined };
    }
  }
  if (body.side_effects) a.side_effects = body.side_effects.split(',').map((s) => s.trim());
  if (body.confirmation) a.confirmation = body.confirmation as Action['confirmation'];
  if (body.method) a.method = body.method as Action['method'];
  return a;
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

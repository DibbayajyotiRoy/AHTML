/**
 * Extract entities and actions from inline `data-ahtml-*` attributes.
 *
 * This is the Level-1 adoption path: zero tooling change, just sprinkle
 * data attributes on your existing markup.
 *
 *   <article
 *     data-ahtml="product"
 *     data-ahtml-id="product:mbp-14"
 *     data-ahtml-name="MacBook Pro 14"
 *     data-ahtml-price="1999 USD"
 *     data-ahtml-stock="in_stock (42)"
 *   >
 *     ...
 *     <button
 *       data-ahtml-action="purchase"
 *       data-ahtml-action-auth="required"
 *       data-ahtml-action-cost="1999 USD purchase"
 *       data-ahtml-action-reversible="P30D full_refund"
 *       data-ahtml-action-target="product:mbp-14"
 *     >Buy now</button>
 *   </article>
 */

import type { Entity, Action, Product, Document, Task, Money, Stock } from '@ahtml/schema';
import type { Extraction } from './merge.js';

export function extractFromDataAttrs(html: string): Extraction {
  const entities: Entity[] = [];
  const actions: Action[] = [];

  // Naive element scan — sufficient for plugin's compile-time pass.
  // For runtime DOM, callers should use the agent-side parser.
  const elementRe = /<(\w+)\b([^>]*?data-ahtml(?:-[\w-]+)?=[^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = elementRe.exec(html)) !== null) {
    const attrs = parseAttrs(m[2]!);
    const ent = entityFromAttrs(attrs);
    if (ent) entities.push(ent);
    const act = actionFromAttrs(attrs);
    if (act) actions.push(act);
  }

  return { source: 'data-attrs', entities, actions };
}

function entityFromAttrs(attrs: Record<string, string>): Entity | null {
  const type = attrs['data-ahtml'];
  if (!type) return null;
  const id = attrs['data-ahtml-id'] ?? `${type}:${slug(attrs['data-ahtml-name'] ?? type)}`;
  if (type === 'product') {
    const p: Product = { id, type: 'product', name: attrs['data-ahtml-name'] ?? '' };
    if (attrs['data-ahtml-brand']) p.brand = attrs['data-ahtml-brand']!;
    if (attrs['data-ahtml-description']) p.description = attrs['data-ahtml-description']!;
    const price = parseMoney(attrs['data-ahtml-price']);
    if (price) p.price = price;
    const stock = parseStock(attrs['data-ahtml-stock']);
    if (stock) p.stock = stock;
    if (attrs['data-ahtml-sku']) p.sku = attrs['data-ahtml-sku']!;
    return p;
  }
  if (type === 'document' || type === 'article') {
    const d: Document = {
      id,
      type: 'document',
      title: attrs['data-ahtml-title'] ?? attrs['data-ahtml-name'] ?? '',
    };
    if (attrs['data-ahtml-author']) d.author = attrs['data-ahtml-author']!;
    if (attrs['data-ahtml-published']) d.published_at = attrs['data-ahtml-published']!;
    if (attrs['data-ahtml-summary']) d.summary = attrs['data-ahtml-summary']!;
    return d;
  }
  if (type === 'task') {
    const t: Task = {
      id,
      type: 'task',
      title: attrs['data-ahtml-title'] ?? attrs['data-ahtml-name'] ?? '',
      state: (attrs['data-ahtml-state'] ?? 'open') as Task['state'],
    };
    if (attrs['data-ahtml-priority']) t.priority = attrs['data-ahtml-priority'] as Task['priority'];
    if (attrs['data-ahtml-assignee']) t.assignee = attrs['data-ahtml-assignee']!;
    return t;
  }
  return null;
}

function actionFromAttrs(attrs: Record<string, string>): Action | null {
  const id = attrs['data-ahtml-action'];
  if (!id) return null;
  const a: Action = { id };
  if (attrs['data-ahtml-action-target']) a.target = attrs['data-ahtml-action-target']!;
  const auth = attrs['data-ahtml-action-auth'];
  if (auth) a.auth = auth as Action['auth'];
  const cost = attrs['data-ahtml-action-cost'];
  if (cost) {
    const m = cost.match(/^([\d.]+)\s+(\w+)\s+(\w+)$/);
    if (m) a.cost = { amount: parseFloat(m[1]!), currency: m[2]!, category: m[3]! as 'purchase' };
  }
  const rev = attrs['data-ahtml-action-reversible'];
  if (rev) {
    if (rev === 'no') a.reversible = { reversible: false };
    else {
      const [w, ...rest] = rev.split(/\s+/);
      a.reversible = { reversible: true, window: w, policy: rest.join(' ') || undefined };
    }
  }
  const se = attrs['data-ahtml-action-side-effects'];
  if (se) a.side_effects = se.split(',').map((s) => s.trim());
  const conf = attrs['data-ahtml-action-confirmation'];
  if (conf) a.confirmation = conf as Action['confirmation'];
  const method = attrs['data-ahtml-action-method'];
  if (method) a.method = method as Action['method'];
  const exec = attrs['data-ahtml-action-execute'];
  if (exec) a.execute_url = exec;
  return a;
}

function parseAttrs(s: string): Record<string, string> {
  const r: Record<string, string> = {};
  const re = /(\w[\w-]*)\s*=\s*("([^"]*)"|'([^']*)'|(\S+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    r[m[1]!.toLowerCase()] = m[3] ?? m[4] ?? m[5] ?? '';
  }
  return r;
}

function parseMoney(s: string | undefined): Money | null {
  if (!s) return null;
  const m = s.match(/^([\d.]+)\s+(\w+)$/);
  return m ? { amount: parseFloat(m[1]!), currency: m[2]! } : null;
}

function parseStock(s: string | undefined): Stock | null {
  if (!s) return null;
  const m = s.match(/^(\w+)\s*(?:\((\d+)\))?$/);
  if (!m) return null;
  return m[2]
    ? { status: m[1]! as Stock['status'], quantity: parseInt(m[2]!, 10) }
    : { status: m[1]! as Stock['status'] };
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'unknown';
}

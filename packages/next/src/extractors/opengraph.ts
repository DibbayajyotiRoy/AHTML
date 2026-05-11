/**
 * Extract a fallback entity from OpenGraph + Twitter card meta tags.
 * Lower-precedence than schema.org, but covers sites that only ship OG.
 */

import type { Entity, Document, Product } from '@ahtml/schema';
import type { Extraction } from './merge.js';

export function extractFromOpenGraph(html: string): Extraction {
  const meta = readMeta(html);
  if (!meta.size) return { source: 'opengraph', entities: [], actions: [] };

  const ogType = meta.get('og:type') ?? 'website';
  const title = meta.get('og:title') ?? meta.get('twitter:title') ?? '';
  const description = meta.get('og:description') ?? meta.get('twitter:description') ?? '';
  const url = meta.get('og:url') ?? '';
  const image = meta.get('og:image') ?? meta.get('twitter:image');

  const entities: Entity[] = [];
  if (ogType === 'product') {
    const price = meta.get('product:price:amount') ?? meta.get('og:price:amount');
    const currency = meta.get('product:price:currency') ?? meta.get('og:price:currency') ?? 'USD';
    const id = `product:${slug(title || url)}`;
    const p: Product = { id, type: 'product', name: title || 'product' };
    if (description) p.description = description;
    if (price) p.price = { amount: Number(price), currency };
    if (image) p.images = [{ url: image }];
    entities.push(p);
  } else if (ogType === 'article' || ogType.startsWith('article')) {
    const d: Document = {
      id: `document:${slug(title || url)}`,
      type: 'document',
      title: title || 'untitled',
    };
    if (description) d.summary = description;
    if (meta.get('article:published_time')) d.published_at = meta.get('article:published_time');
    if (meta.get('article:modified_time')) d.modified_at = meta.get('article:modified_time');
    if (meta.get('article:author')) d.author = meta.get('article:author');
    if (url) d.canonical_url = url;
    entities.push(d);
  } else if (title) {
    const d: Document = {
      id: `document:${slug(title)}`,
      type: 'document',
      title,
    };
    if (description) d.summary = description;
    if (url) d.canonical_url = url;
    entities.push(d);
  }

  return { source: 'opengraph', entities, actions: [] };
}

function readMeta(html: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /<meta\s+([^>]+?)\/?\s*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const attrs = parseAttrs(m[1]!);
    const key = attrs.property ?? attrs.name;
    const value = attrs.content;
    if (key && value !== undefined) out.set(key.toLowerCase(), value);
  }
  return out;
}

function parseAttrs(s: string): Record<string, string> {
  const r: Record<string, string> = {};
  const re = /(\w[\w:-]*)\s*=\s*("([^"]*)"|'([^']*)'|(\S+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    r[m[1]!.toLowerCase()] = m[3] ?? m[4] ?? m[5] ?? '';
  }
  return r;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'unknown';
}

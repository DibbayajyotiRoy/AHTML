/**
 * Extract entities from inline schema.org JSON-LD blocks.
 *
 * If a site already publishes JSON-LD (most e-commerce, news, recipes do),
 * we get a free Level-0 AHTML snapshot with zero developer work.
 */

import type { Entity, Product, Document } from '../types.js';
import type { Extraction } from './merge.js';

export function extractFromSchemaOrg(html: string): Extraction {
  const entities: Entity[] = [];
  const blocks = matchAll(html, /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const block of blocks) {
    try {
      const data = JSON.parse(block);
      visit(data, entities);
    } catch {
      // skip malformed blocks
    }
  }
  return { source: 'schema-org', entities, actions: [] };
}

function visit(node: unknown, out: Entity[]): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const n of node) visit(n, out);
    return;
  }
  const obj = node as Record<string, unknown>;
  const type = obj['@type'];

  if (type === 'Product' || type === 'IndividualProduct' || type === 'ProductModel') {
    const name = String(obj.name ?? '');
    const id = `product:${slug(name)}`;
    const p: Product = {
      id,
      type: 'product',
      name,
      ...(typeof obj.brand === 'object' && obj.brand && { brand: String((obj.brand as Record<string, unknown>).name ?? '') }),
      ...(typeof obj.description === 'string' && { description: obj.description }),
      ...(typeof obj.sku === 'string' && { sku: obj.sku }),
    };
    const offers = obj.offers as Record<string, unknown> | undefined;
    if (offers) {
      const offer = Array.isArray(offers) ? offers[0] : offers;
      if (offer) {
        if (offer.price !== undefined && offer.priceCurrency) {
          p.price = { amount: Number(offer.price), currency: String(offer.priceCurrency) };
        }
        const avail = String(offer.availability ?? '').toLowerCase();
        if (avail.includes('instock')) p.stock = { status: 'in_stock' };
        else if (avail.includes('outofstock')) p.stock = { status: 'out_of_stock' };
        else if (avail.includes('preorder')) p.stock = { status: 'preorder' };
      }
    }
    const rating = obj.aggregateRating as Record<string, unknown> | undefined;
    if (rating) {
      p.rating = {
        average: Number(rating.ratingValue ?? 0),
        count: Number(rating.reviewCount ?? rating.ratingCount ?? 0),
      };
    }
    out.push(p);
  } else if (type === 'Article' || type === 'BlogPosting' || type === 'NewsArticle') {
    const title = String(obj.headline ?? obj.name ?? '');
    const d: Document = {
      id: `document:${slug(title)}`,
      type: 'document',
      title,
      ...(typeof obj.datePublished === 'string' && { published_at: obj.datePublished }),
      ...(typeof obj.dateModified === 'string' && { modified_at: obj.dateModified }),
      ...(typeof obj.description === 'string' && { summary: obj.description }),
      ...(typeof obj.articleBody === 'string' && { content: obj.articleBody }),
      ...(typeof obj.inLanguage === 'string' && { language: obj.inLanguage }),
    };
    const author = obj.author;
    if (typeof author === 'object' && author) d.author = String((author as Record<string, unknown>).name ?? '');
    else if (typeof author === 'string') d.author = author;
    out.push(d);
  }

  // Recurse into nested arrays/objects so we catch deep entities
  for (const v of Object.values(obj)) visit(v, out);
}

function matchAll(s: string, re: RegExp): string[] {
  const r: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) r.push(m[1]!);
  return r;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'unknown';
}

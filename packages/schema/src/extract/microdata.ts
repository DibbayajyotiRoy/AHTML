/**
 * Extract entities from HTML Microdata (itemscope/itemprop attributes).
 * Covers schema.org types embedded as Microdata rather than JSON-LD.
 */
import type { Entity, Product, Document } from '../types.js';
import type { Extraction } from './merge.js';

export function extractFromMicrodata(html: string): Extraction {
  const entities: Entity[] = [];
  try {
    const items = findItemScopes(html);
    for (const item of items) {
      const entity = itemToEntity(item);
      if (entity) entities.push(entity);
    }
  } catch {
    // robust against malformed HTML — return whatever was collected
  }
  return { source: 'microdata', entities, actions: [] };
}

interface MicrodataItem {
  type: string;
  props: Map<string, string[]>;
  /** Raw HTML of the itemscope block, used for nested item extraction */
  raw: string;
}

/**
 * Find all top-level itemscope blocks with an itemtype.
 * Uses a simple depth-tracking approach to find the extent of each itemscope element.
 */
function findItemScopes(html: string): MicrodataItem[] {
  const items: MicrodataItem[] = [];
  // Match opening tags that have itemscope and itemtype
  const openRe = /<(\w+)\b([^>]*?\bitemscope\b[^>]*?\bitemtype\s*=\s*["']([^"']*)["'][^>]*|[^>]*?\bitemtype\s*=\s*["']([^"']*)["'][^>]*?\bitemscope\b[^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = openRe.exec(html)) !== null) {
    try {
      const tag = m[1]!;
      const itemtype = (m[3] ?? m[4] ?? '').trim();
      if (!itemtype) continue;

      const blockStart = m.index;
      const blockEnd = findClosingTag(html, tag, blockStart);
      const raw = html.slice(blockStart, blockEnd);

      const schemaType = itemtype.replace(/^https?:\/\/schema\.org\//, '');
      const props = extractProps(raw);
      items.push({ type: schemaType, props, raw });
    } catch {
      // skip malformed itemscope block
    }
  }
  return items;
}

/**
 * Find the position after the closing tag that matches the opening tag at `start`.
 * Returns html.length if the closing tag is not found (treat rest of doc as block).
 */
function findClosingTag(html: string, tag: string, start: number): number {
  const tagLower = tag.toLowerCase();
  // Void elements have no closing tag
  const voidElements = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  if (voidElements.has(tagLower)) return start + html.slice(start).search(/>/) + 1;

  let depth = 0;
  const re = new RegExp(`<(\/?)${tag}\\b[^>]*>`, 'gi');
  re.lastIndex = start;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[1]) {
      // closing tag
      depth--;
      if (depth === 0) return m.index + m[0].length;
    } else {
      // opening tag
      depth++;
    }
  }
  return html.length;
}

/**
 * Extract all itemprop values from within a microdata block.
 * Each itemprop may appear multiple times; values are accumulated as arrays.
 */
function extractProps(raw: string): Map<string, string[]> {
  const props = new Map<string, string[]>();

  // Match elements with itemprop attribute
  const re = /<(\w+)\b([^>]*?\bitemprop\s*=\s*["']([^"']*)["'][^>]*)>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const tag = m[1]!.toLowerCase();
    const attrStr = m[2]!;
    const propName = m[3]!.trim();
    const innerHtml = m[4]!;

    if (!propName) continue;

    // Determine value based on element type and attributes
    let value = '';
    if (tag === 'meta') {
      value = getAttrValue(attrStr, 'content') ?? '';
    } else if (tag === 'link') {
      value = getAttrValue(attrStr, 'href') ?? '';
    } else if (tag === 'img') {
      value = getAttrValue(attrStr, 'src') ?? getAttrValue(attrStr, 'alt') ?? '';
    } else if (tag === 'time') {
      value = getAttrValue(attrStr, 'datetime') ?? stripTags(innerHtml).trim();
    } else if (tag === 'a') {
      value = getAttrValue(attrStr, 'href') ?? stripTags(innerHtml).trim();
    } else {
      value = stripTags(innerHtml).trim();
    }

    if (value) {
      const existing = props.get(propName);
      if (existing) existing.push(value);
      else props.set(propName, [value]);
    }
  }

  // Also handle self-closing / void elements with itemprop (e.g. <meta itemprop="..." content="...">)
  const voidRe = /<(meta|link|img|input)\b([^>]*?\bitemprop\s*=\s*["']([^"']*)["'][^>]*)\/?\s*>/gi;
  while ((m = voidRe.exec(raw)) !== null) {
    const tag = m[1]!.toLowerCase();
    const attrStr = m[2]!;
    const propName = m[3]!.trim();
    if (!propName) continue;

    let value = '';
    if (tag === 'meta') value = getAttrValue(attrStr, 'content') ?? '';
    else if (tag === 'link') value = getAttrValue(attrStr, 'href') ?? '';
    else if (tag === 'img') value = getAttrValue(attrStr, 'src') ?? '';

    if (value) {
      const existing = props.get(propName);
      if (existing) {
        if (!existing.includes(value)) existing.push(value);
      } else {
        props.set(propName, [value]);
      }
    }
  }

  return props;
}

function getAttrValue(attrStr: string, attrName: string): string | undefined {
  const re = new RegExp(`\\b${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|(\\S+))`, 'i');
  const m = re.exec(attrStr);
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

function first(props: Map<string, string[]>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = props.get(k);
    if (v && v[0]) return v[0];
  }
  return undefined;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'unknown';
}

function itemToEntity(item: MicrodataItem): Entity | null {
  const { type, props } = item;

  if (type === 'Product') {
    const name = first(props, 'name') ?? '';
    const id = `product:${slug(name)}`;
    const p: Product = { id, type: 'product', name };

    const description = first(props, 'description');
    if (description) p.description = description;

    const brand = first(props, 'brand');
    if (brand) p.brand = brand;

    const sku = first(props, 'sku', 'gtin', 'gtin13', 'gtin8', 'mpn');
    if (sku) p.sku = sku;

    // Price from offers/priceSpecification
    const priceVal = first(props, 'price', 'lowPrice');
    const currencyVal = first(props, 'priceCurrency');
    if (priceVal) {
      const amount = parseFloat(priceVal.replace(/[^0-9.]/g, ''));
      if (!isNaN(amount)) {
        p.price = { amount, currency: currencyVal ?? 'USD' };
      }
    }

    // Availability
    const avail = (first(props, 'availability') ?? '').toLowerCase();
    if (avail.includes('instock')) p.stock = { status: 'in_stock' };
    else if (avail.includes('outofstock')) p.stock = { status: 'out_of_stock' };
    else if (avail.includes('preorder')) p.stock = { status: 'preorder' };
    else if (avail.includes('discontinued')) p.stock = { status: 'discontinued' };

    // Rating
    const ratingVal = first(props, 'ratingValue');
    const ratingCount = first(props, 'reviewCount', 'ratingCount');
    if (ratingVal) {
      p.rating = {
        average: parseFloat(ratingVal),
        count: ratingCount ? parseInt(ratingCount, 10) : 0,
      };
    }

    // Image
    const image = first(props, 'image');
    if (image) p.images = [{ url: image }];

    return p;
  }

  if (type === 'Article' || type === 'BlogPosting' || type === 'NewsArticle') {
    const title = first(props, 'headline', 'name') ?? '';
    const d: Document = {
      id: `document:${slug(title)}`,
      type: 'document',
      title: title || 'untitled',
    };

    const description = first(props, 'description', 'abstract');
    if (description) d.summary = description;

    const published = first(props, 'datePublished');
    if (published) d.published_at = published;

    const modified = first(props, 'dateModified');
    if (modified) d.modified_at = modified;

    const author = first(props, 'author');
    if (author) d.author = author;

    const lang = first(props, 'inLanguage');
    if (lang) d.language = lang;

    const body = first(props, 'articleBody');
    if (body) d.content = body;

    const url = first(props, 'url', 'mainEntityOfPage');
    if (url) d.canonical_url = url;

    return d;
  }

  return null;
}

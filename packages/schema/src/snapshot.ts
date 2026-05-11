/**
 * Snapshot builder DSL.
 *
 *   import { snapshot } from '@ahtml/schema';
 *
 *   const snap = snapshot(req.url, 'product_detail')
 *     .ttl(300)
 *     .policy({ agents_welcome: true, license: 'CC-BY-4.0' })
 *     .add({
 *       id: 'product:mbp-14-m3',
 *       type: 'product',
 *       name: 'MacBook Pro 14"',
 *       price: { amount: 1999, currency: 'USD' },
 *       stock: { status: 'in_stock', quantity: 42 },
 *     })
 *     .action({
 *       id: 'purchase',
 *       target: 'product:mbp-14-m3',
 *       auth: 'required',
 *       cost: { amount: 1999, currency: 'USD', category: 'purchase' },
 *       reversible: { reversible: true, window: 'P30D', policy: 'full_refund' },
 *       side_effects: ['charge_card', 'email_buyer', 'decrement_stock'],
 *       confirmation: 'required',
 *     })
 *     .build();
 */

import { AHTML_VERSION } from './types.js';
import type {
  Snapshot,
  PageType,
  Entity,
  Action,
  Policy,
  Provenance,
  Links,
  Meta,
  JsonSchema,
} from './types.js';

export class SnapshotBuilder {
  private snap: Snapshot;

  constructor(url: string, pageType: PageType) {
    this.snap = {
      ahtml: AHTML_VERSION,
      url,
      fetched_at: new Date().toISOString(),
      page_type: pageType,
      entities: [],
      actions: [],
    };
  }

  ttl(seconds: number): this {
    this.snap.ttl = seconds;
    return this;
  }

  etag(tag: string): this {
    this.snap.etag = tag;
    return this;
  }

  fetchedAt(iso: string): this {
    this.snap.fetched_at = iso;
    return this;
  }

  policy(p: Policy): this {
    this.snap.policy = p;
    return this;
  }

  provenance(p: Provenance): this {
    this.snap.provenance = p;
    return this;
  }

  add(...entities: Entity[]): this {
    this.snap.entities.push(...entities);
    return this;
  }

  action(...actions: Action[]): this {
    this.snap.actions.push(...actions);
    return this;
  }

  links(l: Links): this {
    this.snap.links = { ...this.snap.links, ...l };
    return this;
  }

  schema(name: string, def: JsonSchema): this {
    this.snap.schemas ??= {};
    this.snap.schemas[name] = def;
    return this;
  }

  meta(m: Meta): this {
    this.snap.meta = { ...this.snap.meta, ...m };
    return this;
  }

  build(): Snapshot {
    return structuredClone(this.snap);
  }
}

export function snapshot(url: string, pageType: PageType): SnapshotBuilder {
  return new SnapshotBuilder(url, pageType);
}

/**
 * Compute a stable, weak ETag from snapshot content.
 * Content-addressed: same entities + actions → same etag (regardless of fetched_at).
 */
export function computeEtag(s: Snapshot): string {
  const stable = {
    url: s.url,
    page_type: s.page_type,
    entities: s.entities,
    actions: s.actions,
    links: s.links,
    policy: s.policy,
  };
  return `W/"${djb2(JSON.stringify(stable))}"`;
}

function djb2(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

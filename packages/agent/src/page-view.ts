import type { Snapshot, Entity, Product, Document, Task, Profile, Action } from '@ahtmljs/schema';

export type ProvenanceSource = 'authoritative' | 'extracted';

export interface PageViewOptions {
  provenance?: ProvenanceSource;
}

/**
 * A typed view over an AHTML snapshot. Provides typed accessors that replace
 * the fetch→cheerio→readability→custom-parser pipeline.
 *
 *   const page = await client.fetchPage('https://shop.example.com/p/x');
 *   page.products   // Product[]
 *   page.documents  // Document[]
 *   page.actions    // Action[]
 *   page.provenance // 'authoritative' | 'extracted'
 */
export class PageView {
  readonly provenance: ProvenanceSource;

  constructor(
    readonly snapshot: Snapshot,
    opts: PageViewOptions = {},
  ) {
    this.provenance = opts.provenance ?? (snapshot.provenance?.source ?? 'authoritative');
  }

  get products(): Product[] {
    return this.snapshot.entities.filter((e): e is Product => e.type === 'product');
  }

  get documents(): Document[] {
    return this.snapshot.entities.filter((e): e is Document => e.type === 'document');
  }

  get tasks(): Task[] {
    return this.snapshot.entities.filter((e): e is Task => e.type === 'task');
  }

  get profiles(): Profile[] {
    return this.snapshot.entities.filter((e): e is Profile => e.type === 'profile');
  }

  get entities(): Entity[] {
    return this.snapshot.entities;
  }

  get actions(): Action[] {
    return this.snapshot.actions;
  }
}

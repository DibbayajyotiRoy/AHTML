import type { Entity, Action } from '../types.js';

export interface Extraction {
  source: 'data-attrs' | 'schema-org' | 'opengraph' | 'microdata' | 'route-metadata';
  page_type?: string;
  entities: Entity[];
  actions: Action[];
}

/**
 * Merge extractions in precedence order. Earlier entries override later ones
 * on conflict (so pass data-attrs FIRST, opengraph LAST).
 */
export function mergeExtractions(extractions: Extraction[]): Extraction {
  const merged: Extraction = { source: 'data-attrs', entities: [], actions: [] };
  const entityById = new Map<string, Entity>();
  const actionById = new Map<string, Action>();
  for (const ex of extractions) {
    if (!merged.page_type && ex.page_type) merged.page_type = ex.page_type;
    for (const e of ex.entities) {
      const prev = entityById.get(e.id);
      entityById.set(e.id, prev ? ({ ...e, ...prev } as Entity) : e);
    }
    for (const a of ex.actions) {
      const prev = actionById.get(a.id);
      actionById.set(a.id, prev ? ({ ...a, ...prev } as Action) : a);
    }
  }
  merged.entities = [...entityById.values()];
  merged.actions = [...actionById.values()];
  return merged;
}

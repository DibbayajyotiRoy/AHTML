/**
 * Snapshot diffing.
 *
 * Given two snapshots (old, new), produce a minimal DiffChange list so
 * agents can incrementally update their world model without re-fetching
 * the whole page.
 *
 * Diff strategy: structural, by entity/action id. We do NOT attempt deep
 * field-level patches inside an entity — we replace the whole entity if
 * any field changed. This trades patch size for diff cost, and the size
 * trade-off is fine because individual entities are already tiny.
 */

import type { Snapshot, SnapshotDiff, DiffChange, Entity, Action } from './types.js';
import { computeEtag } from './snapshot.js';

export function diff(prev: Snapshot, next: Snapshot): SnapshotDiff {
  const changes: DiffChange[] = [];

  const prevEntities = new Map<string, Entity>(prev.entities.map((e) => [e.id, e]));
  const nextEntities = new Map<string, Entity>(next.entities.map((e) => [e.id, e]));

  for (const [id, e] of nextEntities) {
    const old = prevEntities.get(id);
    if (!old) {
      changes.push({ op: 'add', entity: e });
    } else if (!sameJson(old, e)) {
      changes.push({ op: 'update', id, patch: e as unknown as Record<string, unknown> });
    }
  }
  for (const id of prevEntities.keys()) {
    if (!nextEntities.has(id)) {
      changes.push({ op: 'remove', id });
    }
  }

  const prevActions = new Map<string, Action>(prev.actions.map((a) => [a.id, a]));
  const nextActions = new Map<string, Action>(next.actions.map((a) => [a.id, a]));

  for (const [id, a] of nextActions) {
    const old = prevActions.get(id);
    if (!old) {
      changes.push({ op: 'add_action', action: a });
    } else if (!sameJson(old, a)) {
      changes.push({ op: 'remove_action', id });
      changes.push({ op: 'add_action', action: a });
    }
  }
  for (const id of prevActions.keys()) {
    if (!nextActions.has(id)) {
      changes.push({ op: 'remove_action', id });
    }
  }

  return {
    ahtml: '0.1',
    url: next.url,
    from_etag: prev.etag ?? computeEtag(prev),
    to_etag: next.etag ?? computeEtag(next),
    changes,
  };
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function applyDiff(prev: Snapshot, d: SnapshotDiff): Snapshot {
  const entities = new Map<string, Entity>(prev.entities.map((e) => [e.id, e]));
  const actions = new Map<string, Action>(prev.actions.map((a) => [a.id, a]));
  for (const c of d.changes) {
    switch (c.op) {
      case 'add': entities.set(c.entity.id, c.entity); break;
      case 'remove': entities.delete(c.id); break;
      case 'update': entities.set(c.id, c.patch as unknown as Entity); break;
      case 'add_action': actions.set(c.action.id, c.action); break;
      case 'remove_action': actions.delete(c.id); break;
    }
  }
  return {
    ...prev,
    fetched_at: new Date().toISOString(),
    etag: d.to_etag,
    entities: [...entities.values()],
    actions: [...actions.values()],
  };
}

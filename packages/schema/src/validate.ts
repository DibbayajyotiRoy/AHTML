/**
 * Zero-dependency structural validator for AHTML snapshots.
 *
 * Returns a list of human-readable issues. Empty array = valid.
 * For full JSON Schema validation, run schema.json through any standard
 * JSON Schema validator (ajv, etc.). This validator is intentionally lean
 * so the @ahtmljs/schema package has zero runtime dependencies.
 */

import type { Snapshot, Entity, Action } from './types.js';

export interface Issue {
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

const ENTITY_TYPES = new Set([
  'product',
  'document',
  'task',
  'profile',
  'dataset',
  'conversation',
]);

const PAGE_TYPES = new Set([
  'home',
  'product_detail',
  'product_list',
  'article',
  'document',
  'profile',
  'task_list',
  'task_detail',
  'dataset',
  'conversation',
  'checkout',
  'search_results',
  'category',
  'other',
]);

export function validate(snap: unknown): Issue[] {
  const issues: Issue[] = [];
  if (typeof snap !== 'object' || snap === null) {
    issues.push({ path: '', message: 'snapshot must be an object', severity: 'error' });
    return issues;
  }
  const s = snap as Snapshot;

  if (s.ahtml !== '0.1') {
    issues.push({
      path: 'ahtml',
      message: `unsupported version "${String(s.ahtml)}" (expected "0.1")`,
      severity: 'error',
    });
  }
  if (typeof s.url !== 'string' || !s.url) {
    issues.push({ path: 'url', message: 'url is required', severity: 'error' });
  }
  if (typeof s.fetched_at !== 'string' || !isIso8601(s.fetched_at)) {
    issues.push({
      path: 'fetched_at',
      message: 'fetched_at must be an ISO 8601 timestamp',
      severity: 'error',
    });
  }
  if (typeof s.page_type !== 'string' || !PAGE_TYPES.has(s.page_type)) {
    issues.push({
      path: 'page_type',
      message: `unknown page_type "${String(s.page_type)}"`,
      severity: 'error',
    });
  }
  if (!Array.isArray(s.entities)) {
    issues.push({ path: 'entities', message: 'entities must be an array', severity: 'error' });
  } else {
    const seen = new Set<string>();
    s.entities.forEach((e, i) => {
      const p = `entities[${i}]`;
      issues.push(...validateEntity(e, p));
      if (e?.id) {
        if (seen.has(e.id)) {
          issues.push({ path: p + '.id', message: `duplicate entity id "${e.id}"`, severity: 'error' });
        }
        seen.add(e.id);
      }
    });
  }
  if (!Array.isArray(s.actions)) {
    issues.push({ path: 'actions', message: 'actions must be an array', severity: 'error' });
  } else {
    const seen = new Set<string>();
    s.actions.forEach((a, i) => {
      const p = `actions[${i}]`;
      issues.push(...validateAction(a, p));
      if (a?.id) {
        if (seen.has(a.id)) {
          issues.push({ path: p + '.id', message: `duplicate action id "${a.id}"`, severity: 'error' });
        }
        seen.add(a.id);
      }
    });
  }
  if (s.ttl !== undefined && (typeof s.ttl !== 'number' || s.ttl < 0)) {
    issues.push({ path: 'ttl', message: 'ttl must be a non-negative number', severity: 'error' });
  }
  return issues;
}

export function validateEntity(e: Entity | unknown, path = ''): Issue[] {
  const issues: Issue[] = [];
  if (typeof e !== 'object' || e === null) {
    issues.push({ path, message: 'entity must be an object', severity: 'error' });
    return issues;
  }
  const ent = e as Entity;
  if (!ent.id || typeof ent.id !== 'string') {
    issues.push({ path: path + '.id', message: 'entity.id is required', severity: 'error' });
  } else if (!/^[a-z_]+:[A-Za-z0-9_\-.]+$/.test(ent.id)) {
    issues.push({
      path: path + '.id',
      message: `entity id "${ent.id}" should match "type:slug" (e.g. "product:mbp-14")`,
      severity: 'warning',
    });
  }
  if (!ent.type || !ENTITY_TYPES.has(ent.type)) {
    issues.push({
      path: path + '.type',
      message: `unknown entity type "${String(ent.type)}"`,
      severity: 'error',
    });
  } else if (ent.id && !ent.id.startsWith(ent.type + ':')) {
    issues.push({
      path: path + '.id',
      message: `id prefix should match type ("${ent.type}:..."), got "${ent.id}"`,
      severity: 'warning',
    });
  }

  if (ent.type === 'product') {
    if (!ent.name) {
      issues.push({ path: path + '.name', message: 'product.name is required', severity: 'error' });
    }
    if (ent.price) {
      if (typeof ent.price.amount !== 'number') {
        issues.push({ path: path + '.price.amount', message: 'price.amount must be a number', severity: 'error' });
      }
      if (typeof ent.price.currency !== 'string') {
        issues.push({ path: path + '.price.currency', message: 'price.currency must be a string (ISO 4217)', severity: 'error' });
      }
    }
  }
  return issues;
}

export function validateAction(a: Action | unknown, path = ''): Issue[] {
  const issues: Issue[] = [];
  if (typeof a !== 'object' || a === null) {
    issues.push({ path, message: 'action must be an object', severity: 'error' });
    return issues;
  }
  const act = a as Action;
  if (!act.id || typeof act.id !== 'string') {
    issues.push({ path: path + '.id', message: 'action.id is required', severity: 'error' });
  }
  if (act.cost && !['free', 'purchase', 'subscription', 'rate_limited', 'compute'].includes(act.cost.category)) {
    issues.push({
      path: path + '.cost.category',
      message: `unknown cost category "${act.cost.category}"`,
      severity: 'error',
    });
  }
  if (act.confirmation && !['none', 'recommended', 'required'].includes(act.confirmation)) {
    issues.push({
      path: path + '.confirmation',
      message: `confirmation must be none|recommended|required`,
      severity: 'error',
    });
  }
  return issues;
}

function isIso8601(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(s);
}

export function isValid(snap: unknown): snap is Snapshot {
  return validate(snap).every((i) => i.severity !== 'error');
}

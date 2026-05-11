/**
 * Canonical JSON serializer.
 *
 * Strict, deterministic, machine-canonical. This is the format that
 * `/.well-known/ahtml.json` and `/ahtml/[route].json` MUST return when
 * the client requests `Accept: application/ahtml+json`.
 *
 * Properties are emitted in a fixed order so two semantically identical
 * snapshots serialize to byte-identical JSON — important for ETag
 * stability and signing.
 */

import type { Snapshot } from './types.js';

const KEY_ORDER = [
  'ahtml',
  'url',
  'fetched_at',
  'ttl',
  'etag',
  'page_type',
  'policy',
  'provenance',
  'entities',
  'actions',
  'links',
  'schemas',
  'meta',
];

export function toJson(s: Snapshot, opts: { pretty?: boolean } = {}): string {
  const src = s as unknown as Record<string, unknown>;
  const ordered: Record<string, unknown> = {};
  for (const k of KEY_ORDER) {
    if (src[k] !== undefined) ordered[k] = src[k];
  }
  return opts.pretty ? JSON.stringify(ordered, null, 2) + '\n' : JSON.stringify(ordered);
}

export function fromJson(text: string): Snapshot {
  return JSON.parse(text) as Snapshot;
}

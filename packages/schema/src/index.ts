/**
 * @ahtmljs/schema — public API.
 */
export * from './types.js';
export { SnapshotBuilder, snapshot, computeEtag } from './snapshot.js';
export { validate, isValid, type Issue } from './validate.js';
export { toJson, fromJson } from './format-json.js';
export { toCompact, fromCompact } from './format-compact.js';
export { diff, applyDiff } from './diff.js';
export {
  lint,
  type LintWarning,
  type LintSeverity,
  type LintOptions,
} from './lint.js';

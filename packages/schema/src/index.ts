/**
 * @ahtmljs/schema — public API.
 */
export * from './types.js';
export { SnapshotBuilder, snapshot, computeEtag } from './snapshot.js';
export {
  validate,
  validateEntity,
  validateAction,
  validateStrict,
  isValid,
  type Issue,
} from './validate.js';
export { toJson, fromJson } from './format-json.js';
export { toCompact, fromCompact } from './format-compact.js';
export { diff, applyDiff, InvalidDiffError } from './diff.js';
export {
  lint,
  type LintWarning,
  type LintSeverity,
  type LintOptions,
} from './lint.js';
export {
  AHTMLError,
  DEFAULT_HINTS,
  makeError,
  type AHTMLErrorCode,
  type AHTMLErrorInit,
} from './errors.js';
export {
  toStream,
  toStreamResponse,
  parseStream,
  fromStream,
  STREAM_CONTENT_TYPE,
  type StreamRecord,
} from './stream.js';
export {
  chooseEncoding,
  compressStream,
  compressBuffer,
  type Encoding,
} from './compress.js';
export {
  InMemoryCacheStore,
  InMemoryKvStore,
  type KvStore,
  type CacheStore,
} from './kv.js';

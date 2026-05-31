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
export {
  signSnapshot,
  verifySnapshot,
  verifySnapshotStrict,
  type SignKey,
  type VerifyKey,
  type SignOptions,
  type VerifyResult,
} from './sign.js';

// v0.8.0 — framework-neutral emitters. Adapters (@ahtmljs/next, @ahtmljs/vite,
// future @ahtmljs/hono / sveltekit / astro) delegate to these so the wire
// formats are bit-identical across runtimes.
export {
  buildWellKnown,
  type WellKnownConfig,
  type WellKnownManifest,
  type WellKnownRouteInput,
} from './emit/well-known.js';
export {
  snapshotsToMcp,
  type McpManifest,
  type McpToolDefinition,
} from './emit/mcp.js';
export {
  snapshotsToOpenApi,
  type OpenApiOptions,
} from './emit/openapi.js';
export {
  buildLlmsTxt,
  type LlmsTxtConfig,
} from './emit/llms-txt.js';

// v0.8.0 — pure HTTP helpers used by every framework adapter.
export {
  chooseFormat,
  parseAcceptEntries,
} from './http/accept.js';
export {
  isNotModified,
  notModifiedResponse,
  weakEtagOf,
} from './http/conditional.js';

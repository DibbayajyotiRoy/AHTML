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
export { toMarkdown } from './format-markdown.js';
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
  signBytes,
  verifyBytes,
  type SignKey,
  type VerifyKey,
  type SignOptions,
  type VerifyResult,
} from './sign.js';

// v0.9.0 — did:web key resolution. Adopters can pass a DID string instead
// of pre-imported VerifyKey arrays; the helper handles fetch + import + verify.
export { resolveDidWeb, verifySnapshotWithDidWeb, didWebToUrl } from './did-web.js';

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
  type LegacyLlmsTxtConfig,
} from './emit/llms-txt.js';

// v0.9.5 — RSL 1.0 (rslstandard.org) emitter. Serve output at /rsl.txt.
export { toRsl, policyToRsl, type RslOptions } from './emit/rsl.js';

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

// v0.9.5 — HTTP Message Signatures (RFC 9421) for agent request authentication.
export {
  signHttpRequest,
  verifyHttpSignature,
  type AgentIdentity,
  type AgentVerifyResult,
  type RequestSignOptions,
  type VerifyOptions as HttpVerifyOptions,
} from './http/request-sign.js';

// v0.9.5 — x402 machine-micropayment protocol helpers.
export {
  buildX402Response,
  hasPaymentToken,
  extractPaymentToken,
  type X402PaymentDetails,
  type X402Options,
} from './http/payment.js';

// v0.9.5 — built-in policy presets for common agent access patterns.
export {
  POLICY_PRESETS,
  publicReadOnly,
  rateLimited,
  authRequired,
  paidAction,
  trainDeny,
  type PolicyPreset,
} from './policy-presets.js';

// v0.9.0 — optional OpenTelemetry tracing. `@opentelemetry/api` is a
// soft peer dep; these helpers no-op when it isn't installed.
export { trace, traceSync, addEvent, setStatus } from './otel.js';

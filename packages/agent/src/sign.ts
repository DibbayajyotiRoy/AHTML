/**
 * v0.8.0 — re-exports the schema's signature verifier under the agent
 * package so adopters get a stable, dependency-light import path:
 *
 *   import { verifySnapshot } from '@ahtmljs/agent/sign';
 *
 * The producer side (`signSnapshot`) lives only in `@ahtmljs/schema` —
 * agents typically don't need it, but it's available for symmetry.
 */

export {
  signSnapshot,
  verifySnapshot,
  verifySnapshotStrict,
  type SignKey,
  type VerifyKey,
  type SignOptions,
  type VerifyResult,
} from '@ahtmljs/schema';

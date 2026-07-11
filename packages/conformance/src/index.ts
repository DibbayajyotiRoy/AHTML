/**
 * @ahtmljs/conformance — public API.
 *
 * The language-agnostic AHTML conformance corpus (corpus/1.0/) and the
 * runner that certifies an implementation against it. See README.md for the
 * manifest contract and certification workflow.
 */
export {
  runConformance,
  signAttestation,
  type RunnerManifest,
  type FixtureResult,
  type Attestation,
} from './runner.js';
export { extractMusts, type MustEntry } from './extract-musts.js';

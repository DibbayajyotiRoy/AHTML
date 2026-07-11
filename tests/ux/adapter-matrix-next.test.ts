/**
 * TASKS.md T1.6 — Next.js through the shared adapter matrix. This is the
 * reference run: Astro (T1.7) and SvelteKit (T1.8) must pass identically.
 */
import { runAdapterMatrix } from './adapter-matrix.js';
import { makeNextAdapter } from '../conformance/harness.js';

runAdapterMatrix('next', () => makeNextAdapter());

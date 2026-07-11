/**
 * TASKS.md T1.8 — @ahtmljs/sveltekit through the shared adapter matrix. Same
 * flow, same fixtures, same assertions as Next: extract → validate → sign →
 * serve → agent-consume. Driven through the SvelteKit server hook
 * (`ahtmlHandle`) with a sentinel `resolve` so pass-through is observable.
 */
import { runAdapterMatrix } from './adapter-matrix.js';
import {
  SITE,
  POLICY,
  ROUTES,
  DEFAULT_TTL,
  makeFixture,
  type AdapterUnderTest,
  type ConformanceResponse,
} from '../conformance/harness.js';
import { ahtmlHandle, type AHTMLSvelteKitConfig } from '@ahtmljs/sveltekit';

const PASS_THROUGH = new Response('__resolve__', { status: 599 });

async function toConformanceResponse(res: Response): Promise<ConformanceResponse> {
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v;
  });
  const body = new Uint8Array(await res.arrayBuffer());
  return { status: res.status, headers, body, text: new TextDecoder().decode(body) };
}

function makeSvelteKitAdapter(): AdapterUnderTest {
  const fixture = makeFixture();
  const config: AHTMLSvelteKitConfig = {
    site: SITE,
    policy: POLICY,
    default_ttl: DEFAULT_TTL,
    routes: ROUTES,
    snapshotBuilder: (segments) => fixture.buildSnapshot(segments),
  };
  const handle = ahtmlHandle(config);
  return {
    name: 'sveltekit',
    unsupported: new Set(),
    async fetchish(path, init) {
      const url = new URL(path, SITE);
      const request = new Request(url.toString(), { headers: init?.headers });
      const res = await handle({ event: { request }, resolve: async () => PASS_THROUGH });
      return toConformanceResponse(res);
    },
  };
}

runAdapterMatrix('sveltekit', makeSvelteKitAdapter);

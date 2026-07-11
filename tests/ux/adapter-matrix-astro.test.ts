/**
 * TASKS.md T1.7 — @ahtmljs/astro through the shared adapter matrix. Same
 * flow, same fixtures, same assertions as Next (adapter-matrix-next.test.ts):
 * extract → validate → sign → serve → agent-consume.
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
import { handleAHTMLRequest, type AHTMLAstroConfig } from '@ahtmljs/astro';

async function toConformanceResponse(res: Response): Promise<ConformanceResponse> {
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v;
  });
  const body = new Uint8Array(await res.arrayBuffer());
  return { status: res.status, headers, body, text: new TextDecoder().decode(body) };
}

function makeAstroAdapter(): AdapterUnderTest {
  const fixture = makeFixture();
  const config: AHTMLAstroConfig = {
    site: SITE,
    policy: POLICY,
    default_ttl: DEFAULT_TTL,
    routes: ROUTES,
    snapshotBuilder: (segments) => fixture.buildSnapshot(segments),
  };
  return {
    name: 'astro',
    unsupported: new Set(),
    async fetchish(path, init) {
      const url = new URL(path, SITE);
      const req = new Request(url.toString(), { headers: init?.headers });
      const res = await handleAHTMLRequest(req, config);
      if (!res) return { status: 599, headers: {}, body: new Uint8Array(), text: '' };
      return toConformanceResponse(res);
    },
  };
}

runAdapterMatrix('astro', makeAstroAdapter);

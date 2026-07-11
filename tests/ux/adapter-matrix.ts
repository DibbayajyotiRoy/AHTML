/**
 * Shared adapter test matrix (TASKS.md T1.6, ROADMAP Feature 2).
 *
 * One flow, every adapter: extract → validate → sign → serve → agent-consume.
 * An adapter passes by standing up behind the conformance harness's
 * `AdapterUnderTest` interface (tests/conformance/harness.ts) and calling
 * `runAdapterMatrix` from a thin *.test.ts file. Astro and SvelteKit must
 * pass the SAME matrix Next does — that's the proof the plugin API and the
 * adapter surface are framework-neutral.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  snapshot,
  validate,
  fromJson,
  fromCompact,
  signSnapshot,
  verifySnapshot,
  type SignKey,
  type VerifyKey,
  type Snapshot,
} from '@ahtmljs/schema';
import { createExtractor, pageFromHtml } from '@ahtmljs/extract';
import type { AdapterUnderTest } from '../conformance/harness.js';
import { SITE, POLICY } from '../conformance/harness.js';

/** The same Shopify-style zero-config page tests/ux/zero-config-extract uses. */
export const MATRIX_FIXTURE_HTML = `<!DOCTYPE html>
<html>
<head>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org/",
    "@type": "Product",
    "name": "Reusable Water Bottle",
    "sku": "WB-750-STEEL",
    "brand": { "@type": "Brand", "name": "Hydro" },
    "offers": { "priceCurrency": "USD", "price": "29.95", "availability": "https://schema.org/InStock" }
  }
  </script>
</head>
<body><h1>Reusable Water Bottle</h1></body>
</html>`;

async function makeEs256(): Promise<{ sign: SignKey; verify: VerifyKey }> {
  const subtle =
    globalThis.crypto?.subtle ?? ((await import('node:crypto')).webcrypto.subtle as unknown as SubtleCrypto);
  const pair = (await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  return { sign: { alg: 'ES256', key: pair.privateKey }, verify: { alg: 'ES256', key: pair.publicKey } };
}

/**
 * Register the matrix for one adapter. `makeAdapter` runs lazily inside the
 * suite so a broken adapter fails its own tests, not module load.
 */
export function runAdapterMatrix(name: string, makeAdapter: () => AdapterUnderTest | Promise<AdapterUnderTest>): void {
  describe(`adapter matrix — ${name}`, () => {
    // -- extract → validate ------------------------------------------------
    let extracted: Snapshot;
    test('extract: universal extractor produces a validateStrict-clean snapshot', () => {
      const extraction = createExtractor().extract(
        pageFromHtml(`${SITE}/p/bottle`, MATRIX_FIXTURE_HTML),
      );
      assert.ok(extraction.entities.length >= 1, 'extraction found no entities');
      extracted = snapshot(`${SITE}/p/bottle`, 'product_detail')
        .fetchedAt('2026-01-01T00:00:00.000Z')
        .add(...extraction.entities)
        .build();
      const errors = validate(extracted).filter((i) => i.severity === 'error');
      assert.deepEqual(errors, [], `validation errors: ${JSON.stringify(errors)}`);
    });

    // -- sign ----------------------------------------------------------------
    test('sign: extracted snapshot signs and verifies (ES256 detached JWS)', async () => {
      const { sign, verify } = await makeEs256();
      const jws = await signSnapshot(extracted, sign);
      const result = await verifySnapshot(extracted, jws, { trustedKeys: [verify] });
      assert.equal(result.ok, true, `verify failed: ${JSON.stringify(result)}`);
    });

    // -- serve ----------------------------------------------------------------
    test('serve: snapshot route negotiates compact by default with ETag + Vary', async () => {
      const adapter = await makeAdapter();
      const res = await adapter.fetchish('/ahtml/p/demo');
      assert.equal(res.status, 200);
      assert.match(res.headers['content-type'] ?? '', /application\/ahtml\+text/);
      assert.ok(res.headers.etag, 'snapshot response must carry an ETag');
      assert.match(res.headers.vary ?? '', /accept/i);
      const snap = fromCompact(res.text);
      assert.equal(snap.page_type, 'product_detail');
    });

    test('serve: canonical JSON on Accept, 304 on If-None-Match', async () => {
      const adapter = await makeAdapter();
      const json = await adapter.fetchish('/ahtml/p/demo', {
        headers: { accept: 'application/ahtml+json' },
      });
      assert.equal(json.status, 200);
      assert.match(json.headers['content-type'] ?? '', /application\/ahtml\+json/);
      const snap = fromJson(json.text);
      assert.equal(snap.url, `${SITE}/p/demo`);

      const revalidated = await adapter.fetchish('/ahtml/p/demo', {
        headers: { accept: 'application/ahtml+json', 'if-none-match': json.headers.etag! },
      });
      assert.equal(revalidated.status, 304, 'unchanged snapshot must revalidate as 304');
    });

    test('serve: .well-known manifest and MCP emission are mounted', async () => {
      const adapter = await makeAdapter();
      const wellKnown = await adapter.fetchish('/.well-known/ahtml.json');
      assert.equal(wellKnown.status, 200);
      const manifest = JSON.parse(wellKnown.text);
      assert.equal(manifest.policy?.agents_welcome ?? manifest.agents_welcome, POLICY.agents_welcome);

      const mcp = await adapter.fetchish('/ahtml/mcp.json');
      assert.equal(mcp.status, 200);
      const mcpDoc = JSON.parse(mcp.text);
      assert.ok(
        Array.isArray(mcpDoc.tools ?? mcpDoc.resources),
        'MCP emission must expose tools or resources',
      );
    });

    // -- agent-consume ---------------------------------------------------------
    test('agent-consume: served snapshot round-trips and honors the action contract', async () => {
      const adapter = await makeAdapter();
      const res = await adapter.fetchish('/ahtml/p/demo', {
        headers: { accept: 'application/ahtml+json' },
      });
      const snap = fromJson(res.text);
      const purchase = snap.actions.find((a) => a.id === 'purchase');
      assert.ok(purchase, 'fixture purchase action must survive the wire');
      assert.equal(purchase!.confirmation, 'required');
      assert.equal(purchase!.cost?.amount, 1999);
      // Compact and JSON forms describe the same snapshot.
      const compact = await adapter.fetchish('/ahtml/p/demo');
      assert.deepEqual(fromCompact(compact.text).entities, snap.entities);
    });
  });
}

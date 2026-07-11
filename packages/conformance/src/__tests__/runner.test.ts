/**
 * TASKS.md T4.3/T4.4 — the corpus is runnable, and BOTH implementations pass
 * 100% through the same runner: the TS reference via impl-ts.manifest.json,
 * and ahtml-py via impl-py.manifest.json. Two independent implementations
 * passing the same corpus is what proves it language-agnostic.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';
import { runConformance, signAttestation } from '../runner.js';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const repoRoot = resolve(pkgDir, '..', '..');

function assertAllPass(results: Awaited<ReturnType<typeof runConformance>>): void {
  const failures = results.results.filter((r) => r.status === 'fail');
  assert.deepEqual(
    failures,
    [],
    `fixtures failed:\n${failures.map((f) => `  ${f.id}: ${f.detail}`).join('\n')}`,
  );
  assert.ok(results.summary.pass >= 14, `expected ≥14 passing fixtures, got ${results.summary.pass}`);
  assert.equal(results.summary.fail, 0);
}

describe('conformance runner (T4.3/T4.4)', () => {
  test('TS reference passes 100% via the runner', async () => {
    process.chdir(repoRoot); // manifest commands are repo-root-relative
    const attestation = await runConformance(join(pkgDir, 'impl-ts.manifest.json'));
    assertAllPass(attestation);
  });

  test('ahtml-py passes 100% via the SAME runner (second implementation)', async (t) => {
    try {
      execFileSync('python3', ['-c', 'import ahtml'], {
        env: { ...process.env, PYTHONPATH: join(repoRoot, 'python/src') },
      });
    } catch {
      t.skip('python3 + ahtml not importable in this environment');
      return;
    }
    process.chdir(repoRoot);
    process.env.PYTHONPATH = join(repoRoot, 'python/src');
    const attestation = await runConformance(join(pkgDir, 'impl-py.manifest.json'));
    assertAllPass(attestation);
  });

  test('attestations sign and verify (detached JWS, b64:false)', async () => {
    const fake = {
      corpus: '1.0',
      implementation: 'x',
      version: '0',
      ranAt: 'now',
      results: [],
      summary: { pass: 0, fail: 0, waived: 0, skipped: 0, total: 0 },
    };
    const { jws, publicJwk, attestation } = await signAttestation(fake);
    const [header, mid, sig] = jws.split('.');
    assert.equal(mid, '', 'detached JWS has an empty payload segment');
    const key = await webcrypto.subtle.importKey(
      'jwk',
      publicJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    const signingInput = new Uint8Array([
      ...new TextEncoder().encode(`${header}.`),
      ...new TextEncoder().encode(JSON.stringify(attestation)),
    ]);
    const ok = await webcrypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      Buffer.from(sig!, 'base64url'),
      signingInput,
    );
    assert.equal(ok, true);
  });

  test('corpus is complete on disk', () => {
    for (const p of [
      'corpus/1.0/manifest.json',
      'corpus/1.0/musts.json',
      'corpus/1.0/keys/test-signer.pub.jwk.json',
      'corpus/1.0/signature/signed.jws',
    ]) {
      assert.ok(existsSync(join(pkgDir, p)), `${p} missing`);
    }
  });
});

// Generates the cross-implementation signature vectors: sign the
// product_full fixture with the TS reference (@ahtmljs/schema signSnapshot,
// ES256), and emit the detached JWS + public JWK so the Python SDK proves it
// verifies what TypeScript signs (TASKS.md T2.4).
//
//   node python/tests/_gen_signed.mjs
//
// The keypair is generated fresh each run (JWS + JWK are written together,
// so the pair always matches). TEST KEY ONLY.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';
import { fromJson, signSnapshot } from '@ahtmljs/schema';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const subtle = webcrypto.subtle;

const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const snap = fromJson(readFileSync(join(dir, 'product_full.json'), 'utf8'));
const jws = await signSnapshot(snap, { alg: 'ES256', key: pair.privateKey });

const pubJwk = await subtle.exportKey('jwk', pair.publicKey);
writeFileSync(join(dir, 'product_full.jws'), jws);
writeFileSync(join(dir, 'signer.pub.jwk.json'), JSON.stringify({ ...pubJwk, alg: 'ES256' }, null, 2) + '\n');

// A second, WRONG key for the negative case.
const wrong = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const wrongJwk = await subtle.exportKey('jwk', wrong.publicKey);
writeFileSync(join(dir, 'wrong.pub.jwk.json'), JSON.stringify({ ...wrongJwk, alg: 'ES256' }, null, 2) + '\n');

console.log('wrote product_full.jws + signer.pub.jwk.json + wrong.pub.jwk.json');

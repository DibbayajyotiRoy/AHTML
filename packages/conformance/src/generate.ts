/**
 * Corpus generator (TASKS.md T4.1). Uses @ahtmljs/schema as the REFERENCE
 * implementation to emit corpus/1.0/ — the language-agnostic fixture set any
 * AHTML implementation certifies against.
 *
 * Determinism + append-only: every snapshot pins fetched_at; the signing key
 * is the checked-in test JWK (TEST KEY — never use outside this corpus).
 * ECDSA signatures are randomized per run, so ALL outputs are written only
 * when absent — regeneration never rewrites an existing fixture file. Bump
 * the corpus directory (2.0/) for a new spec version instead.
 *
 *   npx tsx packages/conformance/src/generate.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';
import {
  snapshot,
  toJson,
  fromCompact,
  toCompact,
  toMarkdown,
  computeEtag,
  diff,
  signSnapshot,
  type Snapshot,
} from '@ahtmljs/schema';

const CORPUS = join(dirname(fileURLToPath(import.meta.url)), '..', 'corpus', '1.0');
const AT = '2026-01-01T00:00:00.000Z';

function writeIfAbsent(rel: string, content: string): void {
  const p = join(CORPUS, rel);
  if (existsSync(p)) return; // append-only
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
}

/* ---------------------------------------------------------------------------
 * base snapshots
 * ------------------------------------------------------------------------- */

function productSnap(): Snapshot {
  return snapshot('https://corpus.example.com/p/widget', 'product_detail')
    .fetchedAt(AT)
    .ttl(300)
    .etag('W/"corpus-1"')
    .policy({ agents_welcome: true, license: 'MIT', rate_limit: '100/min' })
    .add({
      id: 'product:widget',
      type: 'product',
      name: 'Corpus Widget — “canonical” ünicode ✓',
      brand: 'Corpus',
      price: { amount: 19.99, currency: 'USD' },
      stock: { status: 'in_stock', quantity: 7 },
      rating: { average: 4.2, count: 37 },
    })
    .action({
      id: 'purchase',
      target: 'product:widget',
      category: 'transact',
      method: 'POST',
      execute_url: '/api/checkout',
      auth: 'required',
      cost: { amount: 19.99, currency: 'USD', category: 'purchase' },
      reversible: { reversible: true, window: 'P30D', policy: 'full_refund' },
      side_effects: ['charge_card'],
      confirmation: 'required',
    })
    .build();
}

function docSnap(): Snapshot {
  return snapshot('https://corpus.example.com/docs/guide', 'document')
    .fetchedAt(AT)
    .add({
      id: 'document:guide',
      type: 'document',
      title: 'Guide',
      summary: 'How to integrate.',
      word_count: 42,
      tags: ['guide'],
    })
    .build();
}

const emptySnap = () => snapshot('https://corpus.example.com/', 'home').fetchedAt(AT).build();

/* ---------------------------------------------------------------------------
 * fixture families
 * ------------------------------------------------------------------------- */

interface FixtureEntry {
  id: string;
  kind: string;
  files: Record<string, string>; // logical role -> relative path
  mustIds: string[];
}

const manifest: FixtureEntry[] = [];

async function main(): Promise<void> {
  const bases: Array<[string, Snapshot]> = [
    ['product', productSnap()],
    ['document', docSnap()],
    ['empty', emptySnap()],
  ];

  // roundtrip + etag + markdown — MUST-001/002/003 (canonical form) live here.
  for (const [name, snap] of bases) {
    const jsonBytes = toJson(snap);
    const compact = toCompact(snap);
    writeIfAbsent(`roundtrip/${name}.input.json`, jsonBytes);
    writeIfAbsent(`roundtrip/${name}.expect.json`, jsonBytes);
    writeIfAbsent(`roundtrip/${name}.expect.compact.txt`, compact);
    // The compact parser is its own "producer" (SPEC §1.1 rule 2), so its
    // canonical emission may order NESTED keys differently from the builder.
    // parse-compact certifies against this file, not expect.json.
    writeIfAbsent(`roundtrip/${name}.expect.fromcompact.json`, toJson(fromCompact(compact)));
    writeIfAbsent(`roundtrip/${name}.expect.etag.txt`, await computeEtag(snap));
    writeIfAbsent(`roundtrip/${name}.expect.md`, toMarkdown(snap));
    manifest.push({
      id: `roundtrip-${name}`,
      kind: 'roundtrip',
      files: {
        input: `roundtrip/${name}.input.json`,
        expectJson: `roundtrip/${name}.expect.json`,
        expectCompact: `roundtrip/${name}.expect.compact.txt`,
        expectFromCompact: `roundtrip/${name}.expect.fromcompact.json`,
        expectEtag: `roundtrip/${name}.expect.etag.txt`,
        expectMarkdown: `roundtrip/${name}.expect.md`,
      },
      mustIds: ['MUST-001', 'MUST-002', 'MUST-003'],
    });
  }

  // diff
  const before = productSnap();
  const after = snapshot('https://corpus.example.com/p/widget', 'product_detail')
    .fetchedAt(AT)
    .ttl(300)
    .etag('W/"corpus-2"')
    .policy({ agents_welcome: true, license: 'MIT', rate_limit: '100/min' })
    .add({
      id: 'product:widget',
      type: 'product',
      name: 'Corpus Widget — “canonical” ünicode ✓',
      brand: 'Corpus',
      price: { amount: 17.99, currency: 'USD' },
      stock: { status: 'low_stock', quantity: 2 },
      rating: { average: 4.2, count: 37 },
    })
    .build();
  writeIfAbsent('diff/price-change.from.json', toJson(before));
  writeIfAbsent('diff/price-change.to.json', toJson(after));
  writeIfAbsent('diff/price-change.expect.json', JSON.stringify(diff(before, after)));
  manifest.push({
    id: 'diff-price-change',
    kind: 'diff',
    files: {
      from: 'diff/price-change.from.json',
      to: 'diff/price-change.to.json',
      expect: 'diff/price-change.expect.json',
    },
    mustIds: [],
  });

  // validateStrict negatives
  const good = JSON.parse(toJson(productSnap()));
  const negatives: Array<[string, unknown]> = [
    ['missing-url', (() => { const s = structuredClone(good); delete s.url; return s; })()],
    ['bad-version', { ...structuredClone(good), ahtml: '9.9' }],
    ['bad-page-type', { ...structuredClone(good), page_type: 'landing_page' }],
    // NOTE: a malformed-but-present entity id is only a WARNING in the
    // reference validator; strict negatives must be ERRORS.
    ['missing-entity-id', (() => { const s = structuredClone(good); delete s.entities[0].id; return s; })()],
    ['duplicate-entity-id', (() => { const s = structuredClone(good); s.entities.push(structuredClone(s.entities[0])); return s; })()],
    ['bad-fetched-at', { ...structuredClone(good), fetched_at: 'yesterday' }],
    ['entities-not-array', { ...structuredClone(good), entities: {} }],
  ];
  for (const [name, bad] of negatives) {
    writeIfAbsent(`invalid/${name}.json`, JSON.stringify(bad));
    manifest.push({
      id: `invalid-${name}`,
      kind: 'validate-negative',
      files: { input: `invalid/${name}.json` },
      mustIds: ['MUST-002'],
    });
  }

  // signature vectors — checked-in TEST keypair; JWS written once (append-only).
  const subtle = webcrypto.subtle;
  let privJwk: JsonWebKey;
  let pubJwk: JsonWebKey;
  const privPath = join(CORPUS, 'keys/test-signer.priv.jwk.json');
  if (existsSync(privPath)) {
    privJwk = JSON.parse(readFileSync(privPath, 'utf8'));
    pubJwk = JSON.parse(readFileSync(join(CORPUS, 'keys/test-signer.pub.jwk.json'), 'utf8'));
  } else {
    const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    privJwk = await subtle.exportKey('jwk', pair.privateKey);
    pubJwk = { ...(await subtle.exportKey('jwk', pair.publicKey)), alg: 'ES256' };
    writeIfAbsent('keys/test-signer.priv.jwk.json', JSON.stringify(privJwk, null, 2) + '\n');
    writeIfAbsent('keys/test-signer.pub.jwk.json', JSON.stringify(pubJwk, null, 2) + '\n');
    writeIfAbsent(
      'keys/README.md',
      '# TEST KEYS ONLY\n\nGenerated for the conformance corpus. Never use outside it.\n',
    );
  }
  const wrongPath = join(CORPUS, 'keys/wrong.pub.jwk.json');
  if (!existsSync(wrongPath)) {
    const wrong = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    writeIfAbsent(
      'keys/wrong.pub.jwk.json',
      JSON.stringify({ ...(await subtle.exportKey('jwk', wrong.publicKey)), alg: 'ES256' }, null, 2) + '\n',
    );
  }

  const signKey = await subtle.importKey('jwk', privJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signed = productSnap();
  writeIfAbsent('signature/signed.json', toJson(signed));
  if (!existsSync(join(CORPUS, 'signature/signed.jws'))) {
    const jws = await signSnapshot(signed, { alg: 'ES256', key: signKey });
    writeIfAbsent('signature/signed.jws', jws);
  }
  const tampered = JSON.parse(toJson(signed));
  tampered.entities[0].price.amount = 0.01;
  writeIfAbsent('signature/tampered.json', JSON.stringify(tampered));
  writeIfAbsent('signature/malformed.jws.txt', 'not-a-jws\n');

  manifest.push(
    {
      id: 'sig-valid',
      kind: 'verify-positive',
      files: { snapshot: 'signature/signed.json', jws: 'signature/signed.jws', jwk: 'keys/test-signer.pub.jwk.json' },
      mustIds: ['MUST-003'],
    },
    {
      id: 'sig-tampered',
      kind: 'verify-negative',
      files: { snapshot: 'signature/tampered.json', jws: 'signature/signed.jws', jwk: 'keys/test-signer.pub.jwk.json' },
      mustIds: ['MUST-003'],
    },
    {
      id: 'sig-wrong-key',
      kind: 'verify-negative',
      files: { snapshot: 'signature/signed.json', jws: 'signature/signed.jws', jwk: 'keys/wrong.pub.jwk.json' },
      mustIds: ['MUST-003'],
    },
    {
      id: 'sig-malformed',
      kind: 'verify-negative',
      files: { snapshot: 'signature/signed.json', jws: 'signature/malformed.jws.txt', jwk: 'keys/test-signer.pub.jwk.json' },
      mustIds: ['MUST-003'],
    },
  );

  // content negotiation — declarative wire expectations (MUST-005 Vary: Accept).
  writeIfAbsent(
    'negotiation/expectations.json',
    JSON.stringify(
      {
        note: 'Wire-level expectations for servers. Declarative: runners with an HTTP surface assert them; library-only implementations record a documented waiver.',
        cases: [
          { accept: 'application/ahtml+text', contentType: 'application/ahtml+text' },
          { accept: 'application/ahtml+json', contentType: 'application/ahtml+json' },
          { accept: '*/*', contentType: 'application/ahtml+text' },
          { accept: 'application/json', contentType: 'application/ahtml+json' },
        ],
        requiredHeaders: { vary: 'Accept' },
      },
      null,
      2,
    ) + '\n',
  );
  manifest.push({
    id: 'negotiation-table',
    kind: 'negotiation',
    files: { expectations: 'negotiation/expectations.json' },
    mustIds: ['MUST-010'],
  });

  // Dry-run addendum fixtures (SPEC §4.7 / ADR-0003, MUST-005..009).
  // Each supplies the transport response inline so any implementation can
  // certify without HTTP: the shim injects `response` and asserts the
  // consumer accepts or refuses as `expect` demands.
  const dryRunAction = {
    id: 'subscribe',
    category: 'transact',
    method: 'POST',
    execute_url: 'https://corpus.example.com/api/subscribe',
    auth: 'none',
    cost: { amount: 144, currency: 'USD', category: 'subscription' },
    reversible: { reversible: false },
    side_effects: ['charge_card'],
    dry_run: { url: 'https://corpus.example.com/ahtml/actions/subscribe/dry-run' },
  };
  const dryRunSnap = {
    ahtml: '0.1',
    url: 'https://corpus.example.com/pricing',
    fetched_at: AT,
    ttl: 60,
    page_type: 'product_detail',
    policy: { agents_welcome: true },
    entities: [{ id: 'product:plan', type: 'product', name: 'Plan' }],
    actions: [dryRunAction],
  };
  const dryRunCases: Array<[string, object, string[]]> = [
    [
      'honest-rehearsal',
      {
        snapshot: dryRunSnap, action: 'subscribe', phase: 'dry_run',
        response: { simulated: true, would_charge: { amount: 144, currency: 'USD' }, reversal: { reversible: false } },
        expect: 'accept',
      },
      ['MUST-005', 'MUST-006'],
    ],
    [
      'spoof-dry-run',
      {
        snapshot: dryRunSnap, action: 'subscribe', phase: 'dry_run',
        response: { subscription_id: 'sub_REAL' },
        expect: 'refuse',
      },
      ['MUST-006', 'MUST-009'],
    ],
    [
      'spoof-execute',
      {
        snapshot: dryRunSnap, action: 'subscribe', phase: 'execute',
        response: { simulated: true, subscription_id: 'sub_fake' },
        expect: 'refuse',
      },
      ['MUST-007', 'MUST-008'],
    ],
  ];
  for (const [name, fixture, mustIds] of dryRunCases) {
    writeIfAbsent(`dryrun/${name}.json`, JSON.stringify(fixture, null, 2) + '\n');
    manifest.push({ id: `dryrun-${name}`, kind: 'dryrun-gate', files: { input: `dryrun/${name}.json` }, mustIds });
  }

  // MUST-004 (agents MUST NOT execute confirmation:required without consent)
  // is behavioral — covered by the action-safety suites in both
  // implementations; recorded as a mapped behavioral fixture.
  writeIfAbsent(
    'behavioral/confirmation-required.json',
    JSON.stringify(
      {
        note: 'Behavioral MUST: run the implementation-under-test action gate against this snapshot; executing "wire" without confirm MUST refuse.',
        snapshot: JSON.parse(toJson(productSnap())),
        action: 'purchase',
        expect: 'refuse-without-confirmation',
      },
      null,
      2,
    ) + '\n',
  );
  manifest.push({
    id: 'behavioral-confirmation',
    kind: 'action-gate',
    files: { input: 'behavioral/confirmation-required.json' },
    mustIds: ['MUST-004'],
  });

  // The manifest is DERIVED (an index of the fixtures), not fixture data —
  // it is always rewritten so newly appended fixtures register. Fixture
  // files themselves stay append-only via writeIfAbsent.
  mkdirSync(CORPUS, { recursive: true });
  writeFileSync(
    join(CORPUS, 'manifest.json'),
    JSON.stringify({ corpus: '1.0', spec: 'SPEC.md v0.1', fixtures: manifest }, null, 2) + '\n',
  );
  console.log(`corpus 1.0: ${manifest.length} fixtures (existing fixture files preserved)`);
}

main();

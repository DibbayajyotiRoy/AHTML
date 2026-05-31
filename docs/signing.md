# Signed snapshots

*v0.8.0+. Cryptographically verifiable AHTML snapshots — a publisher signs
the bytes, a downstream agent verifies them, and nothing in between can
forge or tamper undetected.*

## Why signed snapshots

AHTML positions itself as the **contract layer of the agent web**. A
snapshot is a publisher's promise about what a URL is and what its
entities mean. v0.8.0 makes that contract **verifiable**: the publisher
signs the snapshot with a key it controls, and any consumer — an agent
runtime, a RAG pipeline, an aggregator, a vector DB ingest worker — can
prove two facts before trusting a byte of it:

1. The bytes were produced by the legitimate publisher (origin
   authenticity).
2. The bytes have not been altered in transit, in cache, or replayed
   from an older response (integrity).

Without signatures, an attacker who controls a CDN edge, a corporate
proxy, or a poisoned downstream cache can rewrite prices, swap product
IDs, or substitute hostile entities, and the consumer has no way to
notice. Signatures close that gap with zero coordination overhead — the
publisher signs once per snapshot, the consumer verifies once per
fetch.

## The format

AHTML uses **detached JWS** as specified in
[RFC 7515 Section 7.2](https://datatracker.ietf.org/doc/html/rfc7515#section-7.2).
The payload is the canonical snapshot bytes; the JWS carries only the
protected header and the signature, separated by `..`:

```
eyJhbGciOiJFUzI1NiIsImtpZCI6InNob3AtMjAyNiJ9..MEUCIQDx...
```

Three carrier forms are supported:

| Form                                  | When to use                                     |
| ------------------------------------- | ----------------------------------------------- |
| `X-AHTML-Signature` response header   | Streaming, compact, or binary responses         |
| `provenance.signature` on the JSON    | When the snapshot is stored at rest             |
| Inline JWS in `/.well-known/ahtml.json` | Publisher's long-lived identity key            |

The header form is canonical for live HTTP traffic; the embedded form
is canonical for snapshots written to S3, a vector DB, or a static
build artifact.

## Supported algorithms

| `alg`   | Curve / size              | Default | Notes                       |
| ------- | ------------------------- | ------- | --------------------------- |
| `ES256` | NIST P-256 (ECDSA)        | yes     | Fast, ubiquitous, JWA core  |
| `EdDSA` | Ed25519                   |         | Smaller keys, constant-time |
| `RS256` | RSA-2048+ PKCS#1 v1.5     |         | For legacy PKI integration  |

`ES256` is the default because every Web Crypto runtime ships it,
verification is under 3 ms, and signatures are 64 bytes.

## Producing signatures (server side)

The publisher signs once per response. Keep the private key in your
secret manager and import it through Web Crypto — no Node-only APIs are
involved, so this works on Workers, Vercel Edge, Bun, Deno, and Node.

```ts
import { snapshot, signSnapshot, toJson } from '@ahtmljs/schema';
import { readFileSync } from 'node:fs';

const key = await crypto.subtle.importKey(
  'pkcs8',
  Buffer.from(readFileSync('./signing-key.pkcs8'), 'base64'),
  { name: 'ECDSA', namedCurve: 'P-256' },
  false,
  ['sign'],
);

const snap = snapshot('https://shop.com/p/123', 'product_detail').build();
const jws = await signSnapshot(snap, { kid: 'shop-2026', alg: 'ES256', key });

return new Response(toJson(snap), {
  headers: {
    'X-AHTML-Signature': jws,
    'content-type': 'application/ahtml+json',
  },
});
```

The `kid` header is mandatory. It lets the consumer pick the right
public key from a key set without trial-and-error verification, and it
gives you a stable handle for key rotation (publish `shop-2027`
alongside `shop-2026` for the overlap window, then retire the old kid).

## Verifying (client side)

The consumer verifies before any downstream use — before indexing into
a vector DB, before feeding the entities into an LLM context window,
before persisting to a cache.

```ts
import { verifySnapshot } from '@ahtmljs/agent/sign';

const publicKey = await crypto.subtle.importKey(
  'spki',
  publicKeyBytes,
  { name: 'ECDSA', namedCurve: 'P-256' },
  false,
  ['verify'],
);

const sig = res.headers.get('x-ahtml-signature');
const result = await verifySnapshot(snap, sig, {
  trustedKeys: [{ alg: 'ES256', kid: 'shop-2026', key: publicKey }],
});
if (!result.ok) throw new Error(`Signature invalid: ${result.reason}`);
console.log('Signed by', result.signer.kid);
```

`verifySnapshot` returns a discriminated union — `{ ok: true, signer }`
or `{ ok: false, reason }` — so the call site stays exhaustive. For
the common "throw and let the upstream handler decide" pattern, prefer
`verifySnapshotStrict`, which raises an `AHTMLError` with code
`SIGNATURE_INVALID` (see [docs/errors.md](./errors.md)).

## Key distribution options

How the consumer obtains the publisher's public key is left to the
deployment. Three patterns are supported out of the box:

- **did:web** — the publisher publishes a DID document at
  `https://shop.com/.well-known/did.json`. The site's TLS certificate
  becomes the root of trust; key rotation is a JSON edit. This is the
  recommended option for open consumers.
- **`.well-known/ahtml-keys.json`** — a publisher-controlled JWKS-like
  document listing every active `kid` and its public key. Suitable
  when you want signatures without DID tooling.
- **Out-of-band** — vector-DB operators and aggregators preregister
  the publishers they trust. The consumer ships with a static
  `trustedKeys` list. Highest assurance, lowest flexibility; use it
  for closed networks.

Whichever option you pick, the verification call signature is
identical — only how you populate `trustedKeys` changes.

## Threat model

Signed snapshots defend against:

- **Cache poisoning.** A poisoned shared cache cannot serve forged
  bytes; the signature will not validate.
- **MITM rewrite.** A network attacker who can rewrite the HTTP body
  cannot also rewrite a valid signature without the private key.
- **Replay of older content.** Combine signatures with the
  `provenance.fetchedAt` timestamp and a freshness window on the
  consumer; replays past the window fail.

Out of scope — signatures do **not** prevent:

- A publisher signing malicious-but-authentic content. The signature
  proves origin, not honesty. Downstream policy (allowlists,
  reputation, content scanners) is your tool here.
- A stolen-key attacker forging signatures until the key is revoked.
  Mitigations: rotate keys on a schedule, keep `kid` granular, and
  publish a revocation list at `.well-known/ahtml-keys.json` so
  consumers can drop a compromised kid.

In short: signatures are an integrity-and-origin primitive, not a
content-safety primitive.

## Error handling

`verifySnapshotStrict` throws `AHTMLError` with one of these codes:

| Code                  | Meaning                                          |
| --------------------- | ------------------------------------------------ |
| `SIGNATURE_MISSING`   | No signature on a snapshot the policy required   |
| `SIGNATURE_INVALID`   | Bytes do not match the signature                 |
| `SIGNATURE_UNTRUSTED` | Signature is well-formed but `kid` is unknown    |
| `SIGNATURE_EXPIRED`   | Signed timestamp is outside the freshness window |

The non-throwing `verifySnapshot` form returns the same reasons as the
`reason` field. Either way, the codes are stable across minor releases
and slot into the same `switch (err.code)` blocks documented in
[docs/errors.md](./errors.md).

## Performance

On the v0.8.0 benchmark suite (Node 20, M2, 100-entity snapshot,
~12 KB JSON):

| Operation              | p50    | p99    |
| ---------------------- | ------ | ------ |
| `signSnapshot` ES256   | 0.9 ms | 1.6 ms |
| `verifySnapshot` ES256 | 2.4 ms | 2.9 ms |
| `verifySnapshot` EdDSA | 1.1 ms | 1.4 ms |
| `verifySnapshot` RS256 | 4.8 ms | 6.2 ms |

The verifier is allocation-light and runs on the same Web Crypto path
as the rest of the edge core (see [docs/edge.md](./edge.md)) — no Node
built-ins, no WASM, no native bindings. ES256 verification at under
3 ms p99 means you can verify every snapshot in a streaming ingest
pipeline without budgeting extra CPU.

## Roadmap

v0.9.0 will add:

- Native **did:web** key resolution — pass `{ didWeb: 'shop.com' }`
  and the verifier fetches and caches the DID document for you.
- **Signature roundtrip in `@ahtmljs/cli doctor`** — `ahtml doctor
  --verify https://shop.com/p/123` reports the signing key, the
  algorithm, the trust chain, and any expired or rotated kids.

Until those land, the recipes above cover every production path.

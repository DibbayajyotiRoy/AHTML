# did:web key resolution

*v0.9.0+. Your domain is the key registry. Sign with a key you control,
publish the public half at `/.well-known/did.json`, and any consumer can
verify your snapshots without a single line of pre-shared configuration.*

## Why did:web

v0.8.0 shipped detached-JWS signatures on snapshots — see
[docs/signing.md](./signing.md) — but key distribution stayed
out-of-band. The publisher signed; the consumer somehow obtained a
public key; the two ends agreed by email or a static `trustedKeys`
array baked into the build. That works for closed networks. It does
not work for the open agent web, where a vector-DB ingest worker, a
search aggregator, or a third-party LLM tool has no prior relationship
with the publisher and still needs to verify every byte before
trusting it.

v0.9.0 closes that gap with **did:web**. The publisher publishes a
W3C-shaped DID document at a fixed URL on its own origin. The consumer
resolves the publisher's domain, fetches the document, and learns every
currently-valid public key in one round trip. The same TLS chain that
already authenticates `https://shop.com` now authenticates its keys.

## did:web in 60 seconds

[did:web](https://w3c-ccg.github.io/did-method-web/) is a W3C DID
method that uses HTTPS plus a well-known path as its resolver. The
mapping is:

| DID                       | Resolves to                                              |
| ------------------------- | -------------------------------------------------------- |
| `did:web:shop.com`        | `https://shop.com/.well-known/did.json`                  |
| `did:web:shop.com:agents` | `https://shop.com/agents/did.json`                       |
| `did:web:shop.com%3A8443` | `https://shop.com:8443/.well-known/did.json` (port form) |

The DID document is plain JSON with a stable shape: an `id` matching
the DID, and a `verificationMethod` array of public keys (typically
JWKs). No blockchain, no ledger, no registrar — the HTTPS chain to
your origin is the trust anchor.

## Producer setup

A publisher needs to do three things once, then nothing per request
beyond signing.

### 1. Generate an ES256 key pair

```ts
const { publicKey, privateKey } = await crypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' },
  true,
  ['sign', 'verify'],
);

const pubJwk  = await crypto.subtle.exportKey('jwk', publicKey);
const privJwk = await crypto.subtle.exportKey('jwk', privateKey);
```

Store `privJwk` in your secret manager — never serve it from the
origin. Keep `pubJwk` for step 2.

### 2. Publish the DID document

Serve the public JWK from `/.well-known/did.json` on your apex domain
(or a subdomain — whichever your `did:web:` identifier points at). The
envelope must follow the W3C shape:

```json
{
  "@context": ["https://www.w3.org/ns/did/v1"],
  "id": "did:web:shop.com",
  "verificationMethod": [
    {
      "id": "did:web:shop.com#shop-2026",
      "type": "JsonWebKey2020",
      "controller": "did:web:shop.com",
      "publicKeyJwk": {
        "kty": "EC",
        "crv": "P-256",
        "x": "f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU",
        "y": "x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0",
        "alg": "ES256",
        "kid": "shop-2026"
      }
    }
  ],
  "assertionMethod": ["did:web:shop.com#shop-2026"]
}
```

The `kid` inside `publicKeyJwk` must match the `kid` you set on the
JWS protected header at sign time.

### 3. Sign snapshots with the private key

Nothing changes from v0.8 — use `signSnapshot` exactly as in
[docs/signing.md](./signing.md):

```ts
import { signSnapshot, snapshot, toJson } from '@ahtmljs/schema';

const snap = snapshot('https://shop.com/p/mbp-14', 'product_detail').build();
const jws  = await signSnapshot(snap, { kid: 'shop-2026', alg: 'ES256', key: privateKey });

return new Response(toJson(snap), {
  headers: { 'X-AHTML-Signature': jws, 'content-type': 'application/ahtml+json' },
});
```

## Verifier setup

The consumer needs one import and one call.

```ts
import { verifySnapshotWithDidWeb } from '@ahtmljs/schema';

const result = await verifySnapshotWithDidWeb(snap, jws, 'did:web:shop.com');
if (!result.ok) throw new Error(`Signature invalid: ${result.reason}`);
console.log('Signed by', result.signer.kid);
```

`verifySnapshotWithDidWeb` resolves the DID, parses the document,
extracts every `verificationMethod` whose `publicKeyJwk` carries a
matching `kid`, and verifies the JWS against that set. The return
shape is the discriminated union from [docs/signing.md](./signing.md)
— `{ ok: true, signer }` or `{ ok: false, reason }`. No pre-import of
keys, no shipped key file, no static `trustedKeys` array.

## Sample did.json with rotation

A production DID document carries the current key and the next key
during the overlap window:

```json
{
  "@context": ["https://www.w3.org/ns/did/v1"],
  "id": "did:web:shop.com",
  "verificationMethod": [
    {
      "id": "did:web:shop.com#shop-2026",
      "type": "JsonWebKey2020",
      "controller": "did:web:shop.com",
      "publicKeyJwk": {
        "kty": "EC", "crv": "P-256", "alg": "ES256", "kid": "shop-2026",
        "x": "f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU",
        "y": "x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0"
      }
    },
    {
      "id": "did:web:shop.com#shop-2027",
      "type": "JsonWebKey2020",
      "controller": "did:web:shop.com",
      "publicKeyJwk": {
        "kty": "EC", "crv": "P-256", "alg": "ES256", "kid": "shop-2027",
        "x": "kgR_4kU3kBcQ-pV1zJxAa0w7sN3vC2qoR9c8m0LfFq4",
        "y": "WzPnB9pYy_xL8jH5XQ7N2RcVgF6oI3aT4eD0K1uHmYE"
      }
    }
  ],
  "assertionMethod": [
    "did:web:shop.com#shop-2026",
    "did:web:shop.com#shop-2027"
  ]
}
```

Both `kid`s verify until you remove the old one from the document.
That is the entire rotation protocol.

## Caching

`resolveDidWeb` caches resolved key sets for **5 minutes** in process
memory by default. That covers the typical agent workload (many
verifications per minute of the same publisher) without making the DID
fetch hot on every snapshot.

For multi-replica deployments, share the cache:

```ts
import { verifySnapshotWithDidWeb, type CacheStore, type VerifyKey } from '@ahtmljs/schema';

const cache: CacheStore<VerifyKey[]> = makeRedisStore(...);

const result = await verifySnapshotWithDidWeb(snap, jws, 'did:web:shop.com', {
  cache,
  ttlMs: 5 * 60_000,
});
```

`CacheStore<VerifyKey[]>` is the same pluggable interface used by the
edge cache layer — see [docs/edge.md](./edge.md). Any backend that can
get / set / delete by string key works: Redis, Cloudflare KV, Workers
Cache API, an in-process LRU.

## Threat model

did:web inherits its trust anchor from the publisher's HTTPS chain.

**In scope:**

- **Cache poisoning and MITM rewrite.** Same as v0.8 signed snapshots
  — the signature does not validate.
- **Key rotation.** Publish a new entry in `did.json` and start
  signing with the new `kid`. Old signatures (signed by the
  rotated-out key) keep verifying until you remove the old key from
  the document. Plan an overlap window at least one cache TTL wide
  (5 minutes default) so in-flight verifiers do not see a stale set
  miss a brand-new `kid`.
- **Key compromise.** Rotate to a fresh `kid` and remove the
  compromised key from `did.json`. Every consumer's next resolve
  (within the cache TTL, so worst-case 5 minutes) picks up the new
  set; further signatures from the compromised key fail with
  `SIGNATURE_UNTRUSTED`.

**Out of scope:**

- **A compromised TLS chain.** If an attacker can mint a valid
  certificate for `shop.com`, they can also serve a malicious
  `did.json`. did:web is exactly as strong as your HTTPS to the
  publisher's origin — no more. For higher assurance, pair did:web
  with Certificate Transparency monitoring and HSTS preload.
- **A publisher signing dishonest content.** The signature proves
  origin, not honesty — see the threat-model section of
  [docs/signing.md](./signing.md).

## Error handling

`verifySnapshotWithDidWeb` and the strict form
`verifySnapshotWithDidWebStrict` raise `AHTMLError` (the strict form)
or surface the same code as `reason` (the non-throwing form). Codes
specific to DID resolution:

| Code                  | Meaning                                                       |
| --------------------- | ------------------------------------------------------------- |
| `DID_RESOLVE_FAILED`  | The DID document could not be fetched (network, 4xx, 5xx)     |
| `DID_DOCUMENT_INVALID`| Fetched JSON did not match the W3C envelope                   |
| `SIGNATURE_UNTRUSTED` | JWS `kid` is not present in any `verificationMethod`          |
| `SIGNATURE_INVALID`   | Bytes do not match the signature (same as v0.8)               |

These slot into the same `switch (err.code)` blocks documented in
[docs/errors.md](./errors.md). Network failures during resolution are
flagged `retryable: true` and carry a `retryAfterMs` hint; document
shape failures are non-retryable.

## Roadmap

v1.x is expected to add:

- **did:key** — a self-certifying offline DID method. The DID *is* the
  public key, base58-encoded. No HTTPS fetch needed, no rotation, no
  cache. Suitable for ephemeral signers and air-gapped verifiers.
- **did:ion** — a Sidetree-anchored DID method backed by Bitcoin. Much
  longer rotation lifetimes, censorship resistance, and a public audit
  log of every key event. Suitable for high-assurance publishers
  where a TLS cert is too short-lived a trust anchor.

Both will land behind the same `verifySnapshotWith…` family of
functions, so adopters can swap resolution backends without touching
call sites.

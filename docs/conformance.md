# Certifying an AHTML implementation

`@ahtmljs/conformance` ships the language-agnostic corpus
(`corpus/1.0/`) plus a runner that certifies any implementation — Go, Rust,
PHP, anything that can read files and print bytes — against every RFC-2119
MUST in [SPEC.md](../SPEC.md).

## 1. Write a shim

Expose your implementation over the command contract (full details in the
`runner.ts` docblock; exit codes: `0` ok/verified/refused, `3`
invalid/not-verified):

| op | stdin/argv | stdout |
|---|---|---|
| `canonical-json` | snapshot JSON path | canonical JSON bytes |
| `to-compact` | snapshot JSON path | compact text |
| `parse-compact` | compact path | canonical JSON bytes |
| `etag` | snapshot JSON path | ETag string |
| `diff` | two snapshot paths | `SnapshotDiff` JSON |
| `validate` | snapshot path | exit 0 valid / 3 invalid |
| `verify` | snapshot, JWS, JWK paths | exit 0 verified / 3 rejected |
| `action-gate` | behavioral fixture path | exit 0 refused / 3 executed |

stdout is compared byte-for-byte (one trailing newline forgiven). Canonical
means canonical.

## 2. Write a runner manifest

```json
{
  "implementation": "ahtml-go",
  "version": "0.1.0",
  "commands": {
    "canonical-json": "go run ./shim canonical-json {input}",
    "verify": "go run ./shim verify {snapshot} {jws} {jwk}"
  },
  "waivers": {
    "negotiation-table": "library-only — no HTTP surface"
  }
}
```

Waivers are legitimate but LOUD: they travel inside the attestation.

## 3. Run and publish

```bash
npx @ahtmljs/cli conformance my-impl.manifest.json > attestation.json
```

The output is a signed result attestation (detached JWS over the canonical
attestation JSON). Exit code 0 = zero failures. Publish the attestation with
your release and open a PR adding your implementation to the
"Certified implementations" table in the AHTML README.

## Reference runs

Both first-party implementations certify through the same runner in CI
(`packages/conformance/src/__tests__/runner.test.ts`):

- `@ahtmljs` (TypeScript reference) — `impl-ts.manifest.json`
- `ahtml-py` — `impl-py.manifest.json`

Two independent implementations passing the same corpus is the proof the
corpus is language-agnostic, not a TypeScript test suite in disguise.

## Versioning

The corpus is append-only per spec version. A certified-1.0 implementation
may pin `corpus/1.0/` forever; spec 0.2 gets `corpus/2.0/`. The MUST →
fixture traceability table lives in the corpus README and is CI-enforced.

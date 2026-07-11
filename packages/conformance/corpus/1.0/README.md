# AHTML Conformance Corpus 1.0

Language-agnostic fixtures for certifying AHTML implementations against SPEC.md v0.1 (incl. the §4.7 dry-run addendum). Versioned and append-only: certified-1.0 implementations may pin this directory forever; new spec versions get a new directory.

Run via the manifest contract in packages/conformance/src/runner.ts (`ahtml conformance <manifest>`).

## RFC-2119 MUST traceability

| MUST | Section | Requirement | Fixture(s) |
|---|---|---|---|
| MUST-001 | §1.1 Canonical JSON serialization | that ETags and detached-JWS signatures are computed over. Producers MUST emit it… | roundtrip-product, roundtrip-document, roundtrip-empty |
| MUST-002 | §1.1 Canonical JSON serialization | Top-level keys not in this list MUST NOT be emitted. 2. **Nested objects preserv… | roundtrip-product, roundtrip-document, roundtrip-empty, invalid-missing-url, invalid-bad-version, invalid-bad-page-type, invalid-missing-entity-id, invalid-duplicate-entity-id, invalid-bad-fetched-at, invalid-entities-not-array |
| MUST-003 | §1.1 Canonical JSON serialization | equality below the top level MUST construct nested objects in the field order gi… | roundtrip-product, roundtrip-document, roundtrip-empty, sig-valid, sig-tampered, sig-wrong-key, sig-malformed |
| MUST-004 | §4.6 Confirmation | Agents MUST NOT execute an action with `"confirmation": "required"` without expl… | behavioral-confirmation |
| MUST-005 | §4.7 Dry-run | - The dry-run endpoint MUST NOT mutate state, charge any payment rail, or emit a… | dryrun-honest-rehearsal |
| MUST-006 | §4.7 Dry-run | - Its response MUST carry `"simulated": true` at the top level, and SHOULD itemi… | dryrun-honest-rehearsal, dryrun-spoof-dry-run |
| MUST-007 | §4.7 Dry-run | - A real execution response MUST NOT carry `"simulated": true`.… | dryrun-spoof-execute |
| MUST-008 | §4.7 Dry-run | - Consumers MUST reject an execute-path response that claims `"simulated": true`… | dryrun-spoof-execute |
| MUST-009 | §4.7 Dry-run | `"simulated": true` (a real result masquerading as a rehearsal), and MUST reject… | dryrun-spoof-dry-run |
| MUST-010 | §11. Content negotiation | Implementations MUST set `Vary: Accept`.… | negotiation-table |

Behavioral MUSTs certify through the `action-gate`/`dryrun-gate` fixture kinds: the runner drives the implementation-under-test's consumer gate against canned responses and expects accept/refuse per fixture. Wire-level MUSTs (Vary: Accept) are declarative; library-only implementations record an explicit waiver, which the attestation carries visibly.

CI enforcement: tests/conformance/traceability.test.ts fails when SPEC.md gains an unmapped MUST.

## TEST KEYS

keys/ contains TEST-ONLY signing material for the signature vectors. Never reuse it.

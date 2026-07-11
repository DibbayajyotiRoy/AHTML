# ADR-0001: Ship a Python SDK as Consumer-Only

## Status

Proposed

## Context

The primary blocker to agent-side adoption is that agent authors are
majority-Python (LangChain, LlamaIndex, CrewAI) while AHTML is
TypeScript-only. A second language implementation raises the question of
scope: full parity (builder, emitters, adapters) or consumer surface only
(fetch, parse, verify, run_action)?

## Decision Drivers

- Agent authors (consumers) are Python-heavy; publishers (producers) are
  JS-framework-bound (Next, Vite, Hono, Astro, SvelteKit).
- Every duplicated surface doubles the conformance and maintenance burden
  against a frozen 1.0 API.
- The shared conformance corpus (ADR pending, Feature 5) needs a second
  independent implementation to prove language-agnosticism — consumer-side
  round-trip and verification fixtures suffice for that.

## Considered Options

1. **Consumer-only `ahtml` on PyPI** — fetch, `from_json`/`from_compact`,
   ETag caching, JWS + did:web verification, `run_action` safety gate,
   LangChain integration.
   - Pros: targets the actual audience; small frozen surface; conformance
     provable via serializer round-trips and signature vectors.
   - Cons: Django/FastAPI publishers still can't produce snapshots natively.
2. **Full-parity port** — builder, validators, emitters, signing.
   - Pros: complete story in one release.
   - Cons: doubles maintenance of a frozen API; emitters (MCP/OpenAPI/
     well-known) drift risk; producer demand in Python is unproven.
3. **No Python; document Node subprocess/CLI usage.**
   - Pros: zero new surface.
   - Cons: does not remove the adoption blocker; unacceptable DX for the
     stated target audience.

## Decision

Option 1: publish `ahtml` on PyPI as a consumer-only SDK. Revisit producer
support in a separate ADR if concrete Django/FastAPI demand appears.

## Consequences

**Positive:** Python agents become first-class consumers; second
implementation validates the conformance corpus; small surface to keep in
lockstep with the frozen spec.

**Negative:** Python publishers remain unserved; team takes on a second
toolchain (PyPI trusted publishing, 3.10–3.13 matrix).

**Risks:** Serializer drift between TS and Python — mitigated by both
running the same versioned conformance corpus in CI.

## Related Decisions

- Conformance corpus extraction (ROADMAP.md Feature 5)
- ADR-0003 (dryRun) — Python client must ship dryRun support in the same
  release as the TS client.

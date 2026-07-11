# ADR-0003: Add Action Dry-Run to the Spec as an Additive Capability

## Status

Accepted (2026-07-11) — spec addendum SPEC.md §4.7; conformance fixtures dryrun-*; TS + Python clients shipped in lockstep per the gating conditions.

## Context

Action definitions declare cost, reversibility, side-effects, and
confirmation, but agents cannot rehearse a transaction before committing
real money through x402. The trust gap before autonomous transactions is
"show me exactly what would happen, without it happening." SPEC.md v0.1 is
normative and the 1.0 API is frozen, so any change must be additive and
ignorable by 1.0 consumers.

## Decision Drivers

- Transactional trust is the moat: no competing format (markdown, llms.txt,
  raw HTML) can express a signed, simulated transaction.
- 1.0.0 consumers must keep working unchanged against upgraded producers.
- Simulated and real responses must be cryptographically distinguishable —
  a spoofed "simulation" that actually charges, or a real result passed
  off as a rehearsal, is a security failure.

## Considered Options

1. **Additive `dryRun` capability on action definitions** — producer
   exposes a simulate handler returning predicted result + itemized cost +
   reversal path with `simulated: true`; responses signed like real ones;
   clients gain `runAction(..., { dryRun: true })` and a `requiresDryRun`
   policy knob in `POLICY_PRESETS`.
   - Pros: additive (unknown fields already ignored per spec); reuses the
     existing signing pipeline; policy-gated on the consumer side.
   - Cons: producers must implement honest simulations; prediction
     accuracy is unverifiable by the protocol.
2. **Client-side simulation** (agent infers outcome from the action
   contract, no producer involvement).
   - Pros: zero producer work.
   - Cons: predictions are guesses; nothing signed; no cost itemization —
     does not close the trust gap.
3. **Separate sandbox environments** (staging endpoints per site).
   - Pros: full-fidelity rehearsal.
   - Cons: heavyweight per-publisher ops burden; discovery/auth story
     unclear; adoption would round to zero.

## Decision

Option 1, gated on: (a) an RFC comment period before the spec addendum
merges, (b) conformance fixtures (positive, negative, and
simulated/real-flag-mismatch cases) landing in the same release, (c) TS and
Python clients shipping support simultaneously.

## Consequences

**Positive:** Agents can rehearse priced/irreversible actions; strict
policy preset can require a dry-run before committing; deepens the
transactional moat.

**Negative:** Spec grows; producers implementing dishonest or stale
simulations can mislead agents (protocol cannot verify prediction
accuracy — only that simulations don't mutate or charge).

**Risks:** Simulated/real confusion — mitigated by the signed
`simulated: true` flag and client-side mismatch refusal, both covered by
conformance fixtures.

## Related Decisions

- ADR-0001 (Python client ships dryRun in lockstep)
- ROADMAP.md Features 5 and 7.

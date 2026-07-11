# Architecture Decision Records

ADRs for significant technical decisions in AHTML. See ROADMAP.md for the
plan these decisions support.

## Index

| ADR | Title | Status | Date |
| --- | --- | --- | --- |
| [0001](0001-python-sdk-consumer-only.md) | Ship a Python SDK as Consumer-Only | Proposed | 2026-07-10 |
| [0002](0002-extractor-plugin-api.md) | Extract a Framework-Neutral Plugin API | Proposed | 2026-07-10 |
| [0003](0003-dryrun-spec-addendum.md) | Add Action Dry-Run as an Additive Spec Capability | Proposed | 2026-07-10 |

## Process

1. Copy an existing ADR as a template; number sequentially.
2. Status flow: Proposed → Accepted / Rejected; Accepted → Deprecated /
   Superseded (write a new ADR to supersede, never edit an accepted one).
3. Spec-affecting ADRs (anything touching SPEC.md) additionally require an
   RFC comment period before acceptance — the 1.0 API is frozen and only
   additive changes are eligible.
4. Update this index in the same PR.

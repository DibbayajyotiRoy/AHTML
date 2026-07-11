# ADR-0002: Extract a Framework-Neutral Plugin API from the Next Extractors

## Status

Proposed

## Context

Extractors live inside `@ahtmljs/next`; each framework adapter is
hand-written and re-plumbs the same pipeline (the Vite adapter carried
duplicated emitter copies until 0.9). Community members cannot add
frameworks (Astro, SvelteKit) or domain extractors (schema.org recipes,
job postings) without forking an adapter. Adapter coverage growth is
bounded by maintainer time.

## Decision Drivers

- Site-side adoption scales with framework coverage; maintainers cannot
  hand-write every adapter.
- 1.0 API freeze: existing `@ahtmljs/next` public surface must not break.
- The 0.9 audit lesson: shared code must live in one package, or copies
  drift (Vite emitter duplication).

## Considered Options

1. **New `@ahtmljs/extract` package with a plugin contract**
   (`definePlugin({ match, extract, priority })` over a framework-neutral
   page model); Next/Vite/Hono adapters migrate internally; Astro and
   SvelteKit adapters built on it as proof.
   - Pros: hexagonal shape — extraction core with framework adapters as
     ports; community extensibility; one pipeline to test.
   - Cons: designing a page model neutral enough for SSR and static
     contexts is the hard part; wrong abstraction is costly post-freeze.
2. **Keep extractors in `@ahtmljs/next`, add adapters by copy.**
   - Pros: no new abstraction risk.
   - Cons: repeats the exact drift failure 0.9 already paid for.
3. **Config-only extensibility (declarative selector maps, no code plugins).**
   - Pros: safer surface.
   - Cons: insufficient for real extractors (the universal extractor
     already needs imperative logic); would coexist awkwardly with code.

## Decision

Option 1. Ship `@ahtmljs/extract`; keep the plugin contract minimal and
mark it `@experimental` for one minor release before freezing, so the page
model can be corrected from Astro/SvelteKit implementation feedback.

## Consequences

**Positive:** Astro/SvelteKit land as ~300-LOC adapters (CI-budgeted);
third parties can ship domain plugins; `ahtml init` (Feature 3) gets one
extraction entry point.

**Negative:** New public contract to support; migration work inside three
existing adapters.

**Risks:** Page-model abstraction leaks framework specifics — mitigated by
building two new adapters against it before freezing the contract.

## Related Decisions

- ROADMAP.md Features 2 and 3.

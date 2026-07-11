# AHTML — Post-1.0 Roadmap: the 10x plan

*Drafted: 2026-07-10 · Author: roadmap review session*
*Inputs: full codebase review at 1.0.0, PLAN-NEXT-6.md retrospective,
benchmark-results-llm.md, WHY-AHTML.md, gaps audit*

## Where we are

1.0.0 is tagged: API frozen, normative SPEC.md, seven packages published with
npm provenance, 6/6 live proofs (MCP, JWS, x402, RFC 9421, RSL, markdown
negotiation), and a public multi-model benchmark showing 5.6× token savings
and 91%→100% extraction accuracy.

**What 1.0 is:** a complete, correct *protocol and toolkit*.
**What 1.0 is not:** an *ecosystem*. One producer-side language (TypeScript),
one consumer client, hand-written adapters, no registry of AHTML sites, no
way for a non-JS team to adopt, and no feedback loop telling publishers that
agents are actually consuming their snapshots.

The 10x multiplier is not more protocol features. It is **closing the loop
between publishers and agents** so that each new adopter makes AHTML more
valuable for everyone else. The 0.9.x lesson still applies: ship the things
that create users before the things that create leverage.

## The value equation

AHTML's value = (sites publishing snapshots) × (agents consuming them).
Today both factors are ~1. Each roadmap theme attacks one factor:

| # | Theme | Grows | Series |
|---|-------|-------|--------|
| 1 | Python consumer SDK (`ahtml-py`) | agents | 1.1 |
| 2 | Universal extractor plugin API + Astro/SvelteKit adapters | sites | 1.1 |
| 3 | `ahtml init` scaffolding + hosted score badge | sites | 1.2 |
| 4 | Agent-traffic analytics (`@ahtmljs/insights`) | sites (retention) | 1.2 |
| 5 | Conformance certification for third-party implementations | both (protocol) | 1.3 |
| 6 | AHTML Index — public registry + crawler | agents ↔ sites (network effect) | 1.3 |
| 7 | Action sandbox / dry-run for priced actions | agents (trust) | 1.4 |

Everything below is additive — 1.0 API stays frozen; new capability lands in
new packages or new optional exports.

---

## 1.1 — Reach the other half of the agent world

### Feature 1: `ahtml-py` — Python consumer SDK

**Problem.** The stated audience — agent authors — is majority-Python
(LangChain, LlamaIndex, CrewAI, OpenAI/Anthropic SDK users). Today they
cannot consume AHTML at all without shelling out to Node. This is the single
largest adoption blocker.

**Scope.** PyPI package `ahtml` mirroring `@ahtmljs/agent`'s consumer
surface: fetch with Accept negotiation, `fromJson`/`fromCompact` parsing,
ETag/TTL-aware caching, JWS + did:web verification, `run_action` with the
same `ActionRefused` safety gate, token counting, and a LangChain
`Document`/tool integration. **Consumer-only** — no builder/emitter in v1
(producers are JS-framework-bound; consumers are not).

**Acceptance criteria**
- [ ] `pip install ahtml` works on Python ≥3.10; zero required deps beyond
      `httpx` and `cryptography` (tokenizers/LangChain extras optional).
- [ ] Passes the full shared conformance suite (see Feature 5) via a
      language-agnostic fixture runner: round-trips every fixture in
      `tests/conformance` byte-identically for JSON and losslessly for compact.
- [ ] Verifies the live signed snapshot on the landing site (same fixture the
      TS `verifySnapshot` test uses) including did:web resolution.
- [ ] `run_action` refuses the same unsafe-action fixtures as
      `tests/ux/agent-refuses-unsafe` — port that test 1:1.
- [ ] `AHTMLClient` equivalent honors ETag: second fetch of an unchanged
      snapshot issues a conditional request and returns the cached parse.
- [ ] README quickstart: a LangChain agent answers a price question from the
      landing page in <15 lines of Python.
- [ ] CI publishes to PyPI with trusted publishing (OIDC), matrix-tested on
      3.10–3.13.

### Feature 2: Extractor plugin API + Astro & SvelteKit adapters

**Problem.** Every framework adapter is hand-written; extractors live inside
`@ahtmljs/next`. Community can't add frameworks or domain-specific
extractors, so coverage growth is bounded by maintainer time.

**Scope.** New package `@ahtmljs/extract` that lifts the extractor pipeline
out of `next/extractors` behind a stable plugin interface
(`definePlugin({ match, extract, priority })` operating on a framework-neutral
page model), plus `@ahtmljs/astro` and `@ahtmljs/sveltekit` adapters built
*on* that API as proof it is sufficient. Existing Next/Vite/Hono adapters
migrate internally with zero public API change.

**Acceptance criteria**
- [ ] `@ahtmljs/next` re-exports its extractors from `@ahtmljs/extract` with
      no breaking change (existing adapter test suites pass unmodified).
- [ ] A third-party plugin can be written in <100 LOC without importing from
      any adapter package — demonstrated by a `recipe-schema.org` example
      plugin in `examples/`.
- [ ] Astro and SvelteKit adapters each ship `.well-known` emission, snapshot
      route, MCP emission, and pass the shared adapter test matrix
      (extract → validate → sign → serve → agent-consume, the same flow
      `tests/ux/zero-config-extract` covers for Next).
- [ ] Each new adapter stays under a CI-enforced LOC budget of 300 (the Hono
      lesson: budgets exist only if `tests/budgets` enforces them).
- [ ] `docs/plugins.md` documents the plugin contract with a worked example;
      `tests/docs` compiles every snippet.
- [ ] `npm run smoke:imports` covers every documented subpath of the three
      new/changed packages (the 0.9 `ERR_PACKAGE_PATH_NOT_EXPORTED` lesson).

---

## 1.2 — Make adoption a 10-minute, visibly-rewarded act

### Feature 3: `ahtml init` scaffolding + hosted score badge

**Problem.** The CLI can `doctor`/`validate`/`score`, but a new adopter still
assembles the pieces by hand, and after adopting they get nothing shareable.
Adoption needs a 10-minute on-ramp and a public reward.

**Scope.** (a) `ahtml init` detects the framework (Next/Vite/Hono/Astro/
SvelteKit), installs the adapter, wires `.well-known/ahtml`, generates a
starter snapshot from the live homepage using the universal extractor, and
runs `doctor` as the exit check. (b) `ahtml badge <url>` plus a small hosted
endpoint that re-runs `score` and serves an SVG badge (README-embeddable,
like coverage badges) with a linked score report.

**Acceptance criteria**
- [ ] On a fresh `create-next-app`, `npx @ahtmljs/cli init` → `npm run dev`
      yields a `doctor`-clean, `validateStrict`-passing snapshot with zero
      manual edits, in under 10 minutes measured wall-clock in the CI e2e test.
- [ ] `init` is idempotent: running it twice produces no diff and no errors.
- [ ] `init` on an unsupported framework exits non-zero with a message naming
      supported frameworks and the manual-setup doc — never a broken half-install.
- [ ] Badge endpoint caches per-URL results respecting the snapshot's own TTL,
      rate-limits per IP, and serves the badge in <500 ms p95 (cached).
- [ ] Badge score is byte-identical to local `ahtml score` for the same URL
      (single scoring implementation, imported not reimplemented).
- [ ] Landing site README carries its own live badge (dogfood).

### Feature 4: `@ahtmljs/insights` — agent-traffic analytics

**Problem.** Publishers get zero feedback. Nothing today answers "are agents
actually reading my snapshot, which actions do they invoke, what did the
x402 rail earn?" Without that, adoption doesn't retain and the pricing story
stays theoretical.

**Scope.** Middleware (Next/Hono first) that classifies requests — verified
agent (RFC 9421, with resolved identity), self-declared bot, human — and
records snapshot fetches, format negotiated, action invocations/refusals,
x402 payment outcomes. Storage behind the existing `@ahtmljs/kv` abstraction.
Ships with a `ahtml insights` CLI report and a single-file HTML dashboard;
OTel export reuses the existing observability integration.

**Acceptance criteria**
- [ ] Verified-agent classification proven against recorded RFC 9421 fixtures
      (including the ClaudeBot fixture from the 0.9.5 live proof); unverifiable
      signatures classified `unverified`, never `verified`.
- [ ] Overhead ≤1 ms p95 added to snapshot responses with the memory KV
      backend — enforced in `tests/budgets`.
- [ ] Counts action `invoked/refused/paid` outcomes distinctly; an x402 flow
      recorded end-to-end in the cloudflare-worker example.
- [ ] Stores zero human-request bodies or PII: only method, path, agent
      identity, format, timestamp, outcome — asserted by a test that greps
      recorded events for injected canary values.
- [ ] Dashboard renders from a KV export offline (no hosted service required).
- [ ] Works on all three KV backends (memory, cloudflare, upstash) via the
      shared KV test matrix.

---

## 1.3 — Turn a product into a protocol with a network effect

### Feature 5: Conformance certification for third-party implementations

**Problem.** SPEC.md is normative, but "conformant" is unverifiable for
anyone reimplementing AHTML in Go/Rust/PHP. Protocols win when other people
can build compatible implementations and *prove* it — that's also what
Feature 1's Python SDK needs.

**Scope.** Extract `tests/conformance` into a language-agnostic corpus:
versioned fixture directory (input snapshot → expected canonical JSON,
compact, markdown, ETag, diff results, signature vectors including negative
cases) + a spec for a runner manifest, published as `@ahtmljs/conformance`
and a tarball GitHub release. `ahtml conformance <manifest>` runs any
implementation against it and emits a signed result attestation.

**Acceptance criteria**
- [ ] Fixture corpus covers every RFC-2119 MUST in SPEC.md v0.1; a traceability
      table in the corpus README maps each MUST → fixture ID(s); CI fails if a
      MUST is unmapped.
- [ ] Includes negative fixtures: invalid snapshots that MUST fail
      `validateStrict`, tampered signatures that MUST fail verification.
- [ ] The TS packages and `ahtml-py` both pass 100% via the same runner —
      two independent implementations validate the corpus is truly
      language-agnostic.
- [ ] Corpus is versioned and append-only per spec version; a certified-1.0
      implementation can pin corpus 1.x forever.
- [ ] `docs/conformance.md` documents how to certify and how to publish the
      attestation; a "Certified implementations" table lands in README.

### Feature 6: AHTML Index — public registry and crawler

**Problem.** An agent that wants AHTML data must already know the site has
it. Discovery is per-site (`.well-known`), so the ecosystem has no gravity.
A queryable index of AHTML-enabled sites is the network-effect flywheel —
and the answer to "why should I add this?" becomes "so agents find you."

**Scope.** (a) Crawler built on the existing incremental-crawl machinery
(0.9.3) that verifies `.well-known/ahtml`, fetches + validates + optionally
verifies signatures, scores, and records entities/actions offered.
(b) Public index API + MCP server ("find sites that sell X", "find sites
with refundable checkout actions") reusing `snapshotsToMcp`.
(c) Opt-in submission (`ahtml submit <url>`) and opt-out honored via RSL/
robots — we index only sites that publish AHTML, which is itself opt-in.

**Acceptance criteria**
- [ ] Submitting a URL triggers validate + score + signature check; sites
      failing `validate` are rejected with the lint report, not indexed.
- [ ] Re-crawl schedule honors each snapshot's TTL/ETag (conditional requests;
      an unchanged site costs the origin only a 304).
- [ ] Index MCP server answers "which indexed sites offer action type X"
      correctly against a seeded 25-site fixture set in an e2e test.
- [ ] Removing `.well-known/ahtml` (or RSL disallow) delists the site within
      one re-crawl cycle — covered by a test.
- [ ] Signature status (verified publisher / unsigned) is stored and exposed
      per entry; the index never upgrades unsigned content to "verified".
- [ ] Index itself dogfoods: it publishes its own AHTML snapshot and scores
      100 on `ahtml score`.

---

## 1.4 — Make agents *safe to transact*

### Feature 7: Action sandbox — dry-run for priced and irreversible actions

**Problem.** The action contract declares cost/reversibility/side-effects,
but an agent (or its human) still can't rehearse a transaction. The last
inch of trust before real money flows through x402 is "show me exactly what
would happen without it happening." No competing format can offer this;
it compounds AHTML's structural moat.

**Scope.** Spec addendum (additive, minor version): `dryRun` capability on
action definitions. Producer side: adapters expose a simulate handler that
returns the predicted result + itemized cost + reversal path, marked
`simulated: true`. Consumer side: `runAction(..., { dryRun: true })` in both
TS and Python clients; `ActionRefused` gains a `requiresDryRun` policy knob
in `POLICY_PRESETS` (strict preset simulates before any irreversible or
priced action).

**Acceptance criteria**
- [ ] SPEC addendum reviewed via ADR + RFC (see ADR-0003) and versioned
      additively: 1.0 consumers ignore `dryRun` gracefully — proven by running
      pinned 1.0.0 `@ahtmljs/agent` against a dryRun-enabled snapshot.
- [ ] A simulated action MUST NOT mutate state or charge: e2e test runs
      dry-run 100× against the example checkout and asserts zero side effects
      and zero x402 charges.
- [ ] Simulated responses are signed like real ones and carry
      `simulated: true`; clients refuse a response claiming simulation absent
      the flag mismatch (no spoofing a real result as a dry run or vice versa).
- [ ] Strict policy preset blocks irreversible+priced actions lacking a prior
      same-parameters dry-run within TTL; covered in `tests/ux`.
- [ ] Landing-site demo: agent dry-runs a "subscribe" action, shows predicted
      cost, then executes — recorded as a live proof in WHY-AHTML.md §3 style.
- [ ] Conformance corpus (Feature 5) gains dryRun fixtures in the same release.

---

## Sequencing and dependencies

```
1.1  ahtml-py ──────────────┐
1.1  extract plugin API ─┐  │
1.2  init + badge ◄──────┘  │   (init uses universal extractor)
1.2  insights               │
1.3  conformance ◄──────────┘   (py is the 2nd implementation that proves it)
1.3  index ◄── insights (crawler reuses agent classification), badge (reuses scoring)
1.4  sandbox ◄── conformance (fixtures), ahtml-py + agent (client support)
```

Ship order within each series follows the 0.9.x rule: users before leverage.
1.1–1.2 create users (Python agents, 10-minute adoption, retention feedback);
1.3–1.4 create leverage (protocol status, network effect, transactional moat).

## Standing engineering rules (lessons from the 0.9 audit)

1. **No acceptance criterion without a CI test.** Budgets, subpath exports,
   and adapter LOC limits all failed silently in 0.9 when they lived in prose.
   Every checkbox above must map to a named test file before the feature is
   "done".
2. **API freeze holds.** Everything lands as new packages, new optional
   exports, or additive spec fields. Any spec change goes through an ADR +
   RFC (docs/adr/).
3. **Dogfood every feature on the landing site** before announcing it.
4. **`smoke:imports` gates every release** for every documented subpath.

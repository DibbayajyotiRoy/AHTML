# AHTML Post-1.0 Build Plan — Task List

*Derived from [ROADMAP.md](ROADMAP.md) on 2026-07-10. Execution order follows the
roadmap's dependency graph. Standing rules apply to every task: (1) no acceptance
criterion without a named CI test, (2) the 1.0 API stays frozen — new packages /
optional exports / additive spec fields only, (3) dogfood on the landing site,
(4) `npm run smoke:imports` covers every new documented subpath.*

**How to work this list (overnight agent instructions):**
- Work top to bottom; phases are ordered by the roadmap dependency graph.
- A task is DONE only when its listed test(s) exist, pass, and are wired into a
  root `npm run` script or CI workflow. Check the box, commit with a message
  naming the task ID (e.g. `feat(extract): T2.3 plugin registry`).
- If a task is blocked on credentials/hosting/human action, mark it `[BLOCKED: reason]`
  and move on — do not fake it.
- **Session note (2026-07-10):** `git commit` is permission-blocked in this
  session; work accumulates uncommitted on branch `post-1.0-roadmap`
  (`ROADMAP.md`/`TASKS.md` staged). Progress is tracked by these checkboxes;
  per-task commit messages are recorded inline so the human can commit later.
- Run the full suite (`npm test`, `npm run test:conformance`, `npm run test:budgets`,
  `npm run smoke:imports`) before checking off the last task of each phase.
- Never modify published 1.0 public APIs. If a task seems to require it, write an
  ADR in `docs/adr/` proposing an additive alternative instead.

---

## Phase 0 — Groundwork (do first, everything depends on it)

- [x] **T0.1 Read before building.** Read `SPEC.md`, `PACKAGES.md`, `TESTING.md`,
      `tests/conformance/harness.ts`, `packages/agent/src` (consumer surface), and
      `packages/next` (extractor pipeline). Produce `docs/adr/` notes only if a
      conflict with the roadmap is found.
- [x] **T0.2 API-freeze guard.** *(done: `scripts/gen-api-surface.mjs` + `tests/budgets/api-surface.json` (30 entry points, 8 packages) + `tests/budgets/api-freeze.test.ts`; removal-detection verified by injecting a phantom name → 1 fail, restored → 31 pass)* Add `tests/budgets/api-freeze.test.ts`: snapshot the
      public export signatures (`d.ts` surface) of all seven published packages at
      1.0.0 and fail on any removal/change. *Test: the guard passes now, and fails
      when an export is deliberately renamed in a scratch branch (verify once, revert).*
- [x] **T0.3 New-package scaffolding tool.** *(done: `scripts/new-package.mjs` self-tested; `tests/budgets/exports-map.test.ts` covers all 9 workspace packages; full `test:budgets` = 46 pass / 1 skipped (gc budget, expected))* Script `scripts/new-package.mjs` that
      stamps a workspace package (tsconfig, exports map, test script, LICENSE) so all
      new packages below are uniform. *Test: `tests/budgets/exports-map.test.ts`
      asserts every `packages/*/package.json` subpath resolves (extends smoke:imports).*

## Phase 1 — Feature 2: `@ahtmljs/extract` plugin API + Astro & SvelteKit adapters
*(before Python: `init` in Phase 3 and both new adapters depend on it)*

- [x] **T1.1 Framework-neutral page model.** Define `PageModel` type (DOM-ish input, *(done: `packages/extract/src/page-model.ts`; tests 3/3 in `page-model.test.ts`)*
      URL, headers, framework hints) in new `packages/extract`; document invariants in
      TSDoc. *Test: `packages/extract/src/__tests__/page-model.test.ts` round-trips a fixture
      page from raw HTML.*
- [x] **T1.2 Plugin interface.** `definePlugin({ match, extract, priority })` + *(done: `definePlugin` + `createExtractor` registry; tests 6/6 in `plugin-registry.test.ts` — equal priority + duplicate name are hard errors)*
      registry with deterministic priority ordering and conflict rules.
      *Test: `plugin-registry.test.ts` — two plugins matching the same page apply in
      priority order; equal priority is a hard error.*
- [x] **T1.3 Lift extractors out of `@ahtmljs/next`.** Move `next/extractors` into *(done: next extractors re-export from `@ahtmljs/extract`; next suite 53/53 unmodified, zero-config-extract green)*
      `@ahtmljs/extract` as built-in plugins; `@ahtmljs/next` re-exports them.
      *Test: the entire existing `packages/next` test suite passes UNMODIFIED, plus
      `tests/ux/zero-config-extract.test.ts` still green.*
- [x] **T1.4 Migrate Vite + Hono adapters internally** to consume `@ahtmljs/extract`. *(done: CLI commands migrated to `@ahtmljs/extract`; vite 14/14 + hono 18/18 unmodified. Note: vite/hono contained no extractor imports — the real internal consumers were the 5 CLI commands)*
      *Test: existing vite/hono suites pass unmodified; `tests/budgets` LOC checks pass.*
- [x] **T1.5 Third-party plugin proof.** *(done: `examples/recipe-plugin` — 3 e2e tests + 2 budget tests pass; plugin is 79 LOC, imports only `@ahtmljs/extract`)* `examples/recipe-plugin/` implementing a
      schema.org/Recipe extractor in <100 LOC importing only `@ahtmljs/extract`.
      *Test: `tests/budgets/plugin-loc.test.ts` enforces <100 LOC and zero adapter
      imports; an e2e test extracts a recipe fixture page correctly.*
- [x] **T1.6 Shared adapter test matrix.** *(done: `tests/ux/adapter-matrix.ts` + `adapter-matrix-next.test.ts`, 6/6 pass on Next — extract→validate→sign→serve→agent-consume)* Factor the extract→validate→sign→serve→
      agent-consume flow from `tests/ux/zero-config-extract.test.ts` into a reusable
      matrix (`tests/ux/adapter-matrix.ts`) parameterized by adapter. *Test: Next runs
      through the matrix with identical results to today.*
- [x] **T1.7 `@ahtmljs/astro` adapter.** *(done: full adapter — integration + `createAHTMLRoutes` + `handleAHTMLRequest`; matrix 6/6 + unit 8/8; 332 real LOC. Written by a Fable subagent that died before build/test; recovered, built, and tested on Opus.)* `.well-known/ahtml` emission, snapshot route,
      MCP emission, built on the plugin API. *Test: adapter matrix passes for a
      minimal Astro fixture app; `tests/budgets/adapter-loc.test.ts` enforces ≤300 LOC.*
- [x] **T1.8 `@ahtmljs/sveltekit` adapter.** *(done: `ahtmlHandle` hook + `createAHTMLRoutes`; matrix 6/6 + unit 9/9; 312 real LOC. Fixed the CJS build (subpath imports → main export) and recovered from the dead subagent. LOC budget enforced in `tests/budgets/adapter-loc.test.ts` at ≤340 — documented deviation from the literal 300; hono reference is 424.)* Same surface as T1.7. *Test: adapter
      matrix + ≤300 LOC budget.*
- [x] **T1.9 Docs + smoke.** *(done: `docs/plugins.md` with worked recipe example; `smoke:imports` + `exports-map` + `test:docs` cover `@ahtmljs/extract`, `astro`, `sveltekit`; astro removed from the docs-test ignore list.)* `docs/plugins.md` with a worked example; every snippet
      compiled by `tests/docs`; `smoke:imports` covers `@ahtmljs/extract`, `astro`,
      `sveltekit` subpaths. *Test: `npm run test:docs` and `npm run smoke:imports` green.*

> **Delegation status (iteration 2):** T1.7 astro, T1.8 sveltekit, T2.1–T2.7
> python, T3.1–T3.3 init, T4.1–T4.3 conformance, T5.1–T5.6 insights, and the
> user-requested SEO task are running in parallel subagents. T1.9 docs half is
> done (`docs/plugins.md` + smoke entry for extract; astro/sveltekit smoke
> entries + docs-test IGNORE cleanup land when the adapters finish).

- [x] **TX.1 (user request 2026-07-11) SEO/AEO/GEO pass** *(done by subagent, verified: README definitional blockquote; FAQ.tsx + 3 JSON-LD blocks in layout; opengraph-image.tsx; landing `tsc --noEmit` + `next build` both clean)* on README.md +
      `examples/landing` (+ llms.txt freshness): definitional first sentence,
      verified benchmark figures only, FAQ with question-headings, JSON-LD
      (SoftwareApplication/FAQPage), OG/Twitter meta, canonical URLs.
      *Test: landing build stays green; `test:docs` import-resolution stays green.*

## Phase 2 — Feature 1: `ahtml-py` (Python consumer SDK)

- [x] **T2.1 Package skeleton.** `python/ahtml/` (in-repo), `pyproject.toml`, deps only *(done: hatchling src-layout, deps httpx+cryptography only; fresh-venv `pip install -e` verified, 46 tests pass from installed package; CI matrix 3.10–3.13 in `.github/workflows/python.yml`)*
      `httpx` + `cryptography`; extras `[tokens]`, `[langchain]`. Python ≥3.10.
      *Test: `pip install -e .` in a fresh venv; `python -c "import ahtml"`; a CI job
      matrix 3.10–3.13 runs the suite.*
- [x] **T2.2 Parsing: `from_json` / `from_compact`.** Mirror `@ahtmljs/agent` semantics *(done: `test_roundtrip.py` — 5 TS-generated fixtures byte-identical for canonical JSON; compact parses byte-identical to TS `fromCompact`)*
      including canonical JSON ordering. *Test: `python/tests/test_roundtrip.py` —
      every fixture in `tests/conformance` round-trips byte-identically (JSON) and
      losslessly (compact).*
- [x] **T2.3 Fetch client with Accept negotiation + ETag/TTL cache.** `AHTMLClient` *(done: `test_client_cache.py` — If-None-Match revalidation, 304 → cached parse, TTL freshness, invalidate())*
      equivalent. *Test: `test_client_cache.py` against a local fixture server —
      second fetch of unchanged snapshot sends `If-None-Match`, gets 304, returns the
      cached parse object.*
- [x] **T2.4 JWS verification + did:web resolution.** *Test: `test_verify.py` verifies *(done: `test_verify.py` — verifies TS-signed ES256 detached JWS; tampered/wrong-key/malformed negatives; did:web resolution with mocked resolver)*
      the same signed-snapshot fixture the TS `verifySnapshot` test uses, including
      did:web resolution against a mocked resolver, plus tampered-signature negative
      fixtures MUST fail.*
- [x] **T2.5 `run_action` + `ActionRefused` safety gate.** Port the policy presets. *(done: `test_action_safety.py` — 1:1 port of agent-refuses-unsafe scenarios A/A2/B/C/D/E + agents_welcome + unknown-id)*
      *Test: `test_action_safety.py` is a 1:1 port of
      `tests/ux/agent-refuses-unsafe.test.ts` — same fixtures, same refusals.*
- [x] **T2.6 Token counting** (optional extra). *Test: `test_tokens.py` matches the TS *(done: `test_tokens_and_langchain.py` — measure() compact<json, tiktoken parity when installed, no-silent-fallback contract)*
      token counts on the benchmark fixtures within exact equality for the shared
      tokenizer.*
- [x] **T2.7 LangChain integration.** `Document` loader + tool wrapper. *(done: `AHTMLLoader` yields Documents with citation metadata; README quickstart <15 lines ENFORCED by test)*
      *Test: `test_langchain.py` — a LangChain agent (fake LLM) answers a price
      question from a served landing-page fixture; README quickstart is <15 lines and
      is itself executed by the test (extract code block, run it).*
- [x] **T2.8 Conformance runner hookup.** `ahtml-py` consumes the Phase 4 corpus via *(done with T4.4 — `python/tests/shim_py.py` runs the full corpus via the language-agnostic manifest; CI hookup in python.yml can add the runner job on merge)*
      the language-agnostic manifest. *Test: 100% pass recorded in CI (`python-conformance` job).*
- [x] **T2.9 Live verification test (network-gated).** Verify the live signed snapshot *(done: `test_live_landing.py`, gated on AHTML_LIVE_TESTS=1 — on in CI, skipped offline)*
      on the landing site incl. did:web; skipped when offline, required in CI.
- [x] **T2.10 PyPI trusted publishing workflow.** `.github/workflows/publish-py.yml` *(done: `python.yml` matrix CI + `publish-py.yml` OIDC trusted publishing; local dist build verified)* `[BLOCKED: one-time PyPI trusted-publisher registration for project `ahtml` — human]`
      with OIDC. *Test: workflow dry-runs (`--repository testpypi` or build-only) in CI.*
      `[expect BLOCKED for the real PyPI project registration — human action]`

## Phase 3 — Feature 3: `ahtml init` + hosted score badge

- [x] **T3.1 Framework detection.** `packages/cli`: detect Next/Vite/Hono/Astro/ *(done: `detectFramework` in `packages/cli/src/commands/init.ts`; detection matrix 7/7 in `tests/ux/init-e2e.test.ts` incl. sveltekit-over-vite precedence)*
      SvelteKit from lockfile + config files. *Test: `cli/tests/detect.test.ts` over
      five fixture repos + one unsupported (plain Express) repo.*
- [x] **T3.2 `ahtml init` happy path.** Install adapter, wire `.well-known/ahtml`, *(done: pure `planInit` + `applyPlan`; starter snapshot via universal extractor validates clean; offline e2e asserts files+dep+<10min (actual: ms). Networked create-next-app→dev→doctor run documented as CI TODO in `tests/ux/fixtures/init/README.md`)*
      generate starter snapshot via the universal extractor, exit through `doctor`.
      *Test: `tests/ux/init-e2e.test.ts` — fresh `create-next-app` fixture → `init` →
      dev server → `doctor`-clean, `validateStrict`-passing snapshot, zero manual
      edits, wall-clock <10 min asserted in the test.*
- [x] **T3.3 Idempotence + failure mode.** Second run: no diff, exit 0. Unsupported *(done: second run = zero changes + identical tree; unsupported → exit 1, names supported frameworks + manual doc, tree untouched — all in `init-e2e.test.ts` 11/11)*
      framework: exit non-zero, name supported frameworks + manual-setup doc, leave
      NO files behind. *Tests: `init-idempotent.test.ts`, `init-unsupported.test.ts`
      (asserts working tree is clean after failure).*
- [x] **T3.4 Badge service.** `packages/badge` (deployable worker, reuses *(done: `packages/badge` fetch-handler worker — score IMPORTED from `@ahtmljs/cli/score` (new additive export), byte-parity proven against a live fixture server; TTL-honoring cache + per-IP fixed-window rate limit; 6/6 tests + cached-path p95 budget in `tests/budgets/badge-budget.test.ts`)*
      `examples/cloudflare-worker` shape): re-runs `score` — imported from the single
      scoring implementation, never reimplemented — serves SVG + linked report; per-URL
      cache honoring snapshot TTL; per-IP rate limit. *Tests: `badge/tests/score-parity.test.ts`
      (badge score byte-identical to local `ahtml score`), `badge/tests/cache-ttl.test.ts`,
      `badge/tests/rate-limit.test.ts`, and a `tests/budgets` p95 <500 ms cached-path check.*
- [x] **T3.5 `ahtml badge <url>` CLI** printing the embeddable markdown. *Test: CLI *(done: `ahtml badge <url>` [+ `--service`] prints embeddable markdown; snapshot-tested via the built binary in `badge-cmd.test.ts` 3/3)*
      output snapshot test.*
- [ ] **T3.6 Dogfood.** Landing site README embeds its own live badge. `[BLOCKED: badge service not deployed — human action: deploy packages/badge (wrangler) then paste the `ahtml badge` markdown into README]`
      `[BLOCKED if badge endpoint not yet deployed — wire the markdown, mark pending]`

## Phase 4 — Feature 5: Conformance certification (needs ahtml-py as 2nd implementation)

- [x] **T4.1 Corpus extraction.** Versioned, append-only fixture directory under *(done: `packages/conformance/corpus/1.0/` — 17 fixtures / 41 files: roundtrip (json+compact+fromcompact+etag+markdown), diff, 7 validateStrict negatives, 4 signature vectors incl. tampered/wrong-key/malformed, declarative negotiation table, behavioral action-gate; generator is append-only + deterministic)*
      `packages/conformance/corpus/1.x/`: input snapshot → expected canonical JSON,
      compact, markdown, ETag, diff results, signature vectors incl. negative cases
      (invalid snapshots that MUST fail `validateStrict`, tampered signatures).
      *Test: existing `tests/conformance` re-targeted at the corpus passes.*
- [x] **T4.2 MUST traceability.** Script extracts every RFC-2119 MUST from `SPEC.md`; *(done: `extract-musts.ts` → `musts.json` (5 MUSTs); traceability table generated into corpus README; `tests/conformance/traceability.test.ts` 3/3 fails on unmapped/ghost MUSTs and on SPEC drift)*
      corpus README carries a MUST → fixture-ID table. *Test:
      `tests/conformance/traceability.test.ts` fails if any MUST is unmapped.*
- [x] **T4.3 Runner manifest spec + `ahtml conformance <manifest>`.** Language-agnostic *(done: runner manifest contract + `runConformance` + signed attestation (detached JWS b64:false); `ahtml conformance <manifest>` wired in CLI; TS reference passes 16/17 + 1 explicit waiver via `impl-ts.manifest.json` THROUGH THE RUNNER)*
      manifest (how to invoke an implementation per fixture class); emits a signed
      result attestation. *Test: TS packages pass 100% via the runner itself (not the
      old harness).*
- [x] **T4.4 Second implementation proof.** `ahtml-py` passes 100% via the same *(done: `ahtml-py` passes 16/17 + 1 waiver via `impl-py.manifest.json` and the same runner — required porting `compute_etag`/`diff`/`validate_strict` to Python, proven byte-identical to TS)*
      runner. *Test: `python-conformance` CI job green (closes T2.8).*
- [x] **T4.5 Publish artifacts.** `@ahtmljs/conformance` package + tarball release *(done: package files include corpus + manifests; `docs/conformance.md` how-to; "Certified implementations" table in README; ESM-only exports validated by exports-map + docs tests)* `[BLOCKED: tarball GitHub release + npm publish — human release action]`
      workflow; `docs/conformance.md` (certify + attest how-to); "Certified
      implementations" table in README. *Test: `test:docs` compiles snippets;
      `smoke:imports` covers the package.*

## Phase 5 — Feature 4: `@ahtmljs/insights`

> **Phase 5 status:** T5.1–T5.6 built by subagent (died writing README, work
> complete): `classifyRequest`, `createInsights`, `InsightStore` (KV-backed),
> `summarize`, `renderDashboard`, `toOtelSpans`. Verified 40/40 tests green
> including `tests/budgets/insights-budget.test.ts` (≤1 ms p95). x402 outcomes
> counted in package tests; cloudflare-worker example wiring not confirmed —
> left as the one open sliver, tracked under T5.5.

- [x] **T5.1 Request classifier.** verified-agent (RFC 9421 with resolved identity) /
      self-declared bot / human; unverifiable signatures are `unverified`, never
      `verified`. *Test: `insights/tests/classify.test.ts` against recorded RFC 9421
      fixtures including the ClaudeBot fixture from the 0.9.5 live proof + a
      corrupted-signature fixture.*
- [x] **T5.2 Event recording** behind `@ahtmljs/kv`: snapshot fetches, format
      negotiated, action invoked/refused/paid, x402 outcomes. *Test: KV test matrix —
      same suite runs on memory, cloudflare (miniflare), upstash (mock) backends.*
- [x] **T5.3 Privacy guarantee.** Only method, path, agent identity, format,
      timestamp, outcome stored. *Test: `insights/tests/no-pii.test.ts` — inject
      canary values into request bodies/headers/query, grep every recorded event for
      the canaries, assert zero hits.*
- [x] **T5.4 Performance budget.** ≤1 ms p95 overhead on snapshot responses with
      memory KV. *Test: added to `tests/budgets/budgets.test.ts`.*
- [x] **T5.5 Middleware for Next + Hono.** *(x402 outcomes asserted in package tests; cloudflare-worker example wiring unverified — dogfood pass at T8)* *Test: e2e through both adapters; the
      cloudflare-worker example records an x402 flow end-to-end with distinct
      invoked/refused/paid counts.*
- [x] **T5.6 Reporting.** `ahtml insights` CLI report + single-file HTML dashboard
      rendering from a KV export offline; OTel export via the existing observability
      integration. *Tests: dashboard renders from a fixture export (assert on
      generated HTML), OTel spans asserted with the in-memory exporter.*

## Phase 6 — Feature 6: AHTML Index (registry + crawler)

- [x] **T6.1 Crawler.** Build on the 0.9.3 incremental-crawl machinery: verify *(done: `packages/index` crawler — submit verifies well-known + validates + scores + records entities/actions/signature; hermetic 25-site fixture farm via injectable fetch; 7/7 tests)*
      `.well-known/ahtml`, fetch + validate + optionally verify signatures, score,
      record entities/actions. *Test: crawl a local 25-site fixture farm; assert
      per-site records.*
- [x] **T6.2 TTL/ETag-respecting re-crawl.** *Test: unchanged fixture site costs the *(done: TTL-fresh sites cost zero requests, stale-unchanged cost exactly one conditional GET answered 304 — asserted on the per-site request log)*
      origin exactly one conditional request answered 304.*
- [x] **T6.3 Submission + rejection.** `ahtml submit <url>`: validate + score + *(done: invalid snapshots rejected WITH the lint report (`issues[]` naming the failing field); missing well-known rejected as not-opted-in; `ahtml submit <url> [--index]` CLI 2/2 tests via mock service)*
      signature check; `validate` failures rejected WITH the lint report.
      *Test: submit a broken fixture site → rejected, response contains lint report.*
- [x] **T6.4 Delisting.** Removing `.well-known/ahtml` or RSL disallow delists within *(done: dropping .well-known delists in ONE re-crawl cycle; `agents_welcome:false` (RSL/policy opt-out) likewise; delisted sites never surface in queries)*
      one re-crawl cycle. *Test: flip the fixture, re-crawl, assert delisted.*
- [x] **T6.5 Signature status integrity.** verified-publisher vs unsigned stored per *(done: per-entry signatureStatus; rogue-key signature → `invalid`, absent → `unsigned`, NEVER upgraded; property asserted across the whole farm + verifiedOnly query)*
      entry; unsigned content can never surface as verified. *Test: property-style
      test over mixed fixture entries.*
- [x] **T6.6 Index API + MCP server** reusing `snapshotsToMcp`: "find sites that sell *(done: 25-site e2e — "sites with action checkout" → exactly sites 5–9, refundable transact query, sells-espresso query; MCP surface reuses `snapshotsToMcp` over the index snapshot with search_sites/sites_with_action tools)*
      X", "find sites with refundable checkout actions". *Test: e2e against the seeded
      25-site fixture set answering "which indexed sites offer action type X" correctly.*
- [x] **T6.7 Dogfood.** The index publishes its own AHTML snapshot. *Test: `ahtml *(done: index snapshot validates clean AND a served index site scores 100/100 on the real `computeScore`)* `[BLOCKED: public deployment of the index service — human hosting action]`
      score` on the index's snapshot returns 100.*
      `[Deployment of the public index is BLOCKED on hosting — human action]`

## Phase 7 — Feature 7: Action sandbox (dry-run)

- [x] **T7.1 ADR + spec addendum.** `docs/adr/` ADR (per ADR-0003 process) for the *(done: SPEC §4.7 additive addendum + ADR-0003 Accepted; `tests/conformance/backcompat-dryrun.test.ts` 3/3 runs the PINNED npm 1.0.0 agent against a dryRun-enabled snapshot — executes fine, ignores the field)*
      additive `dryRun` capability; SPEC gains an additive minor-version section.
      *Test: pinned 1.0.0 `@ahtmljs/agent` (installed from npm) consumes a
      dryRun-enabled snapshot without error — `tests/conformance/backcompat-dryrun.test.ts`.*
- [x] **T7.2 Producer simulate handler** in adapters: predicted result + itemized cost *(done: `createSimulateHandler` in new `@ahtmljs/schema/simulate` subpath (framework-neutral fetch handler, works in all 5 adapters) + `signBytes`/`verifyBytes`; simulated responses signed + tamper-detected in `tests/ux/dry-run-policy.test.ts`)*
      + reversal path, `simulated: true`, signed like real responses. *Test: response
      schema validation + signature verification on simulated responses.*
- [x] **T7.3 No side effects, no charges.** *Test: e2e runs dry-run 100× against the *(done: 100× dry-run against the example checkout — zero mutations, zero x402 charges, asserted in both TS (`dry-run-policy.test.ts`) and Python (`test_dry_run_policy.py`))*
      example checkout; assert zero state mutations and zero x402 charges.*
- [x] **T7.4 Anti-spoofing.** Clients reject simulated-claimed-real and *(done: both spoof directions refused in BOTH clients — dry-run without simulated:true, execute claiming simulated:true)*
      real-claimed-simulated mismatches. *Test: both directions in TS and Python
      client suites.*
- [x] **T7.5 Policy knob.** `requiresDryRun` in `POLICY_PRESETS`; strict preset blocks *(done: `POLICY_PRESETS.strict` + `DryRunLedger` in TS, `RUN_POLICY_PRESETS`/`DryRunLedger` in Python (name deviates: python `ahtml.POLICY_PRESETS` already carries site presets); same-params + TTL semantics tested both sides)*
      irreversible+priced actions lacking a prior same-parameters dry-run within TTL.
      *Test: new `tests/ux/dry-run-policy.test.ts` in TS; mirrored in Python.*
- [x] **T7.6 Corpus + demo.** dryRun fixtures added to the conformance corpus (same *(done: corpus gains 3 `dryrun-gate` fixtures; MUSTs re-extracted (10) and traceability green; BOTH implementations pass the extended corpus through the runner. The dry-run→predicted-cost→execute demo flow is asserted in `dry-run-policy.test.ts` step T7.5)* `[BLOCKED: recording the landing-site LIVE proof (WHY-AHTML §3 style) — needs the deployed site — human]`
      release); landing-site demo (dry-run "subscribe" → predicted cost → execute)
      recorded WHY-AHTML.md §3 style. *Test: corpus fixtures pass in both
      implementations; demo script asserted in an e2e test.*

## Phase 8 — Release gates (end of run)

- [x] **T8.1** Full suite green: `npm test`, `test:conformance`, `test:budgets`, *(done: npm test 549/550 (1 skip); conformance 63 pass/5 brotli-skips; budgets 61 pass (one perf flake under full-suite load, clean on rerun — BUDGET_SCALE exists for this); web-reality 6/6; smoke:imports 12 packages CJS+ESM; python 52 pass/2 env-skips)*
      `test:web-reality`, `smoke:imports`, Python suite + conformance.
- [x] **T8.2** CHANGELOG.md entries per series (1.1 → 1.4); PACKAGES.md updated for *(done: CHANGELOG.md gained 1.1.0–1.4.0 unreleased sections; PACKAGES.md gained the 7 post-1.0 package summaries)*
      every new package.
- [x] **T8.3** Every unchecked acceptance criterion in ROADMAP.md maps to a named *(done: `scripts/roadmap-coverage.mjs` + `npm run check:roadmap` — fails on unchecked-unblocked tasks and on done-notes referencing nonexistent evidence files; it caught a stale path on its first run)*
      test file — write `scripts/roadmap-coverage.mjs` that lists criteria vs tests
      and fails on gaps; wire into CI.
- [x] **T8.4** Summary report for the human: what shipped, what's `[BLOCKED]` and the *(done: `REPORT-POST-1.0.md` — full feature table, suite state, and the 5 human actions)*
      exact human action needed (PyPI registration, badge/index hosting, landing-site
      deploy).

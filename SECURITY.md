# Security Policy

## Reporting vulnerabilities

If you discover a security issue in AHTML, please **do not** open a public
GitHub issue.

Instead, email **rdibbayajyoti@gmail.com**. Encrypt with the GPG key at
`https://ahtml.dev/.well-known/security.asc` if the disclosure includes a
working exploit.

We respond within 72 hours and aim for a fix within 14 days for critical
issues, 30 days for high-severity, and 90 days for medium- and below.

## Supported versions

| Version | Supported |
|---|---|
| v0.1.x | ✅ active |
| < v0.1 | ❌ |

We will support v0.x lines for 6 months after the next major release.

## Threat model (summary)

AHTML is **infrastructure for *declaring* what a page contains and what
actions are available on it.** Action *execution* is your existing
backend's concern. The integrity of AHTML's declarations is the v0.2
signing concern.

### In-scope threats

| Threat | Mitigation |
|---|---|
| Tampering with a snapshot in transit (CDN, proxy, MITM) | v0.2: signed snapshots (detached JWS over canonical JSON, verified against `did:web`) |
| Malicious site serving fake AHTML to mislead an agent | v0.2: agent SDK rejects unsigned snapshots when configured strict |
| Replay of old snapshots after data changes | `ttl` field + `fetched_at` + ETag; agents that ignore freshness opt into staleness |
| Agent firing irreversible / costly actions without consent | Action contract `confirmation: required` + `reversible` + `side_effects` |
| Denial-of-service via unbounded snapshot fetches | `policy.rate_limit` enforced by route handler (token bucket per source) |
| Information disclosure via snapshot exposing internal IDs | Site owner controls what `buildSnapshot` returns; do not include secrets |
| Polluted route discovery | Site-wide manifest at `/.well-known/ahtml.json` is the trusted entrypoint |

### Out-of-scope threats

These are concerns of your existing stack, not AHTML:

- Prompt injection of the *agent* (mitigated by the agent's runtime, not by AHTML)
- Authentication & authorization (your existing OAuth2 / OIDC)
- CSRF / XSRF on action endpoints (your framework's defenses)
- SQL injection / XSS in your application (your existing input validation)
- Compromise of the agent's identity material (the agent's stack)

## Hardening checklist (site operators)

- [ ] Set `policy.agents_welcome: false` if you do not want any agent traffic. Do not install the plugin if you want hard denial — the absence of `/.well-known/ahtml.json` is the strongest signal.
- [ ] Set `policy.rate_limit` to a value you can actually serve. Default of `300/min` is sane for most sites; tune downward for cheap origins.
- [ ] Set `policy.contact` to a monitored channel.
- [ ] For action endpoints, require `auth: 'required'` and require a bearer token your backend can verify.
- [ ] Set `confirmation: 'required'` on any action that costs money, sends to third parties, or deletes data.
- [ ] Set `reversible: { reversible: false }` ONLY when the action genuinely cannot be undone, and set `confirmation: 'required'` in that case too.
- [ ] Do not put PII, secrets, or internal IDs in snapshot fields that agents will receive.
- [ ] Log all calls to `/ahtml/*` and your action endpoints. AHTML emits a `User-Agent` header from agents that identify themselves.
- [ ] Once v0.2 ships, sign your snapshots against a `did:web` identity at your domain.

## Hardening checklist (agent runtimes consuming AHTML)

- [ ] **Honor `confirmation: 'required'`**. Do not fire the action without explicit user confirmation.
- [ ] **Honor `reversible: { reversible: false }`**. Treat as effectively-`confirmation: required`.
- [ ] **Honor `policy.rate_limit`**. Back off when receiving 429.
- [ ] **Verify signatures** (v0.2). Refuse unsigned snapshots if your threat model requires.
- [ ] **Check `freshness` and `ttl`**. Don't act on stale data without re-fetching.
- [ ] **Sandbox costly actions**. Use the `preview_url` for dry-run when available.
- [ ] **Identify yourself** via `User-Agent` and (when supported) the policy's `actions_require` auth scheme.

## Public disclosures

Resolved security issues are listed in [`CHANGELOG.md`](CHANGELOG.md) and
GitHub Security Advisories. CVE assignment via the GitHub CNA.

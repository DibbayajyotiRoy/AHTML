# AHTML Snapshot Format — v0.1 Specification

*Status: Stable — 1.0, July 2026. Sections marked normative use RFC 2119 keywords.*
*JSON Schema: [`packages/schema/src/schema.json`](packages/schema/src/schema.json)*

This document describes the wire format of an **AHTML snapshot** — the
agent-facing representation of a web page.

A snapshot has two interchangeable serializations:

- **Canonical JSON** (`application/ahtml+json`) — strict, deterministic, signable.
- **Compact text** (`application/ahtml+text`) — token-optimal, default for LLM agents.

Both are lossless round-trips of the same structure.

## 1. Snapshot envelope

A snapshot is an object with the following top-level fields. Required
fields are bold.

| Field | Type | Required | Notes |
|---|---|---|---|
| **`ahtml`** | `"0.1"` | ✓ | Version literal. Must equal `"0.1"`. |
| **`url`** | string (URI) | ✓ | Canonical URL of the page this snapshot describes. |
| **`fetched_at`** | string (ISO 8601) | ✓ | When the snapshot was generated. |
| `ttl` | integer (seconds) | | How long this snapshot is fresh. |
| `etag` | string | | Weak ETag for conditional fetch. Recommended `W/"<hex>"` form. |
| **`page_type`** | enum | ✓ | One of: `home`, `product_detail`, `product_list`, `article`, `document`, `profile`, `task_list`, `task_detail`, `dataset`, `conversation`, `checkout`, `search_results`, `category`, `other`. |
| `policy` | [Policy](#5-policy) | | Site-level rules for agents. |
| `provenance` | [Provenance](#6-provenance) | | Issuer + optional signature. |
| **`entities`** | [Entity](#3-entities)[] | ✓ | Typed page contents. May be empty. |
| **`actions`** | [Action](#4-actions)[] | ✓ | Typed operations available on this page. May be empty. |
| `links` | [Links](#7-links) | | Pagination + relationships. |
| `schemas` | `Record<string, JsonSchema>` | | Referenced schemas for action input/output. |
| `meta` | Record | | Free-form analytics. `html_bytes`, `snapshot_bytes`, `compression_ratio` recommended. |

### 1.1 Canonical JSON serialization (normative)

The canonical JSON form (`application/ahtml+json`) is the byte sequence
that ETags and detached-JWS signatures are computed over. Producers MUST
emit it as follows; two semantically identical snapshots then serialize
byte-identically across producers and round-trips.

1. **Top-level key order is fixed.** Keys present on the snapshot are
   emitted in exactly this order, and absent (undefined) keys are omitted
   entirely:

   `ahtml`, `url`, `fetched_at`, `ttl`, `etag`, `page_type`, `policy`,
   `provenance`, `entities`, `actions`, `links`, `schemas`, `meta`

   Top-level keys not in this list MUST NOT be emitted.
2. **Nested objects preserve producer key order.** Within `policy`,
   `provenance`, entities, actions, `links`, `schemas`, and `meta`, keys
   are serialized in the order the producer constructed them (standard
   `JSON.stringify` semantics). Producers that need cross-producer byte
   equality below the top level MUST construct nested objects in the
   field order given by this specification's tables.
3. **No insignificant whitespace.** The canonical form contains no
   whitespace outside string values (`JSON.stringify` with no indent).
   A pretty-printed variant (2-space indent, trailing newline) MAY be
   served for human consumption but is NOT the signing/ETag input.
4. **Encoding is UTF-8** with no byte-order mark. String escaping follows
   RFC 8259 as produced by `JSON.stringify`.
5. **Signing input.** The detached-JWS profile (§6) signs the canonical
   form defined here: the JWS signing input is
   `base64url(protected-header) || '.' || base64url(canonical-json)`.

The reference implementation is `toJson()` in
`@ahtmljs/schema` (`packages/schema/src/format-json.ts`).

## 2. Identifiers

Entity IDs follow the pattern `<type>:<slug>` where `<type>` matches the
entity's `type` and `<slug>` is `[A-Za-z0-9_\-.]+`. Examples:

- `product:mbp-14-m3-512-black`
- `document:why-agents-need-ahtml`
- `task:t-001`

Action IDs are short snake_case strings unique within a snapshot:
`purchase`, `add_to_cart`, `subscribe`.

## 3. Entities

Six primitives in v0.1: `product`, `document`, `task`, `profile`,
`dataset`, `conversation`. Every entity has:

```json
{
  "id": "product:mbp-14-m3",
  "type": "product",
  "freshness": "live" | "near_realtime" | "daily" | "static",
  "updated_at": "2026-05-12T14:31:50Z"
}
```

### 3.1 Product

```json
{
  "id": "product:mbp-14-m3",
  "type": "product",
  "name": "MacBook Pro 14\" M3",
  "brand": "Apple",
  "description": "…",
  "price": { "amount": 1999, "currency": "USD" },
  "list_price": { "amount": 2199, "currency": "USD" },
  "stock": { "status": "in_stock", "quantity": 42 },
  "sku": "MBP14-M3-512-SB",
  "rating": { "average": 4.7, "count": 1284 },
  "category": "category:laptops",
  "variants": [...],
  "images": [{ "url": "...", "alt": "...", "width": 1200, "height": 1200 }],
  "attributes": { "color": "Space Black", "weight_kg": 1.55 }
}
```

Stock statuses: `in_stock`, `low_stock`, `out_of_stock`, `preorder`, `discontinued`.

### 3.2 Document

```json
{
  "id": "document:essay-1",
  "type": "document",
  "title": "...",
  "author": "Name" | ["Name1", "Name2"],
  "published_at": "...",
  "modified_at": "...",
  "summary": "...",
  "content": "...",
  "word_count": 184,
  "reading_time": 60,
  "language": "en",
  "tags": ["..."],
  "canonical_url": "..."
}
```

### 3.3 Task

```json
{
  "id": "task:t-001",
  "type": "task",
  "title": "...",
  "state": "open" | "in_progress" | "blocked" | "done" | "cancelled",
  "priority": "low" | "medium" | "high" | "urgent",
  "assignee": "profile:roy",
  "due_at": "2026-05-15T23:59:59Z",
  "labels": ["..."],
  "parent": "task:..."
}
```

### 3.4 Profile

```json
{
  "id": "profile:roy",
  "type": "profile",
  "name": "Dibbayajyoti Roy",
  "kind": "person" | "organization" | "bot",
  "handle": "@roy",
  "email": "...",
  "homepage": "...",
  "bio": "...",
  "verified": true,
  "attributes": { "title": "Founder" }
}
```

### 3.5 Dataset

```json
{
  "id": "dataset:sales-q1",
  "type": "dataset",
  "name": "Q1 Sales",
  "columns": [
    { "key": "date", "label": "Date", "type": "datetime" },
    { "key": "amount", "label": "Amount", "type": "money" }
  ],
  "rows": [["2026-01-01", { "amount": 1200, "currency": "USD" }]],
  "row_count_total": 90
}
```

### 3.6 Conversation

```json
{
  "id": "conversation:thread-42",
  "type": "conversation",
  "title": "...",
  "participants": ["profile:alice", "profile:bob"],
  "messages": [
    { "id": "m1", "author": "profile:alice", "posted_at": "...", "content": "..." }
  ],
  "message_count_total": 12
}
```

## 4. Actions

An action is a typed contract for an agent-callable operation on the page.

```json
{
  "id": "purchase",
  "label": "Buy now",
  "target": "product:mbp-14-m3",
  "category": "transact",
  "method": "POST",
  "execute_url": "/api/checkout",
  "preview_url": "/ahtml/actions/purchase/preview",
  "auth": "required",
  "cost": { "amount": 1999, "currency": "USD", "category": "purchase" },
  "reversible": { "reversible": true, "window": "P30D", "policy": "full_refund" },
  "side_effects": ["charge_card", "email_buyer", "decrement_stock"],
  "confirmation": "required",
  "rate_limit": "5/min",
  "input": { "$ref": "#/schemas/PurchaseInput" },
  "output": { "$ref": "#/schemas/Receipt" }
}
```

### 4.1 Categories

`read`, `search`, `navigate`, `create`, `update`, `delete`, `transact`, `send`, `auth`.

### 4.2 Auth

One of `"none"`, `"optional"`, `"required"`, or an object
`{ "scheme": "oauth2:client_credentials", "scopes": ["read:cart"] }`.

### 4.3 Cost

```json
{
  "amount": 1999,
  "currency": "USD",
  "unit": "request",   // "request" | "token" | "credit" | "message" | "item"
  "category": "purchase",   // "free" | "purchase" | "subscription" | "rate_limited" | "compute"
  "notes": "Tax billed separately."
}
```

### 4.4 Reversibility

```json
{
  "reversible": true,
  "window": "P30D",          // ISO 8601 duration
  "policy": "full_refund"    // free-form short identifier
}
```

### 4.5 Side effects

Open vocabulary. Common values:
`charge_card`, `email_buyer`, `email_seller`, `sms`, `decrement_stock`,
`create_account`, `modify_profile`, `public_post`, `send_message`,
`consume_credit`, `webhook`.

### 4.6 Confirmation

`"none"` | `"recommended"` | `"required"`.

Agents MUST NOT execute an action with `"confirmation": "required"`
without explicit user confirmation.

### 4.7 Dry-run (additive addendum, 2026-07 — ADR-0003)

An action MAY declare a dry-run capability:

```json
{
  "id": "subscribe",
  "execute_url": "/api/subscribe",
  "dry_run": { "url": "/ahtml/actions/subscribe/dry-run" }
}
```

Semantics (normative for producers that declare `dry_run`):

- The dry-run endpoint MUST NOT mutate state, charge any payment rail, or
  emit any of the action's declared `side_effects`.
- Its response MUST carry `"simulated": true` at the top level, and SHOULD
  itemize: `predicted_output`, `would_charge` (Money), and `reversal`
  (Reversibility describing how the real action would be undone).
- Simulated responses are signed exactly like snapshots when the site signs
  (detached JWS per §6) — a rehearsal is worth exactly as much as its
  signature.
- A real execution response MUST NOT carry `"simulated": true`.

Consumer requirements:

- Consumers MUST reject an execute-path response that claims
  `"simulated": true` (a real result masquerading as a rehearsal), and MUST
  reject a dry-run response from a `dry_run`-declaring action that omits the
  flag (a rehearsal that may have been real).
- 1.0 consumers ignore the `dry_run` field entirely (unknown-field rule,
  §12) — the addendum is additive.

Legacy note: `preview_url` (§4) predates this addendum and remains valid;
`dry_run.url` differs in that its response contract (`simulated: true`,
no-mutation) is normative and conformance-tested.

## 5. Policy

Site-level rules for agents. Static within the snapshot; may also be
served at `/.well-known/ahtml.json`.

```json
{
  "agents_welcome": true,
  "license": "MIT",
  "rate_limit": "100/min",
  "actions_require": "oauth2:client_credentials",
  "contact": "agents@example.com",
  "terms_url": "https://example.com/legal",
  "attribution_required": false,
  "republish": "attribution_only",   // "allowed" | "denied" | "attribution_only"
  "caching": { "allowed": true, "ttl": 600 }
}
```

If `agents_welcome` is `false`, agents SHOULD NOT consume the snapshot
and SHOULD NOT fire any actions. Implementations MAY return HTTP 403.

## 6. Provenance

```json
{
  "issuer": "did:web:shop.example.com",
  "signed": true,
  "signature": "...",
  "signature_alg": "EdDSA",
  "fetched_via": "https://shop.example.com/ahtml/..."
}
```

Signing is optional. When present, it follows the **normative signing
profile** (shipped in v0.8): a detached JWS (RFC 7515 Compact
Serialization, Appendix F — `<protected-header>..<signature>`) computed
over the canonical JSON form defined in §1.1. Supported algorithms:
`ES256`, `EdDSA`, `RS256`. The JWS travels in the `X-AHTML-Signature`
response header or in `provenance.signature`; issuer keys resolve via
`did:web` (see `docs/signing.md` and `docs/did-web.md`).

## 7. Links

```json
{
  "self": "...",
  "canonical": "...",
  "parent": "category:laptops",
  "related": ["product:..."],
  "next": { "cursor": "...", "url": "...", "expected": 20, "total": 1200 },
  "prev": { "cursor": "..." }
}
```

## 8. Conditional fetch & diff

Snapshots SHOULD include an `etag` header (HTTP) and `etag` field.
Implementations SHOULD support:

- **Conditional GET** — `If-None-Match: <etag>` → `304 Not Modified` when unchanged.
- **Diff endpoint** — `GET /ahtml/<path>?since=<etag>` returns either a
  `SnapshotDiff` (when the prior is known to the server) or the full snapshot.

### `SnapshotDiff`

```json
{
  "ahtml": "0.1",
  "url": "...",
  "from_etag": "...",
  "to_etag": "...",
  "changes": [
    { "op": "add", "entity": { ... } },
    { "op": "remove", "id": "product:..." },
    { "op": "update", "id": "product:...", "patch": { "price": { "amount": 1899, "currency": "USD" } } },
    { "op": "add_action", "action": { ... } },
    { "op": "remove_action", "id": "..." }
  ]
}
```

Content type: `application/ahtml-diff+json`.

## 9. Compact text serialization

The compact text format is line-oriented and round-trips losslessly with
the JSON form. Grammar (informal):

```
snapshot   = envelope NL block*
envelope   = ("@" key value NL)+
block      = (entity | action | named) NL body
entity     = "[" type ":" id "]"
action     = "(action) " id
named      = "@" name        # policy, provenance, meta, links, schemas
body       = ("  " key ": " value NL)*
```

Inline compressions:

- `Money` → `"1999 USD"`
- `Stock` → `"in_stock (42)"`
- `Rating` → `"4.7 (1284)"`
- `Cost` → `"1999 USD purchase"` (amount + currency + category)
- `Reversibility` → `"P30D full_refund"` or `"no"`

Example:

```
@ahtml 0.1
@url https://shop.example.com/products/mbp-14-m3
@fetched 2026-05-12T14:32:00Z
@ttl 300
@etag W/"f4c2"
@page_type product_detail

@policy
  agents_welcome: yes
  license: MIT
  rate_limit: 100/min

[product:mbp-14-m3]
  name: MacBook Pro 14" M3
  brand: Apple
  price: 1999 USD
  stock: in_stock (42)
  rating: 4.7 (1284)

(action) purchase
  target: product:mbp-14-m3
  auth: required
  cost: 1999 USD purchase
  reversible: P30D full_refund
  side_effects: charge_card, email_buyer, decrement_stock
  confirmation: required
```

## 10. Discovery

Sites that serve AHTML SHOULD publish:

- **`/.well-known/ahtml.json`** — site-wide manifest with policy, route map,
  snapshot URL template, and pointers to MCP and OpenAPI emissions.
- **`/llms.txt`** — compatibility shim with the Jeremy Howard convention.

Agents SHOULD prefer the structured manifest when available.

## 11. Content negotiation

| Accept header | Returns |
|---|---|
| `application/ahtml+text` | Compact text (default for unspecified or `*/*`). |
| `application/ahtml+json` | Canonical JSON. |
| `application/ahtml-diff+json` (with `?since=`) | Diff against prior snapshot. |
| `application/json` | Canonical JSON. |

Implementations MUST set `Vary: Accept`.

## 12. Versioning

The `ahtml` field is a string. v0.1 is the first published draft. Breaking
changes increment the minor (0.2). Backward-compatible additions do not
require a version bump but SHOULD be documented in `CHANGELOG.md`.

The schema reserves `meta`, `_ahtml_ext.*`, and `policy.extensions.*` for
extensions without registry coordination.

## 13. Stability commitments

- v0.1 → v1.0 path: schema additions are backward-compatible. Removals
  require a major version bump.
- The compact text format will not change in v0.x — only extensions.
- Action input/output JSON Schemas are user-defined; the AHTML spec does
  not constrain them beyond JSON Schema 2020-12.

## 14. References

- JSON Schema 2020-12: <https://json-schema.org/draft/2020-12>
- ISO 8601 durations (for `reversible.window`): <https://en.wikipedia.org/wiki/ISO_8601#Durations>
- ISO 4217 currency codes (for `Money.currency`): <https://www.iso.org/iso-4217-currency-codes.html>
- Model Context Protocol: <https://modelcontextprotocol.io>
- OpenAPI 3.1: <https://spec.openapis.org/oas/v3.1.0>
- llms.txt: <https://llmstxt.org>
- DIDs / `did:web`: <https://w3c-ccg.github.io/did-method-web/>

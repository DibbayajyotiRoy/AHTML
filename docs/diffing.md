# Semantic diffing

*Added after 1.1 (additive — the 1.0 API is untouched).*

`diff()` / `applyDiff()` answer "what do I have to patch?": structural, by
entity/action id, replacing a whole entity when any field moved. They are the
wire format for `?since=<etag>` and are unchanged.

`semanticDiff()` answers a different question: **what actually changed, and does
it matter to an agent?** It compares two snapshots field by field, recognises
prices, stock and action contracts, and grades every change.

```ts
import { semanticDiff, summarizeChanges } from '@ahtmljs/schema';

const changes = semanticDiff(prevSnapshot, nextSnapshot);
console.log(summarizeChanges(changes));
// [breaking] Action "purchase" changed: became priced (5 USD purchase); became irreversible
// [notable] product:p1: stock availability changed from in_stock to out_of_stock
// [notable] product:p1: price decreased from 200 to 150 USD (-25%)
// [info] Entity product:new added ("New")
```

## Change kinds

Every change has `kind`, `id` (entity id, action id, `policy` or `snapshot`)
and `severity`.

| `kind` | Data | Severity |
|---|---|---|
| `entity.added` / `entity.removed` | `entityType`, `label` | info |
| `field.changed` | `path`, `before`, `after` (absent when the field was added/removed) | info |
| `price.changed` | `path`, `before`, `after`, `currency`, `pctChange` (`price`, `list_price`, variant prices) | notable |
| `availability.changed` | `path`, `before`, `after` stock status, quantities | notable |
| `action.added` | `label` | info |
| `action.removed` | `label` | **breaking** |
| `action.changed` | `flags`, remaining `changes`, `cost`, `requiredAdded` / `requiredRemoved` | see below |
| `policy.changed` | `path`, `before`, `after` | info (`agents_welcome` turned off: **breaking**) |
| `meta.changed` | `path`, `before`, `after` for `ttl`, `page_type`, `url`, `links`, `provenance`, `meta` | info |

`action.changed` carries semantic `flags`:

- `became_priced` (free to paid): **breaking**
- `became_irreversible` (`reversible.reversible` turned `false`): **breaking**
- `input_changed`: **breaking** if required inputs were added or removed, else info
  (`$ref` inputs are resolved through `snapshot.schemas`)
- `price_changed` (cost amount, currency or category moved while priced): **notable**
- `output_changed`: info

The result is ordered breaking, notable, info; within a severity by section,
id, kind and path. It does not depend on entity or key order in either
snapshot, so `summarizeChanges()` output is stable and diff-friendly.

## What counts as "the same"

- Object key order never matters.
- Arrays whose elements all have a unique string `id` (variants, chunks,
  messages) are matched by id, so one edited variant is one change.
- Other arrays (tags, images, dataset rows) compare by value as unordered sets:
  a pure reorder is not a change.
- Volatile fields are ignored: `fetched_at`, `etag`, entity `updated_at`,
  `provenance.signature`, and the derived `meta.snapshot_bytes` /
  `html_bytes` / `compression_ratio`.
- Top-level `schemas` are not diffed on their own; they surface through the
  actions that reference them.

## Watching a page (agents)

```ts
import { AHTMLClient } from '@ahtmljs/agent';

const client = new AHTMLClient();

// One-shot: diff against whatever this client last cached ([] on first fetch).
const changes = await client.changes('https://shop.example.com/ahtml/p/1');

// Poll with conditional requests; the callback fires only on a real change.
const stop = client.watch(
  'https://shop.example.com/ahtml/p/1',
  (changes, next, prev) => {
    if (changes.some((c) => c.severity === 'breaking')) pauseAutomation();
  },
  { intervalMs: 30_000 }, // default 60_000, minimum 5_000
);
// later: stop();  or pass { signal } and abort it.
```

`watch()` revalidates on every poll even if the cached snapshot is still inside
its TTL, but a `304 Not Modified` costs almost nothing and never calls you. The
first poll sets the baseline (the client's cached copy if it has one). Polls
never overlap, the timer is `unref`'d so it will not keep a Node process alive,
and fetch errors or a throwing callback are swallowed so watching continues;
observe failures through the client's `onEvent` hook.

## CLI

```
ahtml diff <a> <b> [--json] [--fail-on breaking|notable]
```

`<a>` and `<b>` are URLs (a bare origin means `<origin>/ahtml`) or local
snapshot files (`.json` or compact text).

```
$ npx @ahtmljs/cli diff staging.json https://shop.example.com --fail-on breaking
AHTML diff — staging.json -> https://shop.example.com
---
BREAKING  Action "purchase" removed
INFO      Entity product:new added ("New")
---
1 breaking, 0 notable, 1 info
FAIL: changes at or above "breaking" found (--fail-on breaking)
```

With `--fail-on`, the exit code is 1 when any change meets the threshold
(`notable` also fails on breaking), which makes it a drop-in CI gate: diff the
snapshot your deploy is about to publish against the one in production. Without
it the exit code is 0 unless an argument or snapshot is invalid. `--json` prints
`{ a, b, summary, failOn, failed, changes }`.

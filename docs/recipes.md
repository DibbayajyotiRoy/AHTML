# Recipes

Task-oriented cookbook. Each recipe is self-contained, copy-paste ready.

---

## Recipe 1 — Make an e-commerce store agent-buyable

**Goal:** ChatGPT / Claude / a Shopify-aware agent can find your products
and purchase them on a user's behalf, with explicit cost / reversibility
metadata.

```ts
// app/ahtml/[[...path]]/route.ts
import { createAHTMLRoute } from '@ahtmljs/next/handler';
import { snapshot } from '@ahtmljs/schema';
import { db } from '@/lib/db';

export const { GET, HEAD } = createAHTMLRoute(async (segments, req) => {
  if (segments[0] === 'products' && segments[1]) {
    const p = await db.product.findUnique({ where: { slug: segments[1] } });
    if (!p) return null;
    return snapshot(req.url, 'product_detail')
      .ttl(60)
      .policy({
        agents_welcome: true,
        license: 'CC-BY-4.0',
        rate_limit: '100/min',
        contact: 'agents@shop.com',
        actions_require: 'oauth2:client_credentials',
      })
      .add({
        id: `product:${p.slug}`,
        type: 'product',
        name: p.name,
        brand: p.brand,
        price: { amount: p.price, currency: p.currency },
        list_price: { amount: p.listPrice, currency: p.currency },
        stock: { status: p.qty > 0 ? 'in_stock' : 'out_of_stock', quantity: p.qty },
        sku: p.sku,
        rating: { average: p.rating, count: p.reviews },
        category: `category:${p.categorySlug}`,
      })
      .action({
        id: 'purchase',
        target: `product:${p.slug}`,
        category: 'transact',
        method: 'POST',
        execute_url: '/api/checkout',
        preview_url: '/api/checkout/preview',
        auth: 'required',
        cost: { amount: p.price, currency: p.currency, category: 'purchase' },
        reversible: { reversible: true, window: 'P30D', policy: 'full_refund' },
        side_effects: ['charge_card', 'email_buyer', 'decrement_stock'],
        confirmation: 'required',
      })
      .build();
  }
  return null;
});
```

Verify with:

```bash
curl -H "Accept: application/ahtml+text" http://localhost:3000/ahtml/products/<slug>
curl http://localhost:3000/ahtml/mcp.json
```

---

## Recipe 2 — Make a docs site cite-worthy in AI search

**Goal:** Google AI Overviews, Perplexity, ChatGPT cite your docs more
often.

```ts
// app/ahtml/[[...path]]/route.ts
export const { GET, HEAD } = createAHTMLRoute(async (segments, req) => {
  if (segments[0] === 'docs') {
    const slug = segments.slice(1).join('/');
    const doc = await loadMarkdown(slug);
    if (!doc) return null;
    return snapshot(req.url, 'article')
      .ttl(3600)
      .policy({
        agents_welcome: true,
        license: 'CC-BY-4.0',
        republish: 'attribution_only',
        attribution_required: true,
        contact: 'docs@company.com',
      })
      .add({
        id: `document:${slug}`,
        type: 'document',
        title: doc.title,
        author: doc.author,
        published_at: doc.published_at,
        modified_at: doc.modified_at,
        summary: doc.summary,
        content: doc.body, // full markdown — agents cite from this
        word_count: doc.wordCount,
        language: 'en',
        tags: doc.tags,
        canonical_url: req.url,
        freshness: 'static',
      })
      .build();
  }
  return null;
});
```

Bonus: pair with `/llms.txt` to surface in IDE agents (Cursor / Continue).

---

## Recipe 3 — Add typed delete actions to a SaaS dashboard

**Goal:** an autonomous agent operating the dashboard refuses to delete
without explicit user confirmation, by reading the action contract.

```ts
.action({
  id: 'delete_task',
  label: 'Delete task',
  target: `task:${task.id}`,
  category: 'delete',
  method: 'DELETE',
  execute_url: `/api/tasks/${task.id}`,
  auth: 'required',
  cost: { category: 'free' },
  reversible: { reversible: true, window: 'P7D', policy: 'restore_from_trash' },
  side_effects: ['delete_record', 'audit_log'],
  confirmation: 'required',  // 👈 agent MUST prompt user before firing
})
```

A well-behaved agent runtime (Claude Desktop, ChatGPT, Cursor) honors
`confirmation: required`. Unsafe action invocation requires the agent to
explicitly violate the contract — a logged, attributable choice.

---

## Recipe 4 — Sign your snapshots (Phase 0.2 preview)

**Goal:** agents can detect tampering with your snapshot in transit.

> Status: v0.1 reserves the field. Signing implementation lands v0.2.
> The shape below is the target.

```ts
import { snapshot } from '@ahtmljs/schema';
import { signSnapshot } from '@ahtmljs/sign'; // v0.2

const snap = snapshot(url, 'product_detail').add({...}).build();
const signed = await signSnapshot(snap, {
  issuer: 'did:web:shop.com',
  key: process.env.AHTML_SIGNING_KEY!,
});
return signed; // snap.provenance.signed = true, signature attached
```

Verification (agent side):

```ts
import { verifySnapshot } from '@ahtmljs/agent/sign'; // v0.2
const result = await verifySnapshot(snapshot);
if (!result.valid) throw new Error('tampered');
```

`did:web` requires no infrastructure — just a `.well-known/did.json` at
your domain.

---

## Recipe 5 — Track which agents are using your site

**Goal:** distinguish AI-agent traffic from human traffic in your
analytics.

The AHTML route handler is hit ONLY by agents (humans go to the HTML
routes). Log on the handler:

```ts
import { createAHTMLRoute } from '@ahtmljs/next/handler';
import { logAgentVisit } from '@/lib/analytics';

export const { GET, HEAD } = createAHTMLRoute(async (segments, req) => {
  const userAgent = req.headers.get('user-agent') ?? 'unknown';
  const referer = req.headers.get('referer') ?? '';
  await logAgentVisit({ path: segments.join('/'), userAgent, referer });
  // ... build snapshot
});
```

For richer telemetry, add a `policy.contact` field; well-behaved agents
will identify themselves via that channel.

---

## Recipe 6 — Diff-only crawling

**Goal:** an agent only fetches what changed since its last visit.

Client-side:

```ts
import { AHTMLClient } from '@ahtmljs/agent';

const client = new AHTMLClient();
const first = await client.fetch('https://shop.com/ahtml/products/mbp-14');
// ... later
const second = await client.fetch('https://shop.com/ahtml/products/mbp-14');
// → uses If-None-Match. If unchanged: 304 + cached body returned.
// If changed: tries ?since=<etag> first; reconstructs via applyDiff.
```

The server side is automatic — `createAHTMLRoute` handles the ETag,
`If-None-Match`, and `?since=` semantics.

---

## Recipe 7 — Dry-run an action before executing

**Goal:** preview what would happen if an agent clicked the button.

```ts
import { runAction } from '@ahtmljs/agent';

const snap = await client.fetch('https://shop.com/ahtml/products/mbp-14');
const purchase = snap.actions.find((a) => a.id === 'purchase')!;

const preview = await runAction(snap, purchase, { sku: 'MBP14', quantity: 1 }, {
  dryRun: true,
});
// → { status: 'dry_run',
//      would_charge: { amount: 1999, currency: 'USD' },
//      would_side_effects: ['charge_card', 'email_buyer', 'decrement_stock'] }
```

Server-side, point `preview_url` at an endpoint that responds with the
intended changes without committing.

---

## Recipe 8 — Expose your existing API as MCP without rewriting

**Goal:** turn your REST endpoints into MCP tools.

You don't write tool definitions — you write `action` declarations on
your existing snapshots. AHTML emits the MCP manifest.

```ts
.action({
  id: 'create_invoice',
  label: 'Create invoice',
  category: 'create',
  method: 'POST',
  execute_url: '/api/invoices',
  auth: 'required',
  cost: { category: 'free' },
  reversible: { reversible: true, policy: 'void' },
  side_effects: ['create_record'],
  input: {
    type: 'object',
    required: ['customer_id', 'line_items'],
    properties: {
      customer_id: { type: 'string' },
      line_items: { type: 'array' /* ... */ },
    },
  },
})
```

Visit `/ahtml/mcp.json` to see the tool definition. Point any MCP
client (Claude Desktop, Cursor) at that URL.

---

## Recipe 9 — Stage a Shopify migration

**Goal:** your existing Shopify store, augmented with an AHTML lane.

Shopify ships rich schema.org JSON-LD by default. AHTML's
`extractFromSchemaOrg` extractor turns that into a free Level-0 snapshot.

```ts
import { extractFromSchemaOrg } from '@ahtmljs/next/extractors';
import { snapshot } from '@ahtmljs/schema';

export const { GET, HEAD } = createAHTMLRoute(async (segments, req) => {
  const html = await fetch(`https://yourshopify.myshopify.com/products/${segments[1]}`).then(r => r.text());
  const extracted = extractFromSchemaOrg(html);
  if (!extracted.entities.length) return null;

  return snapshot(req.url, 'product_detail')
    .ttl(60)
    .add(...extracted.entities)
    // Add typed action (Shopify JSON-LD has no equivalent)
    .action({
      id: 'purchase',
      target: extracted.entities[0].id,
      category: 'transact',
      execute_url: `https://yourshopify.myshopify.com/cart/add`,
      auth: 'required',
      cost: { amount: extracted.entities[0].price?.amount ?? 0, currency: 'USD', category: 'purchase' },
      reversible: { reversible: true, window: 'P30D', policy: 'full_refund' },
      side_effects: ['charge_card', 'email_buyer', 'decrement_stock'],
      confirmation: 'required',
    })
    .build();
});
```

---

## Recipe 10 — Self-test your AHTML implementation

**Goal:** verify your snapshots are valid before shipping.

```ts
import { validate, snapshot } from '@ahtmljs/schema';

const snap = buildMyProductSnapshot();
const issues = validate(snap);
const errors = issues.filter((i) => i.severity === 'error');
if (errors.length) {
  console.error('AHTML validation failed:', errors);
  process.exit(1);
}
console.log('AHTML snapshot valid.');
```

Wire this into your CI:

```yaml
# .github/workflows/test.yml
- run: npm test
- run: npx ahtmlc validate ./snapshots/**/*.json  # Phase 1
```

---

## Want more recipes?

Open a discussion at <https://github.com/ahtml/ahtml/discussions>. Common
patterns become first-class recipes here.

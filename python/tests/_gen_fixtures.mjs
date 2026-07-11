// Generates the Python SDK's conformance fixtures from the TS reference
// implementation (@ahtmljs/schema). Each fixture is emitted in BOTH canonical
// serializations so the Python round-trip test can assert byte-identity for
// JSON and lossless equality for compact — cross-checking two implementations.
//
//   node python/tests/_gen_fixtures.mjs
//
// Deterministic: every snapshot pins fetched_at, so regeneration is stable.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapshot, toJson, toCompact, fromCompact } from '@ahtmljs/schema';

const outDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
mkdirSync(outDir, { recursive: true });

const AT = '2026-01-01T00:00:00.000Z';
const fixtures = {};

// 1. Product page: entities + actions + policy + provenance + all compressions
//    (Money, Stock, Rating on the entity; Cost, Reversibility on the action).
fixtures.product_full = snapshot('https://shop.example.com/p/mbp-14-m3', 'product_detail')
  .fetchedAt(AT)
  .ttl(300)
  .etag('W/"f4c2"')
  .policy({ agents_welcome: true, license: 'MIT', rate_limit: '100/min', contact: 'agents@shop.example.com' })
  .provenance({ issuer: 'did:web:shop.example.com', signed: false })
  .add({
    id: 'product:mbp-14-m3',
    type: 'product',
    name: 'MacBook Pro 14" M3',
    brand: 'Apple',
    price: { amount: 1999, currency: 'USD' },
    list_price: { amount: 2199, currency: 'USD' },
    stock: { status: 'in_stock', quantity: 42 },
    rating: { average: 4.7, count: 1284 },
    sku: 'MBP14-M3-512-SB',
  })
  .action({
    id: 'purchase',
    label: 'Buy now',
    target: 'product:mbp-14-m3',
    category: 'transact',
    method: 'POST',
    execute_url: '/api/checkout',
    auth: 'required',
    cost: { amount: 1999, currency: 'USD', category: 'purchase' },
    reversible: { reversible: true, window: 'P30D', policy: 'full_refund' },
    side_effects: ['charge_card', 'email_buyer', 'decrement_stock'],
    confirmation: 'required',
  })
  .build();

// 2. Document page.
fixtures.document = snapshot('https://blog.example.com/essay', 'document')
  .fetchedAt(AT)
  .add({
    id: 'document:essay-1',
    type: 'document',
    title: 'Why Agents Need AHTML',
    author: 'Dibbayajyoti Roy',
    published_at: '2026-05-12T00:00:00.000Z',
    summary: 'A short argument.',
    word_count: 184,
    language: 'en',
    tags: ['agents', 'web'],
  })
  .build();

// 3. Empty snapshot — required arrays present but empty.
fixtures.empty = snapshot('https://example.com/', 'home').fetchedAt(AT).build();

// 4. Unicode: multi-byte content, emoji, RTL, quotes — stresses JSON escaping
//    and compact-line handling identically across implementations.
fixtures.unicode = snapshot('https://example.com/i18n', 'document')
  .fetchedAt(AT)
  .add({
    id: 'document:i18n',
    type: 'document',
    title: 'café — 日本語 — العربية — 🚀 "quoted" \\backslash\\',
    summary: 'Ünïcödé edge cases:\ttab, newline handling, and — em dash.',
  })
  .build();

// 5. Every remaining entity primitive (task, profile, dataset, conversation).
fixtures.mixed_entities = snapshot('https://app.example.com/board', 'task_list')
  .fetchedAt(AT)
  .add(
    { id: 'task:t-1', type: 'task', title: 'Ship 1.1', state: 'in_progress', priority: 'high', labels: ['release'] },
    { id: 'profile:roy', type: 'profile', name: 'Roy', kind: 'person', handle: '@roy', verified: true },
    {
      id: 'dataset:sales',
      type: 'dataset',
      name: 'Q1 Sales',
      columns: [{ key: 'date', label: 'Date', type: 'datetime' }],
      rows: [['2026-01-01']],
      row_count_total: 90,
    },
    {
      id: 'conversation:thread-1',
      type: 'conversation',
      title: 'Support',
      participants: ['profile:roy'],
      messages: [{ id: 'm1', author: 'profile:roy', posted_at: AT, content: 'hi' }],
      message_count_total: 1,
    },
  )
  .build();

const manifest = [];
for (const [name, snap] of Object.entries(fixtures)) {
  const compact = toCompact(snap);
  writeFileSync(join(outDir, `${name}.json`), toJson(snap));
  writeFileSync(join(outDir, `${name}.txt`), compact);
  // The TS compact-parser's canonical emission: nested key order legitimately
  // differs from the builder's (SPEC §1.1 rule 2 — producer order), so the
  // cross-implementation bar for parsing compact is THIS byte sequence.
  writeFileSync(join(outDir, `${name}.fromcompact.json`), toJson(fromCompact(compact)));
  manifest.push(name);
}
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`wrote ${manifest.length} fixtures (json + compact) to ${outDir}`);

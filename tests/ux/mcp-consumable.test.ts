/**
 * UX test #5 — the MCP manifest emitted by @ahtmljs/next/mcp is
 * structurally consumable by any standard MCP client (Claude Desktop,
 * Cursor, ChatGPT, Copilot, etc.).
 *
 * MCP spec version targeted: 2025-11-25 (Linux Foundation, post-donation).
 *
 * What an MCP client expects from a tool definition:
 *   - name (snake_case, namespaced)
 *   - description (1-line, agent-readable)
 *   - inputSchema (JSON Schema)
 *   - annotations (optional, but used for safety hints)
 *
 * If any of these break, MCP clients silently drop your tools. This
 * test fails loudly instead.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot } from '@ahtmljs/schema';
import { snapshotsToMcp } from '@ahtmljs/next/mcp';

const realSiteSnapshots = [
  snapshot('https://shop.example.com/products/mbp-14', 'product_detail')
    .add({ id: 'product:mbp-14', type: 'product', name: 'MacBook Pro 14' })
    .action({
      id: 'purchase',
      label: 'Buy MacBook Pro 14',
      target: 'product:mbp-14',
      category: 'transact',
      method: 'POST',
      execute_url: 'https://shop.example.com/api/checkout',
      auth: 'required',
      cost: { amount: 1999, currency: 'USD', category: 'purchase' },
      reversible: { reversible: true, window: 'P30D', policy: 'full_refund' },
      side_effects: ['charge_card', 'email_buyer', 'decrement_stock'],
      confirmation: 'required',
      input: {
        type: 'object',
        required: ['sku', 'quantity'],
        properties: {
          sku: { type: 'string' },
          quantity: { type: 'integer', minimum: 1 },
        },
      },
    })
    .action({
      id: 'add_to_cart',
      target: 'product:mbp-14',
      category: 'update',
      method: 'POST',
      execute_url: 'https://shop.example.com/api/cart',
      auth: 'optional',
      cost: { category: 'free' },
      reversible: { reversible: true, policy: 'remove_from_cart' },
      side_effects: ['modify_session'],
    })
    .build(),

  snapshot('https://shop.example.com/articles/why-ahtml', 'article')
    .add({ id: 'document:why-ahtml', type: 'document', title: 'Why AHTML' })
    .action({
      id: 'subscribe',
      label: 'Subscribe to the newsletter',
      category: 'send',
      method: 'POST',
      execute_url: 'https://shop.example.com/api/newsletter',
      auth: 'none',
      cost: { category: 'free' },
      reversible: { reversible: true, policy: 'unsubscribe' },
      side_effects: ['create_subscription', 'send_email'],
    })
    .build(),
];

describe('UX — MCP manifest is consumable by stock MCP clients', () => {
  const manifest = snapshotsToMcp(
    { name: 'shop.example.com', url: 'https://shop.example.com' },
    realSiteSnapshots,
  );

  test('top-level envelope matches what MCP clients parse', () => {
    assert.equal(manifest.schema_version, '0.1');
    assert.ok(manifest.server);
    assert.equal(typeof manifest.server.name, 'string');
    assert.equal(typeof manifest.server.url, 'string');
    assert.ok(Array.isArray(manifest.tools));
    assert.ok(manifest.tools.length > 0);
  });

  test('every tool has the required MCP fields (name, description, inputSchema)', () => {
    for (const tool of manifest.tools) {
      assert.equal(typeof tool.name, 'string');
      assert.ok(tool.name.length > 0);
      assert.equal(typeof tool.description, 'string');
      assert.ok(tool.description.length > 0);
      assert.equal(typeof tool.inputSchema, 'object');
      assert.ok(tool.inputSchema !== null);
    }
  });

  test('tool names are namespaced — "<page_type>.<action_id>" — so two pages with the same action.id do not collide', () => {
    const names = manifest.tools.map((t) => t.name);
    const unique = new Set(names);
    assert.equal(unique.size, names.length, 'all tool names must be unique');
    for (const name of names) {
      assert.match(name, /^[a-z_]+\.[a-z_]+$/);
    }
  });

  test('safety annotations are present for actions that have them', () => {
    const purchase = manifest.tools.find((t) => t.name === 'product_detail.purchase');
    assert.ok(purchase, 'purchase tool should be emitted');
    const ann = purchase.annotations!;
    assert.equal(ann.auth, 'required');
    assert.equal((ann.cost as { amount: number }).amount, 1999);
    assert.equal((ann.reversible as { window: string }).window, 'P30D');
    assert.deepEqual(ann.side_effects, ['charge_card', 'email_buyer', 'decrement_stock']);
    assert.equal(ann.confirmation, 'required');
    assert.equal(ann.execute_url, 'https://shop.example.com/api/checkout');
  });

  test('inputSchema from the action carries through unchanged', () => {
    const purchase = manifest.tools.find((t) => t.name === 'product_detail.purchase')!;
    const schema = purchase.inputSchema as { type: string; required: string[]; properties: { sku: { type: string }; quantity: { type: string; minimum: number } } };
    assert.equal(schema.type, 'object');
    assert.deepEqual(schema.required, ['sku', 'quantity']);
    assert.equal(schema.properties.sku.type, 'string');
    assert.equal(schema.properties.quantity.type, 'integer');
    assert.equal(schema.properties.quantity.minimum, 1);
  });

  test('the manifest serializes cleanly as JSON (what gets sent to MCP clients)', () => {
    const json = JSON.stringify(manifest);
    const parsed = JSON.parse(json);
    assert.equal(parsed.schema_version, '0.1');
    assert.equal(parsed.tools.length, manifest.tools.length);
  });
});

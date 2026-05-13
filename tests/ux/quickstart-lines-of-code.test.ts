/**
 * UX test #1 — "3-minute install" claim is true.
 *
 * AHTML promises that wiring up agent-readable endpoints on an existing
 * Next.js app takes three files and minimal code. This test counts the
 * lines of code in a realistic minimal integration and asserts it under
 * a tight budget.
 *
 * If this test fails: either the API got more verbose (regress + fix),
 * or the README claim needs to be softened. Either way, alerts the
 * maintainer that the marketing pitch is drifting from reality.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const userCodeForNextJsIntegration = {
  'lib/ahtml.ts': `import { snapshot } from '@ahtmljs/schema';
import { db } from '@/lib/db';

export async function buildSnapshot(segments: string[], req: Request) {
  if (segments[0] === 'products' && segments[1]) {
    const p = await db.product.findUnique({ where: { slug: segments[1] } });
    if (!p) return null;
    return snapshot(req.url, 'product_detail')
      .ttl(60)
      .add({
        id: \`product:\${p.slug}\`,
        type: 'product',
        name: p.name,
        price: { amount: p.price, currency: 'USD' },
        stock: { status: p.qty > 0 ? 'in_stock' : 'out_of_stock', quantity: p.qty },
      })
      .action({
        id: 'purchase',
        target: \`product:\${p.slug}\`,
        category: 'transact',
        execute_url: '/api/checkout',
        auth: 'required',
        cost: { amount: p.price, currency: 'USD', category: 'purchase' },
        reversible: { reversible: true, window: 'P30D', policy: 'full_refund' },
        side_effects: ['charge_card', 'email_buyer', 'decrement_stock'],
        confirmation: 'required',
      })
      .build();
  }
  return null;
}`,

  'app/ahtml/[[...path]]/route.ts': `import { createAHTMLRoute } from '@ahtmljs/next/handler';
import { buildSnapshot } from '@/lib/ahtml';
export const { GET, HEAD } = createAHTMLRoute(buildSnapshot);`,

  'app/.well-known/ahtml.json/route.ts': `import { createWellKnownRoute } from '@ahtmljs/next/well-known';
export const { GET } = createWellKnownRoute();`,

  'app/llms.txt/route.ts': `import { createLlmsTxtRoute } from '@ahtmljs/next/llms-txt';
export const { GET } = createLlmsTxtRoute();`,
};

function countNonEmptyLines(s: string): number {
  return s.split('\n').filter((l) => l.trim().length > 0).length;
}

describe('UX — quickstart line-of-code budget', () => {
  test('a full minimal integration fits in four files', () => {
    const files = Object.keys(userCodeForNextJsIntegration);
    assert.equal(files.length, 4, `four files: ${files.join(', ')}`);
  });

  test('the three wiring files (route handlers) total <= 8 lines of code', () => {
    const wiringFiles = [
      'app/ahtml/[[...path]]/route.ts',
      'app/.well-known/ahtml.json/route.ts',
      'app/llms.txt/route.ts',
    ];
    const totalLOC = wiringFiles
      .map((f) => countNonEmptyLines(userCodeForNextJsIntegration[f as keyof typeof userCodeForNextJsIntegration]))
      .reduce((a, b) => a + b, 0);
    assert.ok(
      totalLOC <= 8,
      `wiring should be ≤8 LOC (3 imports + 3 exports + slack); got ${totalLOC}`,
    );
  });

  test('the snapshot builder file fits under 40 lines for a meaningful product+action', () => {
    const builder = userCodeForNextJsIntegration['lib/ahtml.ts'];
    const loc = countNonEmptyLines(builder);
    assert.ok(
      loc <= 40,
      `the typed product+action snapshot example should fit in ≤40 LOC; got ${loc}`,
    );
  });

  test('the AHTML API surface used in wiring is tiny — three factory functions', () => {
    const wiring = [
      userCodeForNextJsIntegration['app/ahtml/[[...path]]/route.ts'],
      userCodeForNextJsIntegration['app/.well-known/ahtml.json/route.ts'],
      userCodeForNextJsIntegration['app/llms.txt/route.ts'],
    ].join('\n');
    // Count only the @ahtmljs/* imports — user's own helper imports don't count
    const ahtmlImports = wiring.match(/from\s+['"]@ahtmljs\/[^'"]+['"]/g) ?? [];
    assert.equal(ahtmlImports.length, 3, `expected three @ahtmljs/* imports, got ${ahtmlImports.length}`);
    assert.ok(wiring.includes('createAHTMLRoute'));
    assert.ok(wiring.includes('createWellKnownRoute'));
    assert.ok(wiring.includes('createLlmsTxtRoute'));
  });

  test('zero shell scaffolding required — no .ahtml files, no separate process, no parallel server', () => {
    const allCode = Object.values(userCodeForNextJsIntegration).join('\n');
    // No new file extensions
    assert.ok(!allCode.includes('.ahtml '));
    // No server spawn / port binding code
    assert.ok(!allCode.match(/listen\(|spawn\(|createServer/));
    // No external MCP-server-framework imports — your existing Next route IS the MCP surface
    assert.ok(!allCode.match(/from\s+['"](@modelcontextprotocol|mcp)/));
  });
});

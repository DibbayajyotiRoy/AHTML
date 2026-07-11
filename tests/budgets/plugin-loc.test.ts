/**
 * TASKS.md T1.5 budget — the third-party plugin example proves the plugin
 * API is sufficient: under 100 LOC and imports ONLY from @ahtmljs/extract
 * (no adapter packages, no schema internals). Budgets exist only if a test
 * enforces them (the Hono lesson, ROADMAP.md standing rule 1).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const pluginPath = resolve(repoRoot, 'examples/recipe-plugin/src/recipe-plugin.ts');
const source = readFileSync(pluginPath, 'utf8');

describe('recipe plugin budget (T1.5)', () => {
  test('under 100 LOC (non-blank, non-comment)', () => {
    let inBlockComment = false;
    const loc = source.split('\n').filter((raw) => {
      const line = raw.trim();
      if (!line) return false;
      if (inBlockComment) {
        if (line.includes('*/')) inBlockComment = false;
        return false;
      }
      if (line.startsWith('/*')) {
        if (!line.includes('*/')) inBlockComment = true;
        return false;
      }
      return !line.startsWith('//') && !line.startsWith('*');
    }).length;
    assert.ok(loc < 100, `recipe-plugin.ts is ${loc} LOC — the <100 LOC proof budget is broken`);
  });

  test('imports only @ahtmljs/extract', () => {
    const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!);
    assert.ok(imports.length > 0, 'plugin must import something');
    const offenders = imports.filter((i) => i !== '@ahtmljs/extract');
    assert.deepEqual(
      offenders,
      [],
      `plugin may import only @ahtmljs/extract, found: ${offenders.join(', ')}`,
    );
  });
});

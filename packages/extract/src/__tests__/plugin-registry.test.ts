/**
 * TASKS.md T1.2 — plugin registry: deterministic priority ordering, and
 * equal priority / duplicate name are hard errors.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { definePlugin, createExtractor, pageFromHtml, builtinPlugins } from '../index.js';
import type { Extraction } from '../index.js';

const PAGE = pageFromHtml('https://example.com/', '<html><body>x</body></html>');

function stub(name: string, priority: number, extraction?: Partial<Extraction>) {
  return definePlugin({
    name,
    priority,
    match: () => true,
    extract: () => ({ source: 'route-metadata', entities: [], actions: [], ...extraction }) as Extraction,
  });
}

describe('plugin registry (T1.2)', () => {
  test('definePlugin validates shape', () => {
    assert.throws(() => definePlugin({ name: '', priority: 1, match: () => true, extract: () => null }), /name/);
    assert.throws(() => definePlugin({ name: 'x', priority: NaN, match: () => true, extract: () => null }), /priority/);
    // @ts-expect-error deliberate contract violation
    assert.throws(() => definePlugin({ name: 'x', priority: 1, match: true, extract: () => null }), /functions/);
  });

  test('two plugins matching the same page apply in priority order', () => {
    const high = stub('high', 500, { page_type: 'product_detail' });
    const low = stub('low', 50, { page_type: 'article' });
    // Registration order deliberately inverted from priority order.
    const extractor = createExtractor({ builtins: false, plugins: [low, high] });
    assert.deepEqual(
      extractor.plugins.map((p) => p.name),
      ['high', 'low'],
      'execution order must be descending priority, not registration order',
    );
    // mergeExtractions gives the first (highest-priority) extraction the win.
    assert.equal(extractor.extract(PAGE).page_type, 'product_detail');
  });

  test('equal priority is a hard error', () => {
    assert.throws(
      () => createExtractor({ builtins: false, plugins: [stub('a', 250), stub('b', 250)] }),
      /share priority 250/,
    );
    // Colliding with a built-in priority is equally fatal.
    assert.throws(() => createExtractor({ plugins: [stub('clash', 400)] }), /share priority 400/);
  });

  test('duplicate plugin name is a hard error', () => {
    assert.throws(
      () => createExtractor({ builtins: false, plugins: [stub('dup', 1), stub('dup', 2)] }),
      /duplicate plugin name "dup"/,
    );
  });

  test('builtins register in canonical precedence order', () => {
    const extractor = createExtractor();
    assert.deepEqual(
      extractor.plugins.map((p) => p.name),
      ['data-attrs', 'schema-org', 'microdata', 'opengraph'],
    );
    assert.equal(builtinPlugins.length, 4);
  });

  test('non-matching plugins are skipped without running extract', () => {
    let ran = false;
    const never = definePlugin({
      name: 'never',
      priority: 999,
      match: () => false,
      extract: () => {
        ran = true;
        return null;
      },
    });
    createExtractor({ builtins: false, plugins: [never] }).extract(PAGE);
    assert.equal(ran, false);
  });
});

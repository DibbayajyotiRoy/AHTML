/**
 * TASKS.md T1.5 e2e — the third-party recipe plugin extracts a fixture page
 * correctly through the standard pipeline, beating the generic built-ins.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createExtractor, pageFromHtml } from '@ahtmljs/extract';
import { recipePlugin } from '../recipe-plugin.js';

const FIXTURE = `<!doctype html>
<html>
<head>
  <meta property="og:title" content="Grandma's Shakshuka — FoodSite">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Recipe",
    "name": "Grandma's Shakshuka",
    "description": "Eggs poached in spiced tomato sauce.",
    "datePublished": "2026-03-01",
    "author": { "@type": "Person", "name": "Grandma" },
    "recipeCategory": "Breakfast",
    "recipeIngredient": ["6 eggs", "800g crushed tomatoes", "1 tsp cumin"],
    "recipeInstructions": [
      { "@type": "HowToStep", "text": "Simmer the tomatoes with cumin." },
      { "@type": "HowToStep", "text": "Crack in the eggs and cover." }
    ]
  }
  </script>
</head>
<body><h1>Grandma's Shakshuka</h1></body>
</html>`;

describe('recipe plugin (T1.5)', () => {
  const extractor = createExtractor({ plugins: [recipePlugin] });
  const result = extractor.extract(pageFromHtml('https://food.example.com/shakshuka', FIXTURE));

  test('extracts the recipe as a document entity', () => {
    const doc = result.entities.find((e) => e.id === 'document:recipe-grandma-s-shakshuka');
    assert.ok(doc, `expected recipe document, got ids: ${result.entities.map((e) => e.id).join(', ')}`);
    assert.equal(doc!.type, 'document');
    const d = doc as { title?: string; author?: string; summary?: string; content?: string; tags?: string[]; published_at?: string };
    assert.equal(d.title, "Grandma's Shakshuka");
    assert.equal(d.author, 'Grandma');
    assert.equal(d.summary, 'Eggs poached in spiced tomato sauce.');
    assert.equal(d.published_at, '2026-03-01');
    assert.deepEqual(d.tags, ['recipe', 'breakfast']);
    assert.match(d.content!, /## Ingredients\n- 6 eggs\n- 800g crushed tomatoes\n- 1 tsp cumin/);
    assert.match(d.content!, /## Instructions\n1\. Simmer the tomatoes with cumin\.\n2\. Crack in the eggs and cover\./);
  });

  test('coexists with built-ins without priority collision', () => {
    assert.equal(extractor.plugins[0]!.name, 'schema-org-recipe');
    assert.equal(extractor.plugins.length, 5);
  });

  test('yields nothing on non-recipe pages', () => {
    const empty = extractor.extract(
      pageFromHtml('https://food.example.com/about', '<html><body>About us</body></html>'),
    );
    assert.equal(empty.entities.length, 0);
  });
});

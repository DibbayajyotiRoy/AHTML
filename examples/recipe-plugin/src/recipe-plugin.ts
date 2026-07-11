/**
 * A third-party domain extractor: schema.org/Recipe JSON-LD → AHTML document.
 *
 * This is the proof for ADR-0002 / ROADMAP Feature 2: a community plugin
 * needs only @ahtmljs/extract — no adapter package, no schema internals —
 * and stays under 100 LOC (enforced by tests/budgets/plugin-loc.test.ts).
 */
import { definePlugin, type Extraction } from '@ahtmljs/extract';

type Json = Record<string, unknown>;

function blocks(html: string): Json[] {
  const out: Json[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1]!) as unknown;
      for (const node of Array.isArray(parsed) ? parsed : [parsed]) {
        if (node && typeof node === 'object') out.push(node as Json);
      }
    } catch {
      // malformed JSON-LD block — skip
    }
  }
  return out;
}

function text(v: unknown): string | undefined {
  if (typeof v === 'string' && v.trim()) return v.trim();
  return undefined;
}

function list(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => text(typeof x === 'object' && x ? (x as Json).text : x)).filter((s): s is string => !!s);
  const single = text(v);
  return single ? [single] : [];
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'recipe';
}

export const recipePlugin = definePlugin({
  name: 'schema-org-recipe',
  // >400: community plugins beat built-ins, so the generic schema-org
  // extractor's weaker Article/Product reading of the same block loses.
  priority: 450,
  match: (page) => page.html.includes('application/ld+json') && /"Recipe"/.test(page.html),
  extract: (page): Extraction | null => {
    const entities: Extraction['entities'] = [];
    for (const node of blocks(page.html)) {
      const type = node['@type'];
      const isRecipe = type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'));
      if (!isRecipe) continue;
      const name = text(node.name) ?? 'Untitled recipe';
      const ingredients = list(node.recipeIngredient);
      const steps = list(node.recipeInstructions);
      const content = [
        '## Ingredients',
        ...ingredients.map((i) => `- ${i}`),
        '',
        '## Instructions',
        ...steps.map((s, i) => `${i + 1}. ${s}`),
      ].join('\n');
      const author = node.author as Json | string | undefined;
      entities.push({
        id: `document:recipe-${slug(name)}`,
        type: 'document',
        title: name,
        ...(text(node.description) && { summary: text(node.description) }),
        ...(text(node.datePublished) && { published_at: text(node.datePublished) }),
        ...(author && { author: typeof author === 'string' ? author : text(author.name) ?? '' }),
        content,
        tags: ['recipe', ...list(node.recipeCategory).map((c) => c.toLowerCase())],
      });
    }
    return entities.length ? { source: 'schema-org', entities, actions: [] } : null;
  },
});

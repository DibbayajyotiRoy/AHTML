# Extractor plugins — `@ahtmljs/extract`

`@ahtmljs/extract` is the framework-neutral extraction pipeline behind every
AHTML adapter. It turns a rendered page into typed entities and actions, and
it is the extension point for two audiences:

- **Framework authors** — build an adapter (Astro, SvelteKit, …) on the same
  pipeline Next uses, instead of forking extraction logic.
- **Domain extractor authors** — teach AHTML a vocabulary the built-ins don't
  know (recipes, job postings, event listings) in one small plugin.

> **Stability:** the plugin contract is `@experimental` for one minor release
> (ADR-0002) while the Astro and SvelteKit adapters validate the page model.
> The extractor functions themselves (`extractFromSchemaOrg`, …) are stable
> 1.0 API re-exported from `@ahtmljs/schema/extract`.

## The page model

Every plugin sees the same input, whatever the framework:

```ts
import type { PageModel } from '@ahtmljs/extract';

// {
//   url: string;        // canonical, absolute
//   html: string;       // fully rendered markup — no live DOM, ever
//   headers?: Record<string, string>;   // lowercase names
//   route?: { path: string; page_type?: PageType; params?: … };
//   framework?: string; // "next" | "astro" | … — hint only
// }
```

Invariants worth knowing:

- Plugins run in Node, workers, and edge runtimes. There is no `document`
  global — parse `html` as a string.
- `route` is what the adapter knows statically. Prefer evidence in `html`;
  use `route.page_type` only as a fallback (the pipeline already applies it
  when no plugin infers a page type).
- Built-in plugins never read `framework`. Yours shouldn't either unless it
  genuinely must.

## The plugin contract

```ts
import { definePlugin } from '@ahtmljs/extract';

const myPlugin = definePlugin({
  name: 'my-domain',      // unique within a pipeline
  priority: 450,          // higher = runs earlier = wins merge conflicts
  match: (page) => page.html.includes('application/ld+json'),
  extract: (page) => ({ source: 'schema-org', entities: [...], actions: [] }),
});
```

- `match` is a cheap predicate; return `false` and `extract` never runs.
- `extract` returns an `Extraction` (`{ source, page_type?, entities, actions }`)
  or `null` when the page yields nothing.
- **Priority bands:** built-ins occupy 100–400
  (`data-attrs` 400 › `schema-org` 300 › `microdata` 200 › `opengraph` 100).
  Use **> 400** to override built-ins, **< 100** to act as a fallback.
- Duplicate names and *equal priorities are hard errors* at
  `createExtractor()` time — silent tie-breaking is how adapter output drifts.

## Running a pipeline

```ts
import { createExtractor, pageFromHtml } from '@ahtmljs/extract';

const extractor = createExtractor({ plugins: [myPlugin] }); // + built-ins
const extraction = extractor.extract(
  pageFromHtml('https://shop.example.com/p/bottle', html),
);
// extraction.entities / extraction.actions / extraction.page_type
```

Results from every matching plugin are merged with `mergeExtractions`
semantics: the highest-priority plugin wins field-level conflicts, while
fields only a lower-priority plugin found still survive.

Pass `builtins: false` to run only your plugins.

## Worked example — a schema.org Recipe plugin

The repo ships a complete third-party plugin in
[`examples/recipe-plugin`](../examples/recipe-plugin/src/recipe-plugin.ts):
schema.org `Recipe` JSON-LD → an AHTML `document` entity with the
ingredients and steps as markdown content. It is the proof of the contract's
sufficiency, so it is held to two CI budgets
(`tests/budgets/plugin-loc.test.ts`):

1. **Under 100 lines of code.**
2. **Imports only `@ahtmljs/extract`** — no adapter package, no internals.

The shape to copy:

```ts
import { definePlugin, type Extraction } from '@ahtmljs/extract';

export const recipePlugin = definePlugin({
  name: 'schema-org-recipe',
  priority: 450, // beat the generic schema-org built-in for Recipe blocks
  match: (page) =>
    page.html.includes('application/ld+json') && /"Recipe"/.test(page.html),
  extract: (page): Extraction | null => {
    const entities: Extraction['entities'] = [];
    // …parse JSON-LD blocks, map Recipe → document entity…
    return entities.length ? { source: 'schema-org', entities, actions: [] } : null;
  },
});
```

And using it in an adapter or script:

```ts
import { createExtractor, pageFromHtml } from '@ahtmljs/extract';
import { recipePlugin } from './recipe-plugin.js';

const extraction = createExtractor({ plugins: [recipePlugin] })
  .extract(pageFromHtml(url, html));
```

## For adapter authors

Adapters should not reimplement extraction. Build the page model from your
framework's render output and hand it to a pipeline the user can extend:

```ts
import { createExtractor, type ExtractorPlugin } from '@ahtmljs/extract';

export function ahtml(options: { plugins?: ExtractorPlugin[] } = {}) {
  const extractor = createExtractor({ plugins: options.plugins });
  // wire extractor.extract(...) into your framework's request pipeline
}
```

`@ahtmljs/next` consumes the same package — its `@ahtmljs/next/extractors`
subpath is now a re-export of `@ahtmljs/extract`, unchanged for existing
users (the 1.0 freeze holds).

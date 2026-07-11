import {
  extractFromDataAttrs,
  extractFromSchemaOrg,
  extractFromMicrodata,
  extractFromOpenGraph,
} from '@ahtmljs/schema/extract';
import { definePlugin } from './plugin.js';
import type { ExtractorPlugin } from './plugin.js';

/**
 * The universal extractors as plugins. Priorities encode the canonical
 * merge precedence used everywhere since 0.9 (cli extract/benchmark/score):
 * data-attrs > schema.org JSON-LD > microdata > OpenGraph.
 *
 * Built-in priorities live in the 100–400 range; community plugins should
 * use >400 to override built-ins or <100 to act as fallbacks.
 */
export const dataAttrsPlugin: ExtractorPlugin = definePlugin({
  name: 'data-attrs',
  priority: 400,
  match: (page) => page.html.includes('data-ahtml'),
  extract: (page) => extractFromDataAttrs(page.html),
});

export const schemaOrgPlugin: ExtractorPlugin = definePlugin({
  name: 'schema-org',
  priority: 300,
  match: (page) => page.html.includes('application/ld+json'),
  extract: (page) => extractFromSchemaOrg(page.html),
});

export const microdataPlugin: ExtractorPlugin = definePlugin({
  name: 'microdata',
  priority: 200,
  match: (page) => page.html.includes('itemscope'),
  extract: (page) => extractFromMicrodata(page.html),
});

export const openGraphPlugin: ExtractorPlugin = definePlugin({
  name: 'opengraph',
  priority: 100,
  match: (page) => /property=["']og:/i.test(page.html),
  extract: (page) => extractFromOpenGraph(page.html),
});

export const builtinPlugins: readonly ExtractorPlugin[] = [
  dataAttrsPlugin,
  schemaOrgPlugin,
  microdataPlugin,
  openGraphPlugin,
];

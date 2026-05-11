/**
 * Auto-extractors.
 *
 * Run a developer's existing HTML through these to produce a Level-0
 * snapshot with no annotation work. Combined output of multiple
 * extractors wins by precedence: data-attrs > schema.org > OpenGraph.
 */

export { extractFromSchemaOrg } from './schema-org.js';
export { extractFromOpenGraph } from './opengraph.js';
export { extractFromDataAttrs } from './data-attrs.js';
export { mergeExtractions, type Extraction } from './merge.js';

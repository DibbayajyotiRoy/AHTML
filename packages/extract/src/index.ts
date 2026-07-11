/**
 * @ahtmljs/extract — public API.
 *
 * Framework-neutral extractor pipeline (ADR-0002). The plugin contract is
 * `@experimental` for one minor release; the universal extractors re-exported
 * below are stable (they are the same functions `@ahtmljs/schema/extract`
 * has shipped since 0.9).
 */
export { type PageModel, pageFromHtml } from './page-model.js';
export { type ExtractorPlugin, definePlugin } from './plugin.js';
export {
  createExtractor,
  type Extractor,
  type ExtractorOptions,
} from './pipeline.js';
export {
  builtinPlugins,
  dataAttrsPlugin,
  schemaOrgPlugin,
  microdataPlugin,
  openGraphPlugin,
} from './builtins.js';

// Universal extractor primitives, re-exported so adapters and the CLI can
// depend on @ahtmljs/extract alone.
export {
  extractFromDataAttrs,
  extractFromSchemaOrg,
  extractFromMicrodata,
  extractFromOpenGraph,
  mergeExtractions,
  type Extraction,
} from '@ahtmljs/schema/extract';

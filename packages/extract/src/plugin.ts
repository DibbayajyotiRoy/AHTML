import type { Extraction } from '@ahtmljs/schema/extract';
import type { PageModel } from './page-model.js';

/**
 * An extractor plugin (ADR-0002). `@experimental` for one minor release —
 * the contract freezes after the Astro and SvelteKit adapters validate it.
 *
 * Precedence: plugins run in DESCENDING `priority` order and their
 * extractions merge with earlier-run (higher-priority) fields winning on
 * conflict — the `mergeExtractions` rule. Two registered plugins with equal
 * priority are a configuration error: silent tie-breaking is exactly the
 * kind of cross-adapter drift the 0.9 audit paid for.
 */
export interface ExtractorPlugin {
  /** Unique within a pipeline; used in error messages and provenance. */
  name: string;
  /** Higher priority = earlier run = wins merge conflicts. */
  priority: number;
  /** Cheap predicate — return false to skip `extract` for this page. */
  match(page: PageModel): boolean;
  /** Produce an extraction, or null when the page yields nothing. */
  extract(page: PageModel): Extraction | null;
}

/** Identity helper that validates the plugin shape at definition time. */
export function definePlugin(plugin: ExtractorPlugin): ExtractorPlugin {
  if (!plugin.name || typeof plugin.name !== 'string') {
    throw new TypeError('definePlugin: plugin.name must be a non-empty string');
  }
  if (!Number.isFinite(plugin.priority)) {
    throw new TypeError(`definePlugin(${plugin.name}): priority must be a finite number`);
  }
  if (typeof plugin.match !== 'function' || typeof plugin.extract !== 'function') {
    throw new TypeError(`definePlugin(${plugin.name}): match and extract must be functions`);
  }
  return plugin;
}

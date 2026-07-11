import { mergeExtractions } from '@ahtmljs/schema/extract';
import type { Extraction } from '@ahtmljs/schema/extract';
import type { PageModel } from './page-model.js';
import type { ExtractorPlugin } from './plugin.js';
import { builtinPlugins } from './builtins.js';

export interface ExtractorOptions {
  /** Additional plugins, merged with the built-ins by priority. */
  plugins?: ExtractorPlugin[];
  /** Set false to run ONLY the plugins passed in `plugins`. Default true. */
  builtins?: boolean;
}

export interface Extractor {
  /** Plugins in execution (descending-priority) order. */
  readonly plugins: readonly ExtractorPlugin[];
  /** Run every matching plugin over the page and merge the results. */
  extract(page: PageModel): Extraction;
}

/**
 * Assemble an extraction pipeline. Registration-time errors are loud:
 * duplicate names and equal priorities both throw, because both produce
 * order-dependent output that differs silently between adapters.
 */
export function createExtractor(options: ExtractorOptions = {}): Extractor {
  const plugins = [
    ...(options.builtins === false ? [] : builtinPlugins),
    ...(options.plugins ?? []),
  ];

  const byName = new Map<string, ExtractorPlugin>();
  const byPriority = new Map<number, ExtractorPlugin>();
  for (const p of plugins) {
    const nameClash = byName.get(p.name);
    if (nameClash) {
      throw new Error(`createExtractor: duplicate plugin name "${p.name}"`);
    }
    byName.set(p.name, p);
    const priorityClash = byPriority.get(p.priority);
    if (priorityClash) {
      throw new Error(
        `createExtractor: plugins "${priorityClash.name}" and "${p.name}" share priority ` +
          `${p.priority} — merge precedence would be registration-order-dependent. ` +
          'Assign distinct priorities (built-ins use 100–400).',
      );
    }
    byPriority.set(p.priority, p);
  }

  const ordered = [...plugins].sort((a, b) => b.priority - a.priority);

  return {
    plugins: ordered,
    extract(page: PageModel): Extraction {
      const extractions: Extraction[] = [];
      for (const plugin of ordered) {
        if (!plugin.match(page)) continue;
        const result = plugin.extract(page);
        if (result) extractions.push(result);
      }
      // mergeExtractions gives earlier entries precedence, and `ordered`
      // is already highest-priority-first.
      const merged = mergeExtractions(extractions);
      if (!merged.page_type && page.route?.page_type) {
        merged.page_type = page.route.page_type;
      }
      return merged;
    },
  };
}

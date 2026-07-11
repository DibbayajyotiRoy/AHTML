import type { Snapshot } from '@ahtmljs/schema';

/**
 * The framework-neutral input to every extractor plugin.
 *
 * Invariants (ADR-0002):
 * - `url` is the canonical URL of the page — the same value the resulting
 *   snapshot's `url` field will carry. Always absolute.
 * - `html` is the fully rendered markup as a string. SSR frameworks pass
 *   their render output; static hosts pass the file contents. Plugins MUST
 *   NOT assume a live DOM — this package runs in Node, workers, and edge
 *   runtimes with no `document` global.
 * - `headers`, when present, uses lowercase header names.
 * - `route` carries what the *adapter* knows statically (declared path
 *   pattern, page_type from route config). Plugins should prefer evidence
 *   found in `html` and use `route` only as a fallback hint.
 * - `framework` is a free-form tag ("next", "astro", …) for plugins that
 *   genuinely need framework-specific behavior. Built-ins never read it.
 */
export interface PageModel {
  url: string;
  html: string;
  headers?: Record<string, string>;
  route?: {
    path: string;
    page_type?: Snapshot['page_type'];
    params?: Record<string, string>;
  };
  framework?: string;
}

/** Build a PageModel from the two universally available inputs. */
export function pageFromHtml(
  url: string,
  html: string,
  extras: Omit<PageModel, 'url' | 'html'> = {},
): PageModel {
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    throw new Error(`PageModel.url must be absolute, got "${url}"`);
  }
  return { url, html, ...extras };
}

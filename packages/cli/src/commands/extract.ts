/**
 * `ahtml extract <url>` — fetch any URL and extract structured entities.
 *
 * Runs all 4 extractors, merges them, builds an AHTML snapshot, and prints
 * the compact representation. Use --json for machine-readable output.
 */

import {
  snapshot,
  toCompact,
  toJson,
} from '@ahtmljs/schema';
import {
  extractFromSchemaOrg,
  extractFromOpenGraph,
  extractFromDataAttrs,
  extractFromMicrodata,
  mergeExtractions,
  type Extraction,
} from '@ahtmljs/extract';
import { fetchHtml } from '../fetch.js';

/** Minimal ANSI helpers — intentionally not imported from cli.ts. */
const USE_COLOR =
  typeof process !== 'undefined' &&
  process.stdout.isTTY === true &&
  !process.env.NO_COLOR;

function c(text: string, code: string): string {
  return USE_COLOR ? `\x1b[${code}m${text}\x1b[0m` : text;
}
const bold = (t: string) => c(t, '1');
const dim  = (t: string) => c(t, '2');
const cyan = (t: string) => c(t, '36');

export async function runExtract(url: string, flags: { json?: boolean } = {}): Promise<number> {
  let html: string;
  try {
    html = await fetchHtml(url);
  } catch (err) {
    process.stderr.write(`error: could not fetch ${url} — ${(err as Error)?.message ?? String(err)}\n`);
    return 1;
  }

  const schemaOrg = extractFromSchemaOrg(html);
  const openGraph = extractFromOpenGraph(html);
  const dataAttrs = extractFromDataAttrs(html);
  const microdata = extractFromMicrodata(html);

  // Merge in precedence order: data-attrs > schema-org > microdata > opengraph
  const merged = mergeExtractions([dataAttrs, schemaOrg, microdata, openGraph]);

  // Build snapshot
  const pageType = (merged.page_type as Parameters<typeof snapshot>[1]) ?? 'generic';
  let builder = snapshot(url, pageType);
  for (const entity of merged.entities) {
    builder = builder.add(entity);
  }
  for (const action of merged.actions) {
    builder = builder.action(action);
  }
  const snap = builder.build();

  if (flags.json) {
    process.stdout.write(toJson(snap) + '\n');
    return 0;
  }

  const HR = '─'.repeat(45);

  process.stdout.write(bold(`AHTML extract — ${url}`) + '\n');
  process.stdout.write(dim(HR) + '\n');
  process.stdout.write(`${'Extractor'.padEnd(14)}  source\n`);
  process.stdout.write(dim(HR) + '\n');

  const rows: Array<{ label: string; ex: Extraction }> = [
    { label: 'schema-org', ex: schemaOrg },
    { label: 'opengraph',  ex: openGraph },
    { label: 'data-attrs', ex: dataAttrs },
    { label: 'microdata',  ex: microdata },
  ];

  for (const { label, ex } of rows) {
    const count = ex.entities.length;
    if (count === 0) {
      process.stdout.write(`${cyan(label.padEnd(14))}  ${dim(`0 entities`)}\n`);
    } else {
      // Summarize by entity type
      const byType = new Map<string, number>();
      for (const e of ex.entities) {
        byType.set(e.type, (byType.get(e.type) ?? 0) + 1);
      }
      const summary = [...byType.entries()].map(([t, n]) => `${n} ${capitalize(t)}`).join(', ');
      process.stdout.write(`${cyan(label.padEnd(14))}  ${count} entit${count === 1 ? 'y' : 'ies'} (${summary})\n`);
    }
  }

  process.stdout.write(dim(HR) + '\n');
  process.stdout.write(
    `${bold('Merged'.padEnd(14))}  ${merged.entities.length} entit${merged.entities.length === 1 ? 'y' : 'ies'}, ${merged.actions.length} action${merged.actions.length === 1 ? '' : 's'}\n`,
  );
  process.stdout.write(dim(HR) + '\n');

  const compact = toCompact(snap);
  process.stdout.write('\n' + compact + '\n');

  return 0;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

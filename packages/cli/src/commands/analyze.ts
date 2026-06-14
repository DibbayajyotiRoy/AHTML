/**
 * `ahtml analyze <url>` — headline command.
 *
 * Runs extract + score + token measurement in one pass. Shows token savings,
 * entity counts, and a quick agent-readiness probe.
 */

import {
  snapshot,
  toCompact,
} from '@ahtmljs/schema';
import {
  extractFromSchemaOrg,
  extractFromOpenGraph,
  extractFromDataAttrs,
  extractFromMicrodata,
  mergeExtractions,
} from '@ahtmljs/schema/extract';
import { fetchHtml, headOk } from '../fetch.js';

const USE_COLOR =
  typeof process !== 'undefined' &&
  process.stdout.isTTY === true &&
  !process.env.NO_COLOR;

function c(text: string, code: string): string {
  return USE_COLOR ? `\x1b[${code}m${text}\x1b[0m` : text;
}
const bold   = (t: string) => c(t, '1');
const dim    = (t: string) => c(t, '2');
const green  = (t: string) => c(t, '32');
const yellow = (t: string) => c(t, '33');
const red    = (t: string) => c(t, '31');
const cyan   = (t: string) => c(t, '36');

/** Rough token estimate: 4 chars per token. Honest "(est.)" to caller. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function fmtBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  return `${bytes} B`;
}

export async function runAnalyze(url: string): Promise<number> {
  let html: string;
  try {
    html = await fetchHtml(url);
  } catch (err) {
    process.stderr.write(`error: could not fetch ${url} — ${(err as Error)?.message ?? String(err)}\n`);
    return 1;
  }

  // Token / byte measurements for raw HTML
  const htmlBytes = Buffer.byteLength(html, 'utf8');
  const htmlTokens = estimateTokens(html);

  // Run extractors
  const schemaOrg = extractFromSchemaOrg(html);
  const openGraph = extractFromOpenGraph(html);
  const dataAttrs = extractFromDataAttrs(html);
  const microdata = extractFromMicrodata(html);

  const merged = mergeExtractions([dataAttrs, schemaOrg, microdata, openGraph]);

  // Build snapshot + compact
  const pageType = (merged.page_type as Parameters<typeof snapshot>[1]) ?? 'generic';
  let builder = snapshot(url, pageType);
  for (const entity of merged.entities) builder = builder.add(entity);
  for (const action of merged.actions) builder = builder.action(action);
  const snap = builder.build();
  const compact = toCompact(snap);

  const compactBytes = Buffer.byteLength(compact, 'utf8');
  const compactTokens = estimateTokens(compact);

  const savedTokens = htmlTokens - compactTokens;
  const savingsPct = htmlTokens > 0 ? ((savedTokens / htmlTokens) * 100).toFixed(1) : '0.0';

  // Quick agent-readiness probes
  const hasJsonLd = /<script[^>]*type=["']application\/ld\+json["'][^>]*>/i.test(html);
  const origin = new URL(url).origin;
  const [llmsTxtOk, ahtmlOk] = await Promise.all([
    headOk(`${origin}/llms.txt`),
    headOk(`${origin}/.well-known/ahtml.json`),
  ]);

  // Entity counts by type
  const byType = new Map<string, number>();
  for (const e of merged.entities) {
    byType.set(e.type, (byType.get(e.type) ?? 0) + 1);
  }

  // ── Output ─────────────────────────────────────────────────────────────────
  process.stdout.write(bold(`AHTML analyze — ${url}`) + '\n\n');

  const labelW = 24;
  const valW   = 10;

  process.stdout.write(
    `${'Source HTML'.padEnd(labelW)} ${fmtBytes(htmlBytes).padStart(valW)}  ${dim(`(${htmlTokens.toLocaleString()} tokens est.)`)}\n`,
  );
  process.stdout.write(
    `${'Structured extract'.padEnd(labelW)} ${fmtBytes(compactBytes).padStart(valW)}  ${dim(`(${compactTokens.toLocaleString()} tokens est.)`)}\n`,
  );
  process.stdout.write('\n');
  process.stdout.write(
    `${bold('Token savings').padEnd(labelW)} ${`${savingsPct} %`.padStart(valW)}  ${dim(`(${savedTokens.toLocaleString()} tokens → LLM)`)}\n`,
  );
  process.stdout.write('\n');

  if (byType.size > 0) {
    process.stdout.write(`${bold('Entities found')}\n`);
    for (const [type, count] of byType) {
      process.stdout.write(`  ${count} ${type}${count !== 1 ? 's' : ''}\n`);
    }
    process.stdout.write('\n');
  } else {
    process.stdout.write(`${dim('No entities extracted from this page.')}\n\n`);
  }

  process.stdout.write(`${bold('Agent-readiness')}\n`);
  process.stdout.write(`  ${hasJsonLd ? green('✓') : red('✗')} JSON-LD ${hasJsonLd ? 'present' : 'not found'}\n`);
  process.stdout.write(`  ${llmsTxtOk ? green('✓') : yellow('⚠')} llms.txt ${llmsTxtOk ? 'found' : 'missing'}\n`);
  process.stdout.write(`  ${ahtmlOk ? green('✓') : red('✗')} AHTML endpoint ${ahtmlOk ? 'found' : 'not found'}\n`);
  process.stdout.write('\n');

  process.stdout.write(`${cyan('→')} Run ${bold(`ahtml score ${url}`)} for the full grade + fix checklist\n`);

  return 0;
}

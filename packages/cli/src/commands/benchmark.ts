/**
 * `ahtml benchmark <url>` — format comparison table.
 *
 * Shows how much each format costs in tokens: raw HTML vs JSON-LD extract vs
 * AHTML compact vs AHTML JSON. Token estimates use Math.ceil(text.length / 4).
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
} from '@ahtmljs/schema/extract';
import { fetchHtml } from '../fetch.js';

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

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function fmtBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  return `${bytes} B`;
}

function diffPct(base: number, current: number): string {
  if (base === 0) return '—';
  const pct = ((current - base) / base) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

/**
 * Extract only the raw text content of JSON-LD <script> blocks, concatenated.
 */
function extractJsonLdText(html: string): string {
  const blocks: string[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    blocks.push(m[1]!.trim());
  }
  return blocks.join('\n');
}

export async function runBenchmark(url: string): Promise<number> {
  let html: string;
  try {
    html = await fetchHtml(url);
  } catch (err) {
    process.stderr.write(`error: could not fetch ${url} — ${(err as Error)?.message ?? String(err)}\n`);
    return 1;
  }

  // Raw HTML metrics
  const htmlBytes  = Buffer.byteLength(html, 'utf8');
  const htmlTokens = estimateTokens(html);

  // JSON-LD extract (raw blocks only)
  const jsonLdText   = extractJsonLdText(html);
  const jsonLdBytes  = Buffer.byteLength(jsonLdText, 'utf8');
  const jsonLdTokens = estimateTokens(jsonLdText);

  // AHTML extraction + snapshot
  const schemaOrg = extractFromSchemaOrg(html);
  const openGraph = extractFromOpenGraph(html);
  const dataAttrs = extractFromDataAttrs(html);
  const microdata = extractFromMicrodata(html);
  const merged    = mergeExtractions([dataAttrs, schemaOrg, microdata, openGraph]);

  const pageType = (merged.page_type as Parameters<typeof snapshot>[1]) ?? 'generic';
  let builder = snapshot(url, pageType);
  for (const entity of merged.entities) builder = builder.add(entity);
  for (const action of merged.actions) builder = builder.action(action);
  const snap = builder.build();

  const compactText   = toCompact(snap);
  const compactBytes  = Buffer.byteLength(compactText, 'utf8');
  const compactTokens = estimateTokens(compactText);

  const jsonText   = toJson(snap);
  const jsonBytes  = Buffer.byteLength(jsonText, 'utf8');
  const jsonTokens = estimateTokens(jsonText);

  // ── Output ─────────────────────────────────────────────────────────────────
  process.stdout.write(bold(`AHTML benchmark — ${url}`) + '\n\n');

  const HR = '─'.repeat(57);
  const col1 = 20;
  const col2 = 10;
  const col3 = 16;
  const col4 = 12;

  process.stdout.write(
    `${'Format'.padEnd(col1)} ${'Size'.padStart(col2)}  ${'Tokens (est.)'.padStart(col3)}  ${'vs raw HTML'.padStart(col4)}\n`,
  );
  process.stdout.write(dim(HR) + '\n');

  const rows: Array<{ label: string; bytes: number; tokens: number }> = [
    { label: 'Raw HTML',        bytes: htmlBytes,    tokens: htmlTokens    },
    { label: 'JSON-LD extract', bytes: jsonLdBytes,  tokens: jsonLdTokens  },
    { label: 'AHTML compact',   bytes: compactBytes, tokens: compactTokens },
    { label: 'AHTML JSON',      bytes: jsonBytes,    tokens: jsonTokens    },
  ];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const vs  = i === 0 ? '—' : diffPct(htmlTokens, row.tokens);
    const vsColored = i === 0 ? dim(vs) : vs.startsWith('-') ? cyan(vs) : vs;
    process.stdout.write(
      `${row.label.padEnd(col1)} ${fmtBytes(row.bytes).padStart(col2)}  ${row.tokens.toLocaleString().padStart(col3)}  ${vsColored.padStart(col4)}\n`,
    );
  }

  process.stdout.write('\n');

  // Summary lines
  const entityCounts = new Map<string, number>();
  for (const e of merged.entities) {
    entityCounts.set(e.type, (entityCounts.get(e.type) ?? 0) + 1);
  }
  const entitySummary =
    entityCounts.size > 0
      ? [...entityCounts.entries()].map(([t, n]) => `${n} ${t}${n !== 1 ? 's' : ''}`).join(', ')
      : '0 entities';

  process.stdout.write(
    `AHTML retains: ${entitySummary}, ${merged.actions.length} action${merged.actions.length !== 1 ? 's' : ''} (typed + structured)\n`,
  );

  const jsonLdEntityCount = schemaOrg.entities.length + openGraph.entities.length;
  process.stdout.write(
    jsonLdText
      ? `JSON-LD retains: ${jsonLdEntityCount} entit${jsonLdEntityCount !== 1 ? 'ies' : 'y'} (schema.org format, no actions)\n`
      : `JSON-LD retains: no blocks found\n`,
  );

  process.stdout.write(`Raw HTML: no structured extraction (estimated prose tokens)\n`);
  process.stdout.write(dim('\nToken counts are estimates (1 token ≈ 4 chars).\n'));

  return 0;
}

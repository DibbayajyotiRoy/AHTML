/**
 * AHTML benchmark entry point.
 *
 *   npm run start            # print table to stdout
 *   npm run report           # also write ../../benchmark-results.md
 */

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCorpus } from './corpus.js';
import { measure, tokenizerAvailability } from './tokenize.js';
import { renderReport, type Row } from './report.js';

const FORMAT_LABEL: Record<string, string> = {
  html: 'HTML',
  llms_txt: 'llms.txt',
  ahtml_compact: 'AHTML compact',
  ahtml_json: 'AHTML JSON',
};

async function main() {
  const args = new Set(process.argv.slice(2));
  const writeReport = args.has('--write-report');

  const corpus = buildCorpus();
  const rows: Row[] = [];

  for (const entry of corpus) {
    for (const key of ['html', 'llms_txt', 'ahtml_compact', 'ahtml_json'] as const) {
      const text = entry[key];
      const m = await measure(text);
      rows.push({ archetype: entry.archetype, format: FORMAT_LABEL[key]!, measurement: m });
    }
  }

  const md = renderReport(rows);
  process.stdout.write(md);

  const availability = tokenizerAvailability();
  process.stderr.write('\n# Tokenizer availability\n');
  for (const [name, ok] of Object.entries(availability)) {
    process.stderr.write(`  ${ok ? '✅' : '❌'}  ${name}\n`);
  }

  if (writeReport) {
    const here = dirname(fileURLToPath(import.meta.url));
    const out = resolve(here, '../../..', 'benchmark-results.md');
    writeFileSync(out, md);
    process.stderr.write(`\n📄 wrote ${out}\n`);
  }
}

main().catch((err) => {
  process.stderr.write(`benchmark failed: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});

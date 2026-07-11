/**
 * RFC-2119 MUST extractor (TASKS.md T4.2). Parses SPEC.md, assigns each
 * MUST/MUST NOT sentence a stable id in document order, and writes
 * corpus/1.0/musts.json. The traceability test fails when a MUST id has no
 * fixture mapping (or documented waiver) in the corpus manifest.
 *
 *   npx tsx packages/conformance/src/extract-musts.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SPEC = join(here, '../../..', 'SPEC.md');
const OUT = join(here, '..', 'corpus', '1.0', 'musts.json');

export interface MustEntry {
  id: string;
  line: number;
  section: string;
  text: string;
}

export function extractMusts(specText: string): MustEntry[] {
  const lines = specText.split('\n');
  const musts: MustEntry[] = [];
  let section = 'preamble';
  let counter = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const heading = /^#{1,3}\s+(.+)$/.exec(line);
    if (heading) section = heading[1]!.trim();
    if (/\bMUST\b/.test(line)) {
      counter++;
      // Capture the sentence context: this line plus its continuation line(s).
      const context = [line, lines[i + 1] ?? ''].join(' ').replace(/\s+/g, ' ').trim();
      musts.push({
        id: `MUST-${String(counter).padStart(3, '0')}`,
        line: i + 1,
        section,
        text: context.slice(0, 200),
      });
    }
  }
  return musts;
}

// Script mode only — importing this module must have no side effects.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const musts = extractMusts(readFileSync(SPEC, 'utf8'));
  writeFileSync(OUT, JSON.stringify({ spec: 'SPEC.md v0.1', musts }, null, 2) + '\n');
  console.log(`extracted ${musts.length} MUSTs → ${OUT}`);
  for (const m of musts) console.log(` ${m.id} (§${m.section}, L${m.line}): ${m.text.slice(0, 80)}…`);
}

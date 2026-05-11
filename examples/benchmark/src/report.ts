/**
 * Markdown report writer for the benchmark.
 */

import type { Measurement } from './tokenize.js';

export interface Row {
  archetype: string;
  format: string;
  measurement: Measurement;
}

const FORMATS = ['HTML', 'llms.txt', 'AHTML compact', 'AHTML JSON'];

export function renderReport(rows: Row[]): string {
  const archetypes = [...new Set(rows.map((r) => r.archetype))];
  const L: string[] = [];

  L.push('# AHTML benchmark — results');
  L.push('');
  L.push('| | Method |');
  L.push('| --- | --- |');
  L.push('| Generated at | ' + new Date().toISOString() + ' |');
  L.push('| Tokenizers | `gpt-tokenizer` (cl100k_base + o200k_base), `@anthropic-ai/tokenizer` |');
  L.push('| Compression | gzip level 9 (node:zlib) |');
  L.push('| Corpus | 3 archetypes — see `examples/benchmark/src/corpus.ts` |');
  L.push('');

  for (const a of archetypes) {
    L.push(`## ${a}`);
    L.push('');
    L.push('| Format | Bytes | Bytes (gzip) | Tokens cl100k | Tokens o200k | Tokens Claude |');
    L.push('| --- | ---: | ---: | ---: | ---: | ---: |');
    const archRows = rows.filter((r) => r.archetype === a);
    const ordered = FORMATS.map((f) => archRows.find((r) => r.format === f)).filter(Boolean) as Row[];
    for (const r of ordered) {
      L.push(
        `| ${r.format} | ${num(r.measurement.bytes)} | ${num(r.measurement.bytes_gzip)} | ${cell(r.measurement.tokens_cl100k)} | ${cell(r.measurement.tokens_o200k)} | ${cell(r.measurement.tokens_claude)} |`,
      );
    }
    L.push('');

    // Compression ratios vs HTML baseline.
    const html = ordered.find((r) => r.format === 'HTML');
    if (html) {
      L.push(`### Reduction vs raw HTML`);
      L.push('');
      L.push('| Format | × smaller (gzip) | × fewer tokens (o200k) | × fewer tokens (Claude) |');
      L.push('| --- | ---: | ---: | ---: |');
      for (const r of ordered.filter((r) => r !== html)) {
        const gz = ratio(html.measurement.bytes_gzip, r.measurement.bytes_gzip);
        const t1 = ratio(html.measurement.tokens_o200k, r.measurement.tokens_o200k);
        const t2 = ratio(html.measurement.tokens_claude, r.measurement.tokens_claude);
        L.push(`| ${r.format} | ${gz} | ${t1} | ${t2} |`);
      }
      L.push('');
    }
  }

  L.push('## Capability comparison');
  L.push('');
  L.push('Token efficiency alone does not capture the differentiator. llms.txt');
  L.push('and AHTML compact are competitive on tokens; AHTML adds typed action');
  L.push('contracts that llms.txt cannot express.');
  L.push('');
  L.push('| Capability | HTML | llms.txt | AHTML compact | AHTML JSON |');
  L.push('| --- | :---: | :---: | :---: | :---: |');
  L.push('| Typed entities | implicit | text only | ✅ | ✅ |');
  L.push('| Typed actions | implicit | text only | ✅ | ✅ |');
  L.push('| Cost / reversibility | ❌ | ❌ | ✅ | ✅ |');
  L.push('| Side-effect declarations | ❌ | ❌ | ✅ | ✅ |');
  L.push('| Site policy & rate limits | ❌ | partial | ✅ | ✅ |');
  L.push('| Freshness / TTL | ❌ | ❌ | ✅ | ✅ |');
  L.push('| ETag / conditional fetch | partial | ❌ | ✅ | ✅ |');
  L.push('| Pagination semantics | ❌ | ❌ | ✅ | ✅ |');
  L.push('| MCP-emittable | ❌ | ❌ | ✅ | ✅ |');
  L.push('| OpenAPI-emittable | ❌ | ❌ | ✅ | ✅ |');
  L.push('| Cryptographically signable | ❌ | ❌ | digest only | ✅ |');
  L.push('');

  L.push('## Methodology notes');
  L.push('');
  L.push('1. **Same source data, four serializations.** Every format in the table');
  L.push('   above describes the same products / articles / tasks. Renderers live');
  L.push('   in `src/corpus.ts`. Re-run `npm run start` to regenerate.');
  L.push('2. **Real tokenizers.** We do not approximate via `text.length / 4`.');
  L.push('   `gpt-tokenizer` is the same `tiktoken` BPE OpenAI uses internally.');
  L.push('   `@anthropic-ai/tokenizer` is the official Claude tokenizer.');
  L.push('3. **HTML noise is realistic.** Each HTML sample includes nav, footer,');
  L.push('   schema.org JSON-LD, OpenGraph meta, inline tracking scripts, hero');
  L.push('   image references, related-product rails, comment stubs, and the');
  L.push('   typical 50+ link footer of a production site.');
  L.push('4. **AHTML snapshots are real.** They are built with the `@ahtml/schema`');
  L.push('   `snapshot()` DSL and serialized with the package\'s exported');
  L.push('   `toCompact` / `toJson` functions — not hand-tuned for the benchmark.');
  L.push('5. **Future formal benchmark.** Adapt to WebShop (Yao 2022), Mind2Web');
  L.push('   (Deng 2023), and WebArena (Zhou 2024) for peer-reviewable numbers.');
  L.push('');
  return L.join('\n');
}

function num(n: number | null | undefined): string {
  return n == null ? '—' : n.toLocaleString();
}

function cell(n: number | null | undefined): string {
  return n == null ? '*not installed*' : n.toLocaleString();
}

function ratio(baseline: number | null, value: number | null): string {
  if (baseline == null || value == null || value === 0) return '—';
  const r = baseline / value;
  return r >= 10 ? `${r.toFixed(0)}×` : `${r.toFixed(1)}×`;
}

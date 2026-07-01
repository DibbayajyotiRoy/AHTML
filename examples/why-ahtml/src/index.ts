/**
 * "Why AHTML" — the competitive benchmark.
 *
 *   npm start                 # print the report to stdout
 *   npm run report            # also write ../../WHY-AHTML.md
 *
 * It answers two questions with running code, not adjectives:
 *   1. Why are we the best?  → real token numbers + executed capability proofs.
 *   2. Why (and who) are we building it for?  → the mission, up top.
 */

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toCompact, toJson } from '@ahtmljs/schema';
import { productSnapshot, productHtml, productMarkdown } from './scenario.js';
import { measure, type Measurement } from './tokenize.js';
import { runProofs } from './proofs.js';

const MISSION = `## Why we are building it — and who for

The web now has two audiences. **Humans** get pixels. **Agents** get tokens —
and they pay for every one. Yet an agent shopping your store still downloads
the page *built for humans* — nav, footer, analytics, and ad chrome that
production pages routinely balloon to 200–500 KB — from which it must guess the
price, the return policy, and whether "Buy now" will actually charge a card. It
is expensive, lossy, and — worst of all — **not actionable**. The agent can
read that a product exists; it cannot safely *buy* it.

AHTML exists so the **site itself publishes the agent-readable view** — typed
entities, typed actions with cost / reversibility / side-effects / confirmation,
freshness, a signature, and a price — from one source, additively, with zero
migration. Browsers keep getting the same HTML.

**Who it's for:**

- **Site owners** who want to be usable by agents *without* standing up and
  securing a second, parallel MCP server. Your existing app becomes the MCP
  server, the OpenAPI provider, and the priced-action endpoint.
- **Agent authors** who need a cheap, typed, trustworthy page contract instead
  of re-scraping bespoke HTML for every site on the web.
- **The open agent web** — one shared contract, signed and priced, instead of
  N one-off scrapers that break on the next redesign.

The rest of this document is the "why we're the best" evidence: measured token
savings, then capabilities proven by *executing AHTML code* against a real
snapshot.`;

const FORMATS = ['HTML (what browsers load)', 'Readable Markdown (Cloudflare / Jina / llms.txt)', 'AHTML compact', 'AHTML JSON'] as const;

function pct(n: number): string { return `${Math.round(n * 100)}%`; }
function x(n: number): string { return `${n.toFixed(1)}×`; }

async function main() {
  const write = process.argv.slice(2).includes('--write-report');
  const snap = productSnapshot();

  const samples: Record<(typeof FORMATS)[number], string> = {
    'HTML (what browsers load)': productHtml(),
    'Readable Markdown (Cloudflare / Jina / llms.txt)': productMarkdown(),
    'AHTML compact': toCompact(snap),
    'AHTML JSON': toJson(snap),
  };

  const measured: Record<string, Measurement> = {};
  for (const f of FORMATS) measured[f] = await measure(samples[f]);

  const html = measured[FORMATS[0]]!;
  const proofs = await runProofs(snap);

  // ── Build the report ──────────────────────────────────────────────────────
  const L: string[] = [];
  L.push('# Why AHTML — the competitive benchmark', '');
  L.push('> One flagship product page, expressed four ways. Token counts are from the');
  L.push('> real OpenAI (`o200k_base`) and Anthropic tokenizers — no `length / 4`. The');
  L.push('> capability rows are produced by **executing AHTML code**, printed verbatim.', '');
  L.push(MISSION, '');
  L.push('---', '');

  // Token table
  L.push('## 1. Token efficiency (measured, real tokenizers)', '');
  L.push('| Format | Bytes | gzip | Tokens (o200k) | Tokens (Claude) | vs HTML |');
  L.push('| --- | ---: | ---: | ---: | ---: | ---: |');
  for (const f of FORMATS) {
    const m = measured[f]!;
    const o = m.tokens_o200k;
    const vs = o && html.tokens_o200k ? x(html.tokens_o200k / o) : '—';
    const isHtml = f === FORMATS[0];
    L.push(`| ${f} | ${m.bytes.toLocaleString()} | ${m.gzip.toLocaleString()} | ${o ?? 'n/a'} | ${m.tokens_claude ?? 'n/a'} | ${isHtml ? '1.0× (baseline)' : vs} |`);
  }
  L.push('');
  const mdTok = measured[FORMATS[1]]!.tokens_o200k;
  const compactTok = measured[FORMATS[2]]!.tokens_o200k;
  if (html.tokens_o200k && compactTok) {
    L.push(`**AHTML compact is ${x(html.tokens_o200k / compactTok)} fewer tokens than the HTML a browser loads** — ` +
      `and that HTML sample is a deliberately *conservative* ${(html.bytes / 1024).toFixed(1)} KB page. ` +
      `Real product pages run 200–500 KB, so this multiple is a floor, not a ceiling.`);
  }
  if (mdTok && compactTok) {
    L.push('');
    L.push(`Notice the honest part: **readable Markdown is roughly as cheap as AHTML** ` +
      `(${mdTok} vs ${compactTok} tokens). On tokens alone, "just convert the HTML to ` +
      `markdown" ties. So token savings is necessary — but it is *not* why AHTML wins.`);
  }
  L.push('', '---', '');

  // Capability scorecard
  L.push('## 2. What markdown throws away (the real differentiator)', '');
  L.push('Every "LLM-friendly" format below is cheap. Only AHTML is cheap **and** carries');
  L.push('the contract an agent needs to *act safely*.', '');
  L.push('| Capability | HTML | Readable Markdown | llms.txt | **AHTML** |');
  L.push('| --- | :---: | :---: | :---: | :---: |');
  const rows: Array<[string, string, string, string, string]> = [
    ['Typed entities (price object, stock qty)', 'implicit', 'text only', 'text only', '✅'],
    ['Typed actions you can invoke', '❌', '❌', '❌', '✅'],
    ['Cost + payment rails (x402)', '❌', '❌', '❌', '✅'],
    ['Reversibility / return window', '❌', 'prose', '❌', '✅'],
    ['Side-effects (charge_card, decrement_stock)', '❌', '❌', '❌', '✅'],
    ['Confirmation requirement', '❌', '❌', '❌', '✅'],
    ['Freshness / TTL + ETag diff', '❌', '❌', '❌', '✅'],
    ['MCP / OpenAPI emittable', '❌', '❌', '❌', '✅'],
    ['Cryptographically signed', '❌', '❌', '❌', '✅'],
    ['Verified-agent auth (RFC 9421)', '❌', '❌', '❌', '✅'],
    ['Content licensing (RSL 1.0)', '❌', '❌', '❌', '✅'],
  ];
  for (const r of rows) L.push(`| ${r[0]} | ${r[1]} | ${r[2]} | ${r[3]} | ${r[4]} |`);
  L.push('');
  L.push('---', '');

  // Executed proofs
  L.push('## 3. Capabilities, proven by running the code', '');
  L.push('These rows are printed by `src/proofs.ts` executing against the snapshot — the');
  L.push('exact outputs, not a description of them. None of them are expressible on HTML,');
  L.push('markdown, or llms.txt; there is nothing there to run.', '');
  L.push('| Capability | Live result | |');
  L.push('| --- | --- | :---: |');
  for (const p of proofs) L.push(`| ${p.capability} | ${p.result} | ${p.ok ? '✅' : '❌'} |`);
  L.push('');
  const allOk = proofs.every((p) => p.ok);
  L.push(`_${proofs.filter((p) => p.ok).length}/${proofs.length} capability proofs passed live._`, '');
  L.push('---', '');

  // Accuracy pointer
  L.push('## 4. And it makes the agent *more accurate*', '');
  L.push('The token win is not paid for in comprehension. In the real-LLM benchmark');
  L.push('([`benchmark-results-llm.md`](benchmark-results-llm.md)), fact-extraction accuracy');
  L.push('across `gpt-4o-mini`, `claude-haiku-4.5`, `gemini-2.5-flash`, and `llama-3.3-70b`');
  L.push('rose from **91% on raw HTML to 100% on AHTML JSON** — fewer tokens *and* fewer');
  L.push('mistakes, because the agent stops guessing at structure.', '');
  L.push('---', '');
  L.push('## Reproduce', '');
  L.push('```bash');
  L.push('npm --workspace examples/why-ahtml start        # print this report');
  L.push('npm --workspace examples/why-ahtml run report    # regenerate WHY-AHTML.md');
  L.push('```', '');
  L.push('_Token numbers are measured live with `gpt-tokenizer` + `@anthropic-ai/tokenizer`.');
  L.push('Capability rows are executed by `src/proofs.ts`. Regenerate any time._');

  const md = L.join('\n') + '\n';
  process.stdout.write(md);

  if (write) {
    const here = dirname(fileURLToPath(import.meta.url));
    const out = resolve(here, '../../..', 'WHY-AHTML.md');
    writeFileSync(out, md);
    process.stderr.write(`\n📄 wrote ${out}\n`);
  }
  if (!allOk) process.exitCode = 1;
}

main().catch((err) => {
  process.stderr.write(`why-ahtml benchmark failed: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});

/**
 * Run the LLM comprehension benchmark.
 *
 *   npm run mock           → mock runner, no API calls, validates pipeline
 *   npm run report         → mock + writes benchmark-results-llm.md
 *   npm run real           → real OpenAI + Anthropic calls (needs API keys)
 */

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapshot, toCompact, toJson } from '@ahtmljs/schema';
import { TASKS, scoreAnswer, type Task } from './tasks.js';
import { mockRunner, openaiRunner, anthropicRunner, geminiRunner, groqRunner, SYSTEM, type Runner, type RunResult } from './runners.js';

// =====================================================================
// Fixtures — one per archetype
// =====================================================================

function productFixtures() {
  const snap = snapshot('https://shop.example.com/products/mbp-14-m3', 'product_detail')
    .ttl(60)
    .add({
      id: 'product:mbp-14-m3',
      type: 'product',
      name: 'MacBook Pro 14" M3',
      brand: 'Apple',
      description: '14-inch laptop with M3 chip, 8-core CPU, 10-core GPU, 18GB RAM, 512GB SSD.',
      price: { amount: 1999, currency: 'USD' },
      list_price: { amount: 2199, currency: 'USD' },
      stock: { status: 'in_stock', quantity: 42 },
      sku: 'MBP14-M3-512-SB',
      rating: { average: 4.7, count: 1284 },
    })
    .action({
      id: 'purchase',
      target: 'product:mbp-14-m3',
      category: 'transact',
      method: 'POST',
      execute_url: '/api/checkout',
      auth: 'required',
      cost: { amount: 1999, currency: 'USD', category: 'purchase' },
      reversible: { reversible: true, window: 'P30D', policy: 'full_refund' },
      side_effects: ['charge_card', 'email_buyer', 'decrement_stock'],
      confirmation: 'required',
    })
    .build();

  const html = `<!DOCTYPE html>
<html><head><title>MacBook Pro 14" M3 — Shop</title>
<meta property="og:type" content="product" />
<meta property="og:title" content="MacBook Pro 14&quot; M3" />
<meta property="og:price:amount" content="1999" />
<meta property="og:price:currency" content="USD" />
<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org/',
  '@type': 'Product',
  name: 'MacBook Pro 14" M3',
  sku: 'MBP14-M3-512-SB',
  brand: { '@type': 'Brand', name: 'Apple' },
  description: '14-inch laptop with M3 chip, 8-core CPU, 10-core GPU, 18GB RAM, 512GB SSD.',
  aggregateRating: { '@type': 'AggregateRating', ratingValue: 4.7, reviewCount: 1284 },
  offers: { '@type': 'Offer', price: 1999, priceCurrency: 'USD', availability: 'https://schema.org/InStock' },
})}</script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','GA_TRACKING_ID');</script>
</head><body>
<header class="site-header"><nav><a href="/laptops">Laptops</a><a href="/phones">Phones</a><a href="/tablets">Tablets</a><a href="/audio">Audio</a><a href="/business">Business</a></nav></header>
<main class="pdp"><h1>MacBook Pro 14" M3</h1><p class="brand">Apple</p>
<div class="rating"><span class="stars">★★★★☆</span><a href="#reviews">4.7 (1,284 reviews)</a></div>
<div class="price">$1,999.00 <span class="was">$2,199.00</span></div>
<p>14-inch laptop with M3 chip, 8-core CPU, 10-core GPU, 18GB RAM, 512GB SSD.</p>
<div class="availability">In stock — 42 available</div>
<form action="/api/cart/items"><button>Add to cart</button><button class="buy-now" data-confirmation="required">Buy now — $1,999 — 30-day full refund — charges card, sends email, decrements stock</button></form>
</main>
<footer class="site-footer"><div><h4>Shop</h4><ul><li>Laptops</li><li>Phones</li><li>Audio</li></ul></div><div><h4>Help</h4><ul><li>Returns</li><li>Support</li></ul></div></footer>
</body></html>`;

  const llmsTxt = `# Shop — MacBook Pro 14" M3
> 14-inch laptop with M3 chip, 18GB RAM, 512GB SSD.

## Product
- Name: MacBook Pro 14" M3
- Brand: Apple
- Price: $1,999 (was $2,199)
- Stock: in_stock (42)
- SKU: MBP14-M3-512-SB
- Rating: 4.7 (1284 reviews)

## Actions
- purchase: charges $1,999 USD, requires confirmation, 30-day full refund, side effects: charge_card, email_buyer, decrement_stock
- add_to_cart: free
`;

  return { html, llmsTxt, compact: toCompact(snap), json: toJson(snap) };
}

function articleFixtures() {
  const snap = snapshot('https://rumour.example.com/article/why-agents-need-ahtml', 'article')
    .add({
      id: 'document:why-agents-need-ahtml',
      type: 'document',
      title: 'Why agents need a new HTML',
      author: 'Dibbayajyoti Roy',
      published_at: '2026-05-12T08:00:00Z',
      summary: 'HTML optimized the web for browsers. The agent web needs a new contract.',
      language: 'en',
    })
    .build();

  const html = `<!DOCTYPE html><html lang="en"><head>
<title>Why agents need a new HTML — Rumour</title>
<meta property="og:type" content="article" />
<meta property="article:published_time" content="2026-05-12T08:00:00Z" />
<meta property="article:author" content="Dibbayajyoti Roy" />
<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'NewsArticle',
  headline: 'Why agents need a new HTML',
  author: { '@type': 'Person', name: 'Dibbayajyoti Roy' },
  datePublished: '2026-05-12T08:00:00Z',
  inLanguage: 'en',
  description: 'HTML optimized the web for browsers. The agent web needs a new contract.',
})}</script></head><body>
<article><h1>Why agents need a new HTML</h1>
<p class="byline">By Dibbayajyoti Roy · May 12, 2026</p>
<p>The web that browsers see and the web that agents see are two different things. Browsers see pixels. Agents see tokens.</p>
</article></body></html>`;

  const llmsTxt = `# Why agents need a new HTML
> Author: Dibbayajyoti Roy. Published 2026-05-12. Language: en.

HTML optimized the web for browsers. The agent web needs a new contract.
`;

  return { html, llmsTxt, compact: toCompact(snap), json: toJson(snap) };
}

function dashboardFixtures() {
  const tasks: Array<{ id: string; title: string; state: 'open' | 'in_progress' | 'blocked' | 'done'; priority: 'low' | 'medium' | 'high' | 'urgent' }> = [
    { id: 't-1', title: 'Lock schema', state: 'in_progress', priority: 'urgent' },
    { id: 't-2', title: 'Real-world corpus', state: 'in_progress', priority: 'high' },
    { id: 't-3', title: 'Vite plugin', state: 'open', priority: 'high' },
    { id: 't-4', title: 'LangChain loader', state: 'open', priority: 'medium' },
    { id: 't-5', title: 'Landing page', state: 'done', priority: 'low' },
  ];
  const b = snapshot('https://stitch.example/w/core', 'task_list').ttl(15);
  for (const t of tasks) b.add({ id: `task:${t.id}`, type: 'task', title: t.title, state: t.state, priority: t.priority });
  const snap = b
    .action({ id: 'create_task', category: 'create', method: 'POST', execute_url: '/api/tasks', auth: 'required', cost: { category: 'free' } })
    .action({ id: 'delete_task', category: 'delete', method: 'DELETE', execute_url: '/api/tasks/{id}', auth: 'required', cost: { category: 'free' }, reversible: { reversible: true, window: 'P7D' }, side_effects: ['delete_record'], confirmation: 'required' })
    .build();

  const html = `<!DOCTYPE html><html><head><title>Tasks</title></head><body>
<header><nav>Workspaces | Filters | Views</nav></header>
<main><h1>AHTML Core</h1>
<table><thead><tr><th>Task</th><th>State</th><th>Priority</th></tr></thead><tbody>
${tasks.map((t) => `<tr><td>${t.title}</td><td>${t.state}</td><td>${t.priority}</td></tr>`).join('\n')}
</tbody></table>
<button data-action="new-task">Create task</button>
<button data-action="delete-task" data-confirmation="required" class="danger">Delete task</button>
</main></body></html>`;

  const llmsTxt = `# AHTML Core — Tasks
${tasks.map((t) => `- [${t.state}] ${t.title} (${t.priority})`).join('\n')}

## Actions
- create_task: free
- delete_task: requires confirmation, 7-day restore window
`;

  return { html, llmsTxt, compact: toCompact(snap), json: toJson(snap) };
}

// =====================================================================
// Markdown (auto) — simulates CDN-style lossy HTML→markdown conversion
// (e.g. Cloudflare's `Accept: text/markdown`). Deliberately naive: it
// keeps visible text structure and drops <script> (including JSON-LD),
// <meta>, and data-* attributes — exactly what auto-conversion loses.
// =====================================================================

function htmlToMarkdown(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
    .replace(/<h([2-4])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, l, t) => `\n${'#'.repeat(Number(l) + 1)} ${t}\n`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n')
    .replace(/<tr[^>]*>([\s\S]*?)<\/tr>/gi, (_, row: string) => '| ' + row.replace(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi, '$1 | ').replace(/<[^>]+>/g, '').trim() + '\n')
    .replace(/<(p|div|article|section|main|header|footer|form|table|thead|tbody|nav|br)[^>]*\/?>/gi, '\n')
    .replace(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
    .replace(/<button[^>]*>([\s\S]*?)<\/button>/gi, '[$1]')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n';
}

// =====================================================================
// Main runner
// =====================================================================

async function runAll(opts: { mock: boolean; withLLM: boolean }): Promise<RunResult[]> {
  const fixtures = {
    product: productFixtures(),
    article: articleFixtures(),
    dashboard: dashboardFixtures(),
  };

  const runners: Runner[] = [];
  if (opts.mock || !opts.withLLM) runners.push(mockRunner);
  if (opts.withLLM) {
    if (process.env.OPENAI_API_KEY) { runners.push(openaiRunner); console.error('  + OpenAI gpt-4o-mini'); }
    if (process.env.ANTHROPIC_API_KEY) { runners.push(anthropicRunner); console.error('  + Anthropic claude-haiku-4.5'); }
    if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) { runners.push(geminiRunner); console.error('  + Google gemini-2.5-flash'); }
    if (process.env.GROQ_API_KEY) { runners.push(groqRunner); console.error('  + Groq llama-3.3-70b-versatile'); }
    if (runners.length === 0) {
      console.error('--with-llm requested but no API keys found in env. Set at least one of:');
      console.error('  OPENAI_API_KEY  ANTHROPIC_API_KEY  GEMINI_API_KEY  GROQ_API_KEY');
      console.error('Or run scripts/run-llm-benchmark.sh which loads .env automatically.');
      process.exit(1);
    }
  }

  const formats = ['HTML', 'Markdown (auto)', 'llms.txt', 'AHTML compact', 'AHTML JSON'] as const;
  const results: RunResult[] = [];

  for (const task of TASKS) {
    const fixture = fixtures[task.archetype];
    const contents: Record<typeof formats[number], string> = {
      'HTML': fixture.html,
      'Markdown (auto)': htmlToMarkdown(fixture.html),
      'llms.txt': fixture.llmsTxt,
      'AHTML compact': fixture.compact,
      'AHTML JSON': fixture.json,
    };
    for (const format of formats) {
      for (const runner of runners) {
        try {
          const { answer, tokens_input, tokens_output, cost_usd, latency_ms } = await runner.ask(SYSTEM, task.prompt, contents[format]);
          const correct = scoreAnswer(task, answer);
          results.push({ task, format, model: runner.name, answer, tokens_input, tokens_output, cost_usd, latency_ms, correct });
        } catch (err) {
          console.error(`  ✗ ${task.id} / ${format} / ${runner.name}: ${(err as Error).message}`);
        }
      }
    }
  }
  return results;
}

function renderReport(results: RunResult[]): string {
  const L: string[] = [];
  L.push('# AHTML LLM comprehension benchmark — results');
  L.push('');
  L.push(`Generated: ${new Date().toISOString()}  |  ${results.length} runs across ${new Set(results.map((r) => r.task.id)).size} tasks`);
  L.push('');
  L.push('## Aggregate by format');
  L.push('');
  L.push('| Format | Median tokens in | Total tokens | Total cost | Accuracy |');
  L.push('| --- | ---: | ---: | ---: | ---: |');
  const byFormat = new Map<string, RunResult[]>();
  for (const r of results) {
    const k = r.format;
    if (!byFormat.has(k)) byFormat.set(k, []);
    byFormat.get(k)!.push(r);
  }
  for (const [format, rs] of byFormat) {
    const sorted = [...rs].sort((a, b) => a.tokens_input - b.tokens_input);
    const median = sorted[Math.floor(sorted.length / 2)]!.tokens_input;
    const total = rs.reduce((sum, r) => sum + r.tokens_input + r.tokens_output, 0);
    const cost = rs.reduce((sum, r) => sum + r.cost_usd, 0);
    const accuracy = rs.filter((r) => r.correct).length / rs.length;
    L.push(`| ${format} | ${median.toLocaleString()} | ${total.toLocaleString()} | $${cost.toFixed(4)} | ${(accuracy * 100).toFixed(0)}% |`);
  }
  L.push('');
  L.push('## Per-task pass/fail by format');
  L.push('');
  const formats = [...new Set(results.map((r) => r.format))];
  L.push('| Task | ' + formats.join(' | ') + ' |');
  L.push('| --- |' + formats.map(() => ' :---: |').join(''));
  const taskIds = [...new Set(results.map((r) => r.task.id))];
  for (const tid of taskIds) {
    const row = [tid];
    for (const f of formats) {
      const r = results.find((r) => r.task.id === tid && r.format === f);
      row.push(r ? (r.correct ? '✓' : '✗') : '–');
    }
    L.push('| ' + row.join(' | ') + ' |');
  }
  L.push('');
  L.push('## Methodology');
  L.push('');
  L.push('- Tokenizers: `gpt-tokenizer` (OpenAI tiktoken) and `@anthropic-ai/tokenizer` (Claude). No char/4 approximations.');
  L.push('- Mock mode uses regex heuristics on each format to simulate LLM extraction.');
  L.push('- `Markdown (auto)` is a deliberately naive HTML→markdown auto-conversion (CDN-style, e.g. `Accept: text/markdown`): visible text survives; JSON-LD, meta tags, and data-attributes are lost.');
  L.push('- Real mode calls four providers at temperature=0, max_tokens=64:');
  L.push('  - **OpenAI** gpt-4o-mini  (env `OPENAI_API_KEY`)');
  L.push('  - **Anthropic** claude-haiku-4.5  (env `ANTHROPIC_API_KEY`)');
  L.push('  - **Google** gemini-2.5-flash  (env `GEMINI_API_KEY`)');
  L.push('  - **Groq** llama-3.3-70b-versatile  (env `GROQ_API_KEY`)');
  L.push('- Pricing per 1M tokens (May 2026):');
  L.push('  | Model | input | output |');
  L.push('  | --- | ---: | ---: |');
  L.push('  | gpt-4o-mini | $0.15 | $0.60 |');
  L.push('  | gemini-2.5-flash | $0.075 | $0.30 |');
  L.push('  | llama-3.3-70b (Groq) | $0.59 | $0.79 |');
  L.push('  | claude-haiku-4.5 | $1.00 | $5.00 |');
  L.push('- Ground truth defined in `src/tasks.ts`.');
  L.push('- Run with `bash scripts/run-llm-benchmark.sh` — auto-detects which keys are in `.env`.');
  L.push('');
  return L.join('\n');
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const opts = {
    mock: args.has('--mock') || !args.has('--with-llm'),
    withLLM: args.has('--with-llm'),
  };
  const writeReport = args.has('--write-report');

  console.log(`Mode: ${opts.withLLM ? 'real LLM' : 'mock'}`);
  const results = await runAll(opts);
  const md = renderReport(results);
  process.stdout.write(md);

  if (writeReport) {
    const here = dirname(fileURLToPath(import.meta.url));
    const out = resolve(here, '../../..', 'benchmark-results-llm.md');
    writeFileSync(out, md);
    process.stderr.write(`\n📄 wrote ${out}\n`);
  }
}

main().catch((err) => {
  process.stderr.write(`benchmark failed: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});

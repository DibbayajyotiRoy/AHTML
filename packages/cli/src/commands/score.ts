/**
 * `ahtml score <url>` — Lighthouse-style agent-readiness grade.
 *
 * Checks universal signals (JSON-LD, OpenGraph, robots.txt AI directives,
 * llms.txt, extraction yield, token efficiency) plus optional AHTML adoption.
 * Prints a scored report and top fix recommendation.
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

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

type CheckStatus = 'pass' | 'warn' | 'fail';

interface Check {
  name: string;
  status: CheckStatus;
  points: number;
  earned: number;
  detail: string;
  tier: 'A' | 'B';
  fix?: string;
  fixHint?: string;
}

function gradeFromScore(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

function renderStatus(status: CheckStatus): string {
  if (status === 'pass') return green('PASS');
  if (status === 'warn') return yellow('WARN');
  return red('FAIL');
}

export interface ScoreResult {
  url: string;
  score: number;
  grade: string;
  checks: Check[];
}

async function fetchRobotsTxt(origin: string): Promise<string> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    try {
      const res = await fetch(`${origin}/robots.txt`, {
        headers: { 'user-agent': 'AHTML-CLI/0.9.2' },
        signal: ctrl.signal,
      });
      if (!res.ok) return '';
      return res.text();
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return '';
  }
}

export async function computeScore(url: string): Promise<ScoreResult> {
  const html = await fetchHtml(url);
  const origin = new URL(url).origin;

  // Run extractors
  const schemaOrg = extractFromSchemaOrg(html);
  const openGraph = extractFromOpenGraph(html);
  const dataAttrs = extractFromDataAttrs(html);
  const microdata = extractFromMicrodata(html);
  const merged = mergeExtractions([dataAttrs, schemaOrg, microdata, openGraph]);

  // Build snapshot + compact for efficiency metric
  const pageType = (merged.page_type as Parameters<typeof snapshot>[1]) ?? 'generic';
  let builder = snapshot(url, pageType);
  for (const entity of merged.entities) builder = builder.add(entity);
  for (const action of merged.actions) builder = builder.action(action);
  const snap = builder.build();
  const compact = toCompact(snap);

  const htmlTokens    = estimateTokens(html);
  const compactTokens = estimateTokens(compact);
  const savingsPct    = htmlTokens > 0 ? ((htmlTokens - compactTokens) / htmlTokens) * 100 : 0;

  // Probe signals in parallel
  const [robotsTxt, llmsTxtOk, ahtmlWellKnown, ahtmlEndpoint] = await Promise.all([
    fetchRobotsTxt(origin),
    headOk(`${origin}/llms.txt`),
    headOk(`${origin}/.well-known/ahtml.json`),
    headOk(`${origin}/ahtml`),
  ]);

  // ── Tier A checks ─────────────────────────────────────────────────────────

  const jsonLdBlocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>/gi)];
  const hasJsonLd = jsonLdBlocks.length > 0;

  // OpenGraph: title + description + type
  const ogMeta = new Map<string, string>();
  const ogRe = /<meta\s+([^>]+?)\/?\s*>/gi;
  let ogMatch: RegExpExecArray | null;
  while ((ogMatch = ogRe.exec(html)) !== null) {
    const attrStr = ogMatch[1]!;
    const propM = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(attrStr);
    const contM = /content\s*=\s*["']([^"']*)["']/i.exec(attrStr);
    if (propM && contM) ogMeta.set(propM[1]!.toLowerCase(), contM[1]!);
  }
  const ogComplete =
    ogMeta.has('og:title') && ogMeta.has('og:description') && ogMeta.has('og:type');
  const ogPresent  = ogMeta.has('og:title') || ogMeta.has('og:description');
  let ogDetail = 'not found';
  if (ogComplete) {
    ogDetail = 'og:title, og:description, og:type';
  } else if (ogPresent) {
    const found = ['og:title', 'og:description', 'og:type'].filter((k) => ogMeta.has(k));
    const missing = ['og:title', 'og:description', 'og:type'].filter((k) => !ogMeta.has(k));
    ogDetail = `Found: ${found.join(', ')}; Missing: ${missing.join(', ')}`;
  }

  const hasAiDirectives =
    /GPTBot|ClaudeBot|PerplexityBot|anthropic-ai|ChatGPT-User/i.test(robotsTxt);

  const extractionYield = merged.entities.length;

  const checks: Check[] = [
    {
      tier: 'A',
      name: 'JSON-LD present',
      status: hasJsonLd ? 'pass' : 'fail',
      points: 20,
      earned: hasJsonLd ? 20 : 0,
      detail: hasJsonLd ? `${jsonLdBlocks.length} block${jsonLdBlocks.length === 1 ? '' : 's'} found` : 'No <script type="application/ld+json"> found',
      fix: hasJsonLd ? undefined : 'Add JSON-LD (+20 points)',
      fixHint: hasJsonLd ? undefined : '<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage",...}</script>',
    },
    {
      tier: 'A',
      name: 'OpenGraph complete',
      status: ogComplete ? 'pass' : ogPresent ? 'warn' : 'fail',
      points: 15,
      earned: ogComplete ? 15 : ogPresent ? 8 : 0,
      detail: ogDetail,
      fix: ogComplete ? undefined : 'Add OpenGraph meta tags (+15 points)',
      fixHint: ogComplete
        ? undefined
        : '<meta property="og:title" content="..." />\n<meta property="og:description" content="..." />\n<meta property="og:type" content="website" />',
    },
    {
      tier: 'A',
      name: 'robots.txt AI directives',
      status: hasAiDirectives ? 'pass' : 'warn',
      points: 10,
      earned: hasAiDirectives ? 10 : 0,
      detail: hasAiDirectives ? 'AI crawlers addressed' : 'No GPTBot/ClaudeBot/PerplexityBot rules found',
      fix: hasAiDirectives ? undefined : 'Add AI directives to robots.txt (+10 points)',
      fixHint: hasAiDirectives
        ? undefined
        : 'User-agent: GPTBot\nAllow: /\n\nUser-agent: ClaudeBot\nAllow: /',
    },
    {
      tier: 'A',
      name: 'llms.txt',
      status: llmsTxtOk ? 'pass' : 'fail',
      points: 10,
      earned: llmsTxtOk ? 10 : 0,
      detail: llmsTxtOk ? `found at ${origin}/llms.txt` : `not found at /llms.txt`,
      fix: llmsTxtOk ? undefined : 'Add llms.txt (+10 points)',
      fixHint: llmsTxtOk
        ? undefined
        : `echo "# LLMs for ${new URL(url).hostname}" > public/llms.txt`,
    },
    {
      tier: 'A',
      name: 'Extraction yield',
      status: extractionYield >= 1 ? 'pass' : 'fail',
      points: 15,
      earned: extractionYield >= 1 ? 15 : 0,
      detail:
        extractionYield >= 1
          ? `${extractionYield} entit${extractionYield === 1 ? 'y' : 'ies'} extracted`
          : 'No entities extracted from JSON-LD, OpenGraph, or data-attrs',
      fix: extractionYield >= 1 ? undefined : 'Add structured data to improve extraction yield (+15 points)',
    },
    {
      tier: 'A',
      name: 'Token efficiency',
      status: savingsPct >= 50 ? 'pass' : savingsPct >= 20 ? 'warn' : 'fail',
      points: 10,
      earned: savingsPct >= 50 ? 10 : savingsPct >= 20 ? 5 : 0,
      detail:
        htmlTokens > 0
          ? `${savingsPct.toFixed(1)}% smaller than raw HTML`
          : 'Could not measure (empty page)',
    },
    // ── Tier B ────────────────────────────────────────────────────────────────
    {
      tier: 'B',
      name: '/.well-known/ahtml.json',
      status: ahtmlWellKnown ? 'pass' : 'fail',
      points: 10,
      earned: ahtmlWellKnown ? 10 : 0,
      detail: ahtmlWellKnown ? 'found' : 'not found',
      fix: ahtmlWellKnown ? undefined : 'Publish .well-known/ahtml.json (+10 points)',
    },
    {
      tier: 'B',
      name: '/ahtml endpoint',
      status: ahtmlEndpoint ? 'pass' : 'fail',
      points: 10,
      earned: ahtmlEndpoint ? 10 : 0,
      detail: ahtmlEndpoint ? 'found' : 'no AHTML server detected',
      fix: ahtmlEndpoint ? undefined : 'Add AHTML server (+10 points)',
      fixHint: ahtmlEndpoint ? undefined : 'npx @ahtmljs/cli doctor <url> for setup guidance',
    },
  ];

  const score = Math.min(100, checks.reduce((sum, ch) => sum + ch.earned, 0));
  const grade = gradeFromScore(score);

  return { url, score, grade, checks };
}

export async function runScore(url: string, flags: { json?: boolean } = {}): Promise<number> {
  let result: ScoreResult;
  try {
    result = await computeScore(url);
  } catch (err) {
    process.stderr.write(`error: could not score ${url} — ${(err as Error)?.message ?? String(err)}\n`);
    return 1;
  }

  const { score, grade, checks } = result;
  const hostname = new URL(url).hostname;

  if (flags.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return score >= 60 ? 0 : 1;
  }

  process.stdout.write(bold(`AHTML score — ${url}`) + '\n\n');

  // Grade badge
  const gradeColor = grade === 'A' ? green : grade === 'B' ? cyan : grade <= 'D' ? yellow : red;
  process.stdout.write(`${gradeColor(bold(`  ${grade}  ${score}/100`))}  ${dim(hostname)}\n\n`);

  // Tier A
  process.stdout.write(bold('Tier A — Universal signals (always applicable)') + '\n');
  for (const ch of checks.filter((c) => c.tier === 'A')) {
    const label = ch.name.padEnd(32);
    process.stdout.write(`${renderStatus(ch.status)}  ${label} ${dim(ch.detail)}\n`);
  }

  process.stdout.write('\n');

  // Tier B
  process.stdout.write(bold('Tier B — AHTML adoption (bonus)') + '\n');
  for (const ch of checks.filter((c) => c.tier === 'B')) {
    const label = ch.name.padEnd(32);
    process.stdout.write(`${renderStatus(ch.status)}  ${label} ${dim(ch.detail)}\n`);
  }

  process.stdout.write('\n' + '─'.repeat(38) + '\n');

  // Top fix: highest-value failing check
  const topFix = checks
    .filter((ch) => ch.status !== 'pass' && ch.fix)
    .sort((a, b) => b.points - a.points)[0];

  if (topFix) {
    process.stdout.write(`${bold('Top fix')} → ${topFix.fix}\n`);
    if (topFix.fixHint) {
      process.stdout.write(dim(topFix.fixHint) + '\n');
    }
  } else {
    process.stdout.write(green('All checks passed — excellent agent-readiness!') + '\n');
  }

  return score >= 60 ? 0 : 1;
}

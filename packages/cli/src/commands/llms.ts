/**
 * `ahtml llms <url>` — site crawler → llms.txt
 *
 * Crawls a site politely and produces a valid llms.txt file.
 * Prints to stdout by default; --out <file> writes to a file.
 *
 * Crawling strategy (in priority order):
 *   1. AHTML manifest at /.well-known/ahtml.json
 *   2. Sitemap at /sitemap.xml or /sitemap_index.xml
 *   3. BFS crawl (max 30 pages, depth 3, 500ms delay)
 *   4. Single page fallback
 */

import { writeFile } from 'fs/promises';
import { fetchHtml } from '../fetch.js';

const CLI_VERSION = '0.9.3';

// ── Types ────────────────────────────────────────────────────────────────────

interface PageEntry {
  url: string;
  title: string;
  description?: string;
}

type Source = 'AHTML manifest' | 'sitemap.xml' | 'BFS crawl' | 'single page';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Fetch text gracefully — returns null on any error. */
async function fetchText(url: string): Promise<string | null> {
  try {
    return await fetchHtml(url);
  } catch {
    return null;
  }
}

/** Derive a readable title from a URL pathname. */
function titleFromPath(pathname: string): string {
  const last = pathname.replace(/\/$/, '').split('/').pop() ?? '';
  return last.replace(/[-_]/g, ' ').replace(/\.[^.]+$/, '') || 'Home';
}

/** Extract <title> tag content from HTML. */
function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? m[1]!.trim() : null;
}

/** Check whether a page has <meta name="robots" content="noindex">. */
function hasNoIndex(html: string): boolean {
  return /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html) ||
    /<meta[^>]+content=["'][^"']*noindex[^"']*["'][^>]+name=["']robots["']/i.test(html);
}

/** Parse robots.txt and return disallowed path prefixes for AhtmlBot and *. */
function parseRobots(txt: string): Set<string> {
  const disallowed = new Set<string>();
  let applies = false;
  for (const line of txt.split('\n')) {
    const l = line.trim();
    if (l.startsWith('User-agent:')) {
      const agent = l.slice(11).trim().toLowerCase();
      applies = agent === '*' || agent === 'ahtmlbot';
    } else if (applies && l.startsWith('Disallow:')) {
      const p = l.slice(9).trim();
      if (p) disallowed.add(p);
    }
  }
  return disallowed;
}

/** Check whether a pathname is blocked by the robots disallow set. */
function isBlocked(pathname: string, disallowed: Set<string>): boolean {
  for (const prefix of disallowed) {
    if (pathname.startsWith(prefix)) return true;
  }
  return false;
}

/** Extract all <loc> values from a sitemap XML string. */
function parseLocUrls(xml: string): string[] {
  const urls: string[] = [];
  const re = /<loc>\s*(https?:\/\/[^\s<]+)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    urls.push(m[1]!.trim());
  }
  return urls;
}

/** Extract <a href> links from HTML, returning same-origin absolute URLs. */
function extractLinks(html: string, origin: string): string[] {
  const urls: string[] = [];
  const re = /<a[^>]+href=["']([^"'#?][^"']*?)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1]!.trim();
    try {
      const abs = new URL(href, origin);
      if (abs.origin === origin) {
        abs.hash = '';
        abs.search = '';
        urls.push(abs.href);
      }
    } catch {
      // ignore malformed hrefs
    }
  }
  return urls;
}

/** Sleep for `ms` milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Crawl strategies ─────────────────────────────────────────────────────────

/** Strategy 1: Try the AHTML manifest at /.well-known/ahtml.json. */
async function tryAhtmlManifest(
  origin: string,
  disallowed: Set<string>,
): Promise<PageEntry[] | null> {
  const manifestUrl = `${origin}/.well-known/ahtml.json`;
  const text = await fetchText(manifestUrl);
  if (!text) return null;

  let manifest: unknown;
  try {
    manifest = JSON.parse(text);
  } catch {
    return null;
  }

  // The manifest may have a top-level `routes` array or be an array itself
  const routes: unknown[] =
    Array.isArray(manifest)
      ? manifest
      : Array.isArray((manifest as Record<string, unknown>).routes)
        ? ((manifest as Record<string, unknown>).routes as unknown[])
        : [];

  if (routes.length === 0) return null;

  const pages: PageEntry[] = [];
  for (const r of routes) {
    if (typeof r !== 'object' || r === null) continue;
    const route = r as Record<string, unknown>;
    const path = typeof route.path === 'string' ? route.path : null;
    if (!path) continue;
    const pageType = typeof route.page_type === 'string' ? route.page_type : 'page';
    const abs = path.startsWith('http') ? path : origin + (path.startsWith('/') ? path : '/' + path);
    try {
      const u = new URL(abs);
      if (isBlocked(u.pathname, disallowed)) continue;
    } catch {
      continue;
    }
    const titleBase = titleFromPath(path);
    const title = titleBase === 'Home' ? 'Home' : `${capitalize(pageType.replace(/_/g, ' '))}: ${titleBase}`;
    pages.push({ url: abs, title, description: pageType });
  }

  return pages.length > 0 ? pages : null;
}

/** Strategy 2: Try sitemap.xml or sitemap_index.xml. */
async function trySitemap(
  origin: string,
  disallowed: Set<string>,
): Promise<PageEntry[] | null> {
  let xml = await fetchText(`${origin}/sitemap.xml`);
  if (!xml) xml = await fetchText(`${origin}/sitemap_index.xml`);
  if (!xml) return null;

  let locs = parseLocUrls(xml);

  // If this is a sitemap index, follow the first nested sitemaps
  if (xml.includes('<sitemapindex') || xml.includes('<sitemap>')) {
    const nested: string[] = [];
    for (const loc of locs.slice(0, 5)) {
      const sub = await fetchText(loc);
      if (sub) nested.push(...parseLocUrls(sub));
    }
    locs = nested.length > 0 ? nested : locs;
  }

  // Filter to same-origin only and cap at 200
  const filtered = locs
    .filter((u) => {
      try {
        const parsed = new URL(u);
        return parsed.origin === origin && !isBlocked(parsed.pathname, disallowed);
      } catch {
        return false;
      }
    })
    .slice(0, 200);

  if (filtered.length === 0) return null;

  const pages: PageEntry[] = filtered.map((u) => {
    const pathname = new URL(u).pathname;
    return {
      url: u,
      title: titleFromPath(pathname),
    };
  });

  return pages;
}

/** Strategy 3: BFS crawl. Max 30 pages, depth 3, 500ms delay. */
async function bfsCrawl(
  startUrl: string,
  origin: string,
  disallowed: Set<string>,
): Promise<PageEntry[]> {
  const MAX_PAGES = 30;
  const MAX_DEPTH = 3;
  const DELAY_MS = 500;

  const visited = new Set<string>();
  const pages: PageEntry[] = [];
  // Queue entries: [url, depth]
  const queue: Array<[string, number]> = [[startUrl, 0]];
  visited.add(startUrl);

  while (queue.length > 0 && pages.length < MAX_PAGES) {
    const item = queue.shift()!;
    const [url, depth] = item;

    // Delay between requests (skip for first)
    if (pages.length > 0) await sleep(DELAY_MS);

    const html = await fetchText(url);
    if (!html) continue;

    // Skip noindex pages
    if (hasNoIndex(html)) continue;

    const title = extractTitle(html) ?? titleFromPath(new URL(url).pathname);
    pages.push({ url, title });

    if (depth < MAX_DEPTH) {
      const links = extractLinks(html, origin);
      for (const link of links) {
        if (!visited.has(link)) {
          try {
            const u = new URL(link);
            if (!isBlocked(u.pathname, disallowed)) {
              visited.add(link);
              queue.push([link, depth + 1]);
            }
          } catch {
            // ignore
          }
        }
      }
    }
  }

  return pages;
}

// ── llms.txt builder ──────────────────────────────────────────────────────────

function buildLlmsTxt(host: string, pages: PageEntry[], source: Source): string {
  const pageCount = pages.length;
  const lines: string[] = [];

  lines.push(`# ${host}`);
  lines.push('');
  lines.push(`> ${pageCount} page${pageCount !== 1 ? 's' : ''} · source: ${source} · generated by @ahtmljs/cli ${CLI_VERSION}`);
  lines.push('');
  lines.push('## Pages');
  lines.push('');

  for (const p of pages) {
    const desc = p.description ? `: ${p.description}` : '';
    lines.push(`- [${p.title}](${p.url})${desc}`);
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`Generated by AHTML (https://github.com/DibbayajyotiRoy/AHTML) from ${source}`);
  lines.push('');

  return lines.join('\n');
}

// ── Progress logging ──────────────────────────────────────────────────────────

function log(msg: string): void {
  process.stderr.write(`[ahtml llms] ${msg}\n`);
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function runLlms(url: string, flags: { out?: string }): Promise<number> {
  // 1. Normalize URL, extract origin
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    process.stderr.write(`error: invalid URL "${url}"\n`);
    return 1;
  }
  const origin = parsedUrl.origin;
  const host = parsedUrl.host;

  // 2. Fetch robots.txt (suppress errors)
  log('Fetching robots.txt...');
  const robotsTxt = await fetchText(`${origin}/robots.txt`);
  const disallowed = robotsTxt ? parseRobots(robotsTxt) : new Set<string>();
  if (disallowed.size > 0) {
    log(`robots.txt: ${disallowed.size} disallowed path prefix(es)`);
  }

  // 3. Try crawling strategies in order
  let pages: PageEntry[] | null = null;
  let source: Source = 'single page';

  // Strategy 1: AHTML manifest
  log('Checking AHTML manifest...');
  pages = await tryAhtmlManifest(origin, disallowed);
  if (pages) {
    source = 'AHTML manifest';
    log(`Found ${pages.length} route${pages.length !== 1 ? 's' : ''} in /.well-known/ahtml.json`);
  }

  // Strategy 2: Sitemap
  if (!pages) {
    log('Checking sitemap.xml...');
    pages = await trySitemap(origin, disallowed);
    if (pages) {
      source = 'sitemap.xml';
      log(`Found ${pages.length} URL${pages.length !== 1 ? 's' : ''} in sitemap`);
    }
  }

  // Strategy 3: BFS crawl
  if (!pages) {
    log('No sitemap found — starting BFS crawl (max 30 pages, depth 3)...');
    const crawled = await bfsCrawl(url, origin, disallowed);
    if (crawled.length > 0) {
      pages = crawled;
      source = 'BFS crawl';
      log(`BFS crawl found ${pages.length} page${pages.length !== 1 ? 's' : ''}`);
    }
  }

  // Strategy 4: Single page fallback
  if (!pages) {
    log('Falling back to single page');
    const title = await fetchText(url)
      .then((html) => (html ? extractTitle(html) : null))
      .catch(() => null);
    pages = [{ url, title: title ?? titleFromPath(parsedUrl.pathname) }];
    source = 'single page';
  }

  log(`Generating llms.txt for ${host} (${pages.length} page${pages.length !== 1 ? 's' : ''})`);

  // 4. Build llms.txt string
  const output = buildLlmsTxt(host, pages, source);

  // 5. Write to stdout or --out file
  if (flags.out) {
    try {
      await writeFile(flags.out, output, 'utf8');
      log(`Written to ${flags.out}`);
    } catch (err) {
      process.stderr.write(`error: could not write to "${flags.out}" — ${(err as Error)?.message ?? String(err)}\n`);
      return 1;
    }
  } else {
    process.stdout.write(output);
  }

  return 0;
}

// ── Utility ───────────────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

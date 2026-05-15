export type CheckResult = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
  weight: number;
};

export type ScoreReport = {
  url: string;
  score: number;
  maxScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  checks: CheckResult[];
  fetchedAt: string;
};

const TIMEOUT_MS = 6000;

function withTimeout(input: string, init?: RequestInit) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  return fetch(input, { ...init, signal: ac.signal, redirect: 'follow' }).finally(() => clearTimeout(t));
}

function safeOrigin(url: URL): string {
  return `${url.protocol}//${url.host}`;
}

function gradeFor(score: number): ScoreReport['grade'] {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 55) return 'C';
  if (score >= 35) return 'D';
  return 'F';
}

function isPrivateHost(host: string): boolean {
  const h = (host.toLowerCase().split(':')[0] ?? '');
  if (!h) return true;
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0') return true;
  if (h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  return false;
}

export async function scoreUrl(raw: string): Promise<ScoreReport> {
  let url: URL;
  try {
    url = new URL(raw.includes('://') ? raw : `https://${raw}`);
  } catch {
    throw new Error('Invalid URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http/https URLs are supported');
  if (isPrivateHost(url.host)) throw new Error('Private and loopback hosts are not allowed');

  const origin = safeOrigin(url);
  const checks: CheckResult[] = [];

  // 1. Fetch the page
  let pageHtml = '';
  let pageOk = false;
  try {
    const res = await withTimeout(url.toString(), { headers: { 'user-agent': 'AHTMLAgentReadinessBot/0.1 (+https://ahtml.dev)' } });
    pageOk = res.ok;
    pageHtml = pageOk ? await res.text() : '';
  } catch {
    pageOk = false;
  }
  if (!pageOk) {
    throw new Error('Could not fetch the page (timeout, blocked, or non-2xx response).');
  }

  // Cap HTML size we scan to keep regex cheap
  const html = pageHtml.slice(0, 800_000);

  // 2. AHTML manifest
  let manifestOk = false;
  try {
    const r = await withTimeout(`${origin}/.well-known/ahtml.json`);
    manifestOk = r.ok && (r.headers.get('content-type') || '').includes('json');
  } catch { /* ignore */ }
  checks.push({
    id: 'ahtml-manifest',
    label: 'AHTML site manifest at /.well-known/ahtml.json',
    passed: manifestOk,
    weight: 25,
    detail: manifestOk
      ? 'Found — agents discover your site through this single trusted entry point.'
      : 'Missing. Installing @ahtmljs/next adds this in three minutes.',
  });

  // 3. llms.txt
  let llmsOk = false;
  try {
    const r = await withTimeout(`${origin}/llms.txt`);
    llmsOk = r.ok && (r.headers.get('content-type') || '').startsWith('text/');
  } catch { /* ignore */ }
  checks.push({
    id: 'llms-txt',
    label: '/llms.txt index file',
    passed: llmsOk,
    weight: 15,
    detail: llmsOk
      ? 'Found — LLM crawlers have a curated map of your site.'
      : 'Missing. Even a 20-line llms.txt helps AI Overview and Perplexity find your best pages.',
  });

  // 4. JSON-LD on the homepage
  const jsonLdCount = (html.match(/<script[^>]+application\/ld\+json[^>]*>/gi) || []).length;
  checks.push({
    id: 'json-ld',
    label: 'Schema.org JSON-LD on the page',
    passed: jsonLdCount > 0,
    weight: 15,
    detail: jsonLdCount > 0
      ? `Found ${jsonLdCount} JSON-LD block${jsonLdCount > 1 ? 's' : ''} — search engines and AI extract typed entities.`
      : 'No JSON-LD found. Add at least an Organization + SoftwareApplication / Product block.',
  });

  // 5. Open Graph
  const ogCount = (html.match(/<meta[^>]+property=["']og:/gi) || []).length;
  checks.push({
    id: 'open-graph',
    label: 'Open Graph tags (og:title, og:description, og:image)',
    passed: ogCount >= 3,
    weight: 8,
    detail: ogCount >= 3
      ? `Found ${ogCount} OG tags — social previews and many crawlers use these.`
      : 'Fewer than 3 OG tags. Set og:title, og:description, og:image, og:url at minimum.',
  });

  // 6. Canonical
  const canonicalOk = /<link[^>]+rel=["']canonical["']/i.test(html);
  checks.push({
    id: 'canonical',
    label: 'Canonical link tag',
    passed: canonicalOk,
    weight: 5,
    detail: canonicalOk
      ? 'Found — search engines know which URL is authoritative.'
      : 'Missing. Without it, duplicate URLs split your ranking signal.',
  });

  // 7. Meta description
  const descOk = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']{40,})["']/i.test(html);
  checks.push({
    id: 'meta-description',
    label: 'Meta description (≥40 chars)',
    passed: descOk,
    weight: 5,
    detail: descOk
      ? 'Found — and long enough to render as a useful SERP snippet.'
      : 'Missing or too short. Aim for 120–160 chars that summarize the page.',
  });

  // 8. sitemap.xml
  let sitemapOk = false;
  try {
    const r = await withTimeout(`${origin}/sitemap.xml`);
    sitemapOk = r.ok;
  } catch { /* ignore */ }
  checks.push({
    id: 'sitemap',
    label: '/sitemap.xml',
    passed: sitemapOk,
    weight: 8,
    detail: sitemapOk
      ? 'Found — submit it to Google Search Console for fastest indexation.'
      : 'Missing. Without a sitemap, large sites take weeks to fully index.',
  });

  // 9. robots.txt + AI crawlers welcome
  let robotsWelcoming = false;
  let robotsExists = false;
  try {
    const r = await withTimeout(`${origin}/robots.txt`);
    if (r.ok) {
      robotsExists = true;
      const body = (await r.text()).toLowerCase();
      const blocksAi = /user-agent:\s*(gptbot|claudebot|perplexitybot|google-extended|ccbot|anthropic-ai)[\s\S]*?disallow:\s*\//i.test(body);
      robotsWelcoming = !blocksAi;
    }
  } catch { /* ignore */ }
  checks.push({
    id: 'robots',
    label: 'robots.txt does not block major AI crawlers',
    passed: robotsExists && robotsWelcoming,
    weight: 10,
    detail: !robotsExists
      ? 'No robots.txt. Add one to control crawl + signal AI crawler policy.'
      : robotsWelcoming
        ? 'robots.txt allows GPTBot, ClaudeBot, PerplexityBot, Google-Extended.'
        : 'robots.txt blocks at least one major AI crawler. Confirm that is intentional.',
  });

  // 10. MCP / OpenAPI endpoints (bonus)
  let mcpOk = false;
  try {
    const r = await withTimeout(`${origin}/ahtml/mcp.json`);
    mcpOk = r.ok;
  } catch { /* ignore */ }
  checks.push({
    id: 'mcp',
    label: 'MCP descriptor at /ahtml/mcp.json',
    passed: mcpOk,
    weight: 9,
    detail: mcpOk
      ? 'Found — Claude, ChatGPT, and other MCP clients can connect directly.'
      : 'Missing. Installing @ahtmljs/next adds an MCP descriptor automatically.',
  });

  const maxScore = checks.reduce((a, c) => a + c.weight, 0);
  const score = checks.reduce((a, c) => a + (c.passed ? c.weight : 0), 0);

  return {
    url: url.toString(),
    score,
    maxScore,
    grade: gradeFor((score / maxScore) * 100),
    checks,
    fetchedAt: new Date().toISOString(),
  };
}

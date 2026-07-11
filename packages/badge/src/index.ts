/**
 * @ahtmljs/badge — hosted score badge (ROADMAP Feature 3b, TASKS.md T3.4).
 *
 * A fetch-handler service (Cloudflare Worker / any WinterCG runtime):
 *
 *   GET /badge?url=<site>   → README-embeddable SVG badge
 *   GET /report?url=<site>  → the full JSON score report the badge links to
 *
 * Scoring is IMPORTED from the CLI's `computeScore` — the single scoring
 * implementation — never reimplemented, so the badge is byte-identical to a
 * local `ahtml score` for the same URL.
 *
 * Cache: per-URL, expiring on the target snapshot's own TTL (read from the
 * site's /ahtml endpoint on cache miss; default 300 s when unavailable).
 * Rate limit: fixed-window per client IP. Both stores are injectable
 * in-memory Maps so the worker stays dependency-free and testable.
 */
import { computeScore, type ScoreResult } from '@ahtmljs/cli/score';

export interface BadgeOptions {
  /** Injectable scorer (tests). Defaults to the canonical computeScore. */
  score?: (url: string) => Promise<ScoreResult>;
  /** Injectable fetch used to read the target snapshot's TTL. */
  fetch?: typeof fetch;
  /** Injectable clock (ms). */
  now?: () => number;
  /** Requests allowed per IP per window. Default 30. */
  rateLimit?: number;
  /** Rate-limit window in ms. Default 60_000. */
  rateWindowMs?: number;
  /** Fallback cache TTL (s) when the target exposes none. Default 300. */
  defaultTtl?: number;
}

interface CacheEntry {
  result: ScoreResult;
  expiresAt: number;
}

const GRADE_COLORS: Record<string, string> = {
  'A+': '#3fb950', A: '#3fb950', B: '#90c978', C: '#d4a72c', D: '#e8804c', F: '#f85149',
};

/** Shields-style flat SVG. Pure function of score+grade — snapshot-testable. */
export function renderBadgeSvg(result: Pick<ScoreResult, 'score' | 'grade'>): string {
  const label = 'ahtml score';
  const value = `${result.score}/100 ${result.grade}`;
  const color = GRADE_COLORS[result.grade] ?? '#8b949e';
  const labelW = 6 * label.length + 12;
  const valueW = 6 * value.length + 12;
  const w = labelW + valueW;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${label}: ${value}">` +
    `<rect width="${labelW}" height="20" fill="#555"/>` +
    `<rect x="${labelW}" width="${valueW}" height="20" fill="${color}"/>` +
    `<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">` +
    `<text x="${labelW / 2}" y="14">${label}</text>` +
    `<text x="${labelW + valueW / 2}" y="14">${value}</text>` +
    `</g></svg>`
  );
}

async function snapshotTtl(target: string, fetchImpl: typeof fetch, fallback: number): Promise<number> {
  try {
    const origin = new URL(target).origin;
    const res = await fetchImpl(`${origin}/ahtml`, {
      headers: { accept: 'application/ahtml+json' },
    });
    if (res.ok) {
      const snap = (await res.json()) as { ttl?: number };
      if (typeof snap.ttl === 'number' && snap.ttl > 0) return snap.ttl;
    }
  } catch {
    /* target has no parsable snapshot — fall back */
  }
  return fallback;
}

export function createBadgeHandler(options: BadgeOptions = {}) {
  const score = options.score ?? computeScore;
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const limit = options.rateLimit ?? 30;
  const windowMs = options.rateWindowMs ?? 60_000;
  const defaultTtl = options.defaultTtl ?? 300;

  const cache = new Map<string, CacheEntry>();
  const hits = new Map<string, { windowStart: number; count: number }>();

  function rateLimited(ip: string): boolean {
    const t = now();
    const bucket = hits.get(ip);
    if (!bucket || t - bucket.windowStart >= windowMs) {
      hits.set(ip, { windowStart: t, count: 1 });
      return false;
    }
    bucket.count += 1;
    return bucket.count > limit;
  }

  async function scored(target: string): Promise<{ result: ScoreResult; cached: boolean }> {
    const entry = cache.get(target);
    if (entry && entry.expiresAt > now()) return { result: entry.result, cached: true };
    const result = await score(target);
    const ttl = await snapshotTtl(target, fetchImpl, defaultTtl);
    cache.set(target, { result, expiresAt: now() + ttl * 1000 });
    return { result, cached: false };
  }

  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const target = url.searchParams.get('url');
    const ip =
      request.headers.get('cf-connecting-ip') ??
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      'unknown';

    if (url.pathname !== '/badge' && url.pathname !== '/report') {
      return new Response('Not found. Endpoints: /badge?url=…, /report?url=…', { status: 404 });
    }
    if (!target || !/^https?:\/\//.test(target)) {
      return new Response('missing or invalid ?url=', { status: 400 });
    }
    if (rateLimited(ip)) {
      return new Response('rate limit exceeded', {
        status: 429,
        headers: { 'retry-after': String(Math.ceil(windowMs / 1000)) },
      });
    }

    let outcome: { result: ScoreResult; cached: boolean };
    try {
      outcome = await scored(target);
    } catch (err) {
      return new Response(`scoring failed: ${err instanceof Error ? err.message : String(err)}`, {
        status: 502,
      });
    }

    if (url.pathname === '/report') {
      return new Response(JSON.stringify(outcome.result, null, 2), {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'x-ahtml-badge-cache': outcome.cached ? 'hit' : 'miss',
        },
      });
    }
    return new Response(renderBadgeSvg(outcome.result), {
      headers: {
        'content-type': 'image/svg+xml; charset=utf-8',
        'cache-control': 'public, max-age=300',
        'x-ahtml-badge-cache': outcome.cached ? 'hit' : 'miss',
        link: `<${url.origin}/report?url=${encodeURIComponent(target)}>; rel="describedby"`,
      },
    });
  };
}

/** README-embeddable markdown for a badge (used by `ahtml badge <url>`). */
export function badgeMarkdown(serviceOrigin: string, siteUrl: string): string {
  const badge = `${serviceOrigin}/badge?url=${encodeURIComponent(siteUrl)}`;
  const report = `${serviceOrigin}/report?url=${encodeURIComponent(siteUrl)}`;
  return `[![AHTML score](${badge})](${report})`;
}

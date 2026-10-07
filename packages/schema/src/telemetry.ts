/**
 * Anonymous runtime usage analytics (PostHog). Zero dependencies, never throws,
 * never blocks the host app. See README "Usage analytics" for exactly what is sent.
 *
 *   track('@ahtmljs/schema', VERSION, 'snapshot.build');   // counter bump, cheap
 *
 * Events are aggregated in memory per pkg+event and flushed in batches. Only the
 * feature name, a count, package/runtime/OS/arch/CI facts and an anonymous install
 * id leave the process: no hostnames, paths, URLs, arguments or page content.
 */

// PostHog EU Cloud ingestion host + project key. The key is a write-only ingestion
// token (it can create events, not read anything), so it is safe to ship publicly.
const POSTHOG_HOST = 'https://eu.i.posthog.com';
const POSTHOG_KEY = 'phc_qyHT2aRErEuTFcwGZyjju6izT2EfEUWEApqtjigLPAGH';

const MAX_KEYS = 500;
const MAX_PER_POST = 50;
const FIRST_FLUSH_MS = 2_000;
const INTERVAL_MS = 60_000;
const TIMEOUT_MS = 1_500;
const EVENT_NAME = /^[a-z0-9_.:-]{1,64}$/;
const PKG_NAME = /^[@a-z0-9_./-]{1,64}$/;
const VERSION_STR = /^[0-9a-z.+-]{1,32}$/i;

export interface TelemetryEvent {
  event: string;
  distinct_id: string;
  properties: Record<string, unknown>;
  timestamp: string;
}
export interface TelemetryBatch {
  api_key: string;
  batch: TelemetryEvent[];
}
export type TelemetryTransport = (url: string, body: TelemetryBatch) => unknown;

interface Agg {
  pkg: string;
  ver: string;
  event: string;
  n: number;
  last: number;
}

const agg = new Map<string, Agg>();
let transport: TelemetryTransport | null = null;
let started = false;
let chain: Promise<void> = Promise.resolve();
let envP: Promise<{ id: string; props: Record<string, unknown> }> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

/** Record one use of a feature. Synchronous, O(1), never throws. */
export function track(pkg: string, version: string, event: string, n = 1): void {
  try {
    if (!EVENT_NAME.test(event) || !PKG_NAME.test(pkg) || !VERSION_STR.test(version)) return;
    const count = Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
    const key = pkg + '|' + event;
    const cur = agg.get(key);
    const now = Date.now();
    if (cur) {
      cur.n += count;
      cur.last = now;
      cur.ver = version;
    } else if (agg.size < MAX_KEYS) {
      agg.set(key, { pkg, ver: version, event, n: count, last: now });
    }
    start();
  } catch {
    /* telemetry must never affect the host app */
  }
}

/** Send everything pending now (CLI calls this before process.exit). Never rejects. */
export function flushTelemetry(): Promise<void> {
  // Chained so a caller awaiting a flush also waits for any flush already in flight.
  return (chain = chain.then(doFlush));
}

/** Test hook: replace the network transport (null restores the default). */
export function _setTelemetryTransport(fn: TelemetryTransport | null): void {
  transport = fn;
}

function start(): void {
  if (started) return;
  started = true;
  unref(setTimeout(() => void flushTelemetry(), FIRST_FLUSH_MS));
  unref(setInterval(() => void flushTelemetry(), INTERVAL_MS));
  if (typeof g.process?.on === 'function') g.process.on('beforeExit', () => void flushTelemetry());
}

// Timers must never keep a process alive: Node/Bun return an object with unref(),
// Deno returns a number and needs Deno.unrefTimer.
function unref(t: unknown): void {
  try {
    if (t && typeof (t as { unref?: unknown }).unref === 'function') (t as { unref(): void }).unref();
    else if (typeof t === 'number') g.Deno?.unrefTimer?.(t);
  } catch {
    /* ignore */
  }
}

async function doFlush(): Promise<void> {
  try {
    if (!agg.size) return;
    const items = [...agg.values()];
    agg.clear();
    const { id, props } = await getEnv();
    const events: TelemetryEvent[] = items.map((a) => ({
      event: a.event,
      distinct_id: id,
      properties: {
        pkg: a.pkg,
        pkg_version: a.ver,
        count: a.n,
        ...props,
        $process_person_profile: false,
        $geoip_disable: true,
        $lib: 'ahtml',
      },
      timestamp: new Date(a.last).toISOString(),
    }));
    const send = transport ?? defaultTransport;
    for (let i = 0; i < events.length; i += MAX_PER_POST) {
      try {
        await send(POSTHOG_HOST + '/batch/', {
          api_key: POSTHOG_KEY,
          batch: events.slice(i, i + MAX_PER_POST),
        });
      } catch {
        /* drop the batch */
      }
    }
  } catch {
    /* drop */
  }
}

async function defaultTransport(url: string, body: TelemetryBatch): Promise<void> {
  // Test-run suppression (not a user opt-out): node:test sets NODE_TEST_CONTEXT in
  // every test-file subprocess, so our own test suites never emit real analytics.
  if (g.process?.env?.NODE_TEST_CONTEXT) return;
  if (typeof g.fetch !== 'function') return;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await g.fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    await res.text(); // drain so the connection is released
  } finally {
    clearTimeout(timer);
  }
}

function getEnv(): Promise<{ id: string; props: Record<string, unknown> }> {
  return (envP ??= detectEnv().catch(() => ({
    id: randomHex(16),
    props: { runtime: 'unknown', runtime_version: 'unknown', os: 'unknown', arch: 'unknown', ci: false },
  })));
}

async function detectEnv(): Promise<{ id: string; props: Record<string, unknown> }> {
  const p = g.process;
  const nodeV = p?.versions?.node;
  let runtime = 'unknown';
  let rv = 'unknown';
  if (g.Deno?.version?.deno) {
    runtime = 'deno';
    rv = g.Deno.version.deno;
  } else if (p?.versions?.bun || g.Bun?.version) {
    runtime = 'bun';
    rv = p?.versions?.bun ?? g.Bun.version;
  } else if (g.navigator?.userAgent === 'Cloudflare-Workers') {
    runtime = 'workerd';
  } else if (typeof nodeV === 'string') {
    runtime = 'node';
    rv = nodeV;
  } else if (typeof g.window !== 'undefined' || typeof g.document !== 'undefined') {
    runtime = 'browser';
  }
  const e = p?.env ?? {};
  const props = {
    runtime,
    runtime_version: String(rv).slice(0, 32),
    os: String(p?.platform ?? 'unknown').slice(0, 16),
    arch: String(p?.arch ?? 'unknown').slice(0, 16),
    ci: !!(e.CI || e.GITHUB_ACTIONS || e.GITLAB_CI || e.BUILDKITE || e.CIRCLECI),
  };
  // Anonymous install id: a one-way hash of host+cwd, so the same checkout reports
  // as one install without the raw hostname/path ever being sent. Random where there
  // is no filesystem identity (browser, workerd).
  let id = '';
  if (typeof nodeV === 'string' && runtime !== 'workerd' && typeof p.cwd === 'function') {
    try {
      // Non-literal specifiers + ignore comments keep browser/worker bundlers from
      // trying to resolve node builtins; this path only runs on Node/Bun/Deno.
      const osSpec = 'node:os';
      const os = await import(/* webpackIgnore: true */ /* @vite-ignore */ osSpec);
      id = (await sha256Hex(`${os.hostname()}|${p.cwd()}|ahtml-v1`)).slice(0, 16);
    } catch {
      /* fall through to random */
    }
  }
  return { id: id || randomHex(16), props };
}

async function sha256Hex(s: string): Promise<string> {
  const subtle = g.crypto?.subtle;
  if (subtle) {
    const buf = new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(s)));
    return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  const cryptoSpec = 'node:crypto'; // Node 18 has no global crypto
  const nc = await import(/* webpackIgnore: true */ /* @vite-ignore */ cryptoSpec);
  return nc.createHash('sha256').update(s).digest('hex');
}

function randomHex(len: number): string {
  let out = '';
  try {
    const bytes = new Uint8Array(len / 2);
    g.crypto.getRandomValues(bytes);
    for (const b of bytes) out += b.toString(16).padStart(2, '0');
  } catch {
    out = '';
  }
  while (out.length < len) out += Math.floor(Math.random() * 16).toString(16);
  return out;
}

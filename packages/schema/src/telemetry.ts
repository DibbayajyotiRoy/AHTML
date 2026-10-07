/**
 * Anonymous runtime usage analytics (PostHog). Zero dependencies, never throws,
 * never blocks the host app. See README "Usage analytics" for exactly what is sent.
 *
 *   track('@ahtmljs/schema', VERSION, 'snapshot.build');   // counter bump, cheap
 *
 * Events are aggregated in memory per pkg+event and flushed in batches. Only the
 * feature name, a count, package/runtime/OS/arch facts, coarse environment class
 * (CI/build/serverless/...; derived from env-var PRESENCE, never their values) and
 * an anonymous install id leave the process: no hostnames, paths, URLs, arguments
 * or page content.
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
let envP: Promise<EnvInfo> | null = null;
let sid = ''; // $session_id: one UUIDv7 per process
let cliSeen = false; // this process runs the ahtml CLI (decides env_class cli_interactive)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

/** Record one use of a feature. Synchronous, O(1), never throws. */
export function track(pkg: string, version: string, event: string, n = 1): void {
  try {
    if (!EVENT_NAME.test(event) || !PKG_NAME.test(pkg) || !VERSION_STR.test(version)) return;
    const count = Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
    const key = pkg + '|' + event;
    const cur = agg.get(key);
    if (pkg === '@ahtmljs/cli') cliSeen = true;
    // PostHog needs the UUIDv7 time <= the session's first event time, so mint it before `now`.
    // ponytail: one id per process; events >24h after start drop out of PostHog session
    // aggregations (their own 24h rule). Rotate here if long-lived servers matter.
    sid ||= uuidv7();
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
    const { id, base, env, flags } = await getEnv();
    // Classified at flush from live env-var presence (cheap); values are never copied out.
    const cls = classifyEnv(env, { ...flags, cli: cliSeen });
    const events: TelemetryEvent[] = items.map((a) => ({
      event: a.event,
      distinct_id: id,
      properties: {
        pkg: a.pkg,
        pkg_version: a.ver,
        count: a.n,
        ...base,
        ...cls,
        $session_id: sid,
        // Anonymous person profile keyed by the anonymous install id (cohorts, retention).
        $process_person_profile: true,
        $set: {
          last_env_class: cls.env_class,
          last_runtime: base.runtime,
          last_pkg_version: a.ver,
          last_os: base.os,
        },
        $set_once: {
          first_env_class: cls.env_class,
          first_pkg: a.pkg,
          first_pkg_version: a.ver,
          first_runtime: base.runtime,
          first_seen_os: base.os,
        },
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

type EnvLike = Record<string, string | undefined>;

interface EnvInfo {
  id: string;
  /** Static facts: runtime, runtime_version, os, arch. */
  base: Record<string, unknown>;
  /** Live reference to process.env (or {}); only key PRESENCE is ever read out of it. */
  env: EnvLike;
  flags: Omit<EnvFlags, 'cli'>;
}

export interface EnvFlags {
  runtime: string;
  /** The process runs the ahtml CLI. */
  cli: boolean;
  tty: boolean;
  container: boolean;
}

export interface EnvClassification {
  env_class: string;
  ci: boolean;
  ci_provider: string;
  hosting: string;
  is_tty: boolean;
  is_container: boolean;
  node_env: string;
  package_manager: string;
}

const BUILD_EVENTS = new Set(['build', 'prebuild', 'postbuild', 'generate', 'export', 'prepare', 'prepack', 'prepublishOnly']);
const DEV_EVENTS = new Set(['dev', 'start:dev', 'serve', 'watch']);
const PACKAGE_MANAGERS = new Set(['npm', 'pnpm', 'yarn', 'bun']);

/**
 * Pure classification from env-var PRESENCE (never values) plus a few flags. Exported
 * for tests; every output is a value from a fixed enum, so no env value can leak.
 */
export function classifyEnv(e: EnvLike, f: EnvFlags): EnvClassification {
  const has = (...ks: string[]): boolean => ks.some((k) => e[k] !== undefined && e[k] !== '');
  const genericCi = has('CI') && e.CI !== 'false' && e.CI !== '0';
  // Platform CIs (Vercel/Netlify/Cloudflare Pages/Render) set the platform var at runtime
  // too, but CI only at build time, so they count as CI only together with CI.
  const ci_provider = has('GITHUB_ACTIONS') ? 'github_actions'
    : has('GITLAB_CI') ? 'gitlab'
    : has('CIRCLECI') ? 'circleci'
    : has('BUILDKITE') ? 'buildkite'
    : has('JENKINS_URL') ? 'jenkins'
    : has('TRAVIS') ? 'travis'
    : has('TF_BUILD') ? 'azure_pipelines'
    : has('BITBUCKET_BUILD_NUMBER') ? 'bitbucket'
    : has('CODEBUILD_BUILD_ID') ? 'aws_codebuild'
    : genericCi && has('VERCEL') ? 'vercel'
    : genericCi && has('NETLIFY') ? 'netlify'
    : genericCi && has('CF_PAGES') ? 'cloudflare_pages'
    : genericCi && has('RENDER') ? 'render'
    : genericCi ? 'other_ci'
    : 'none';
  const ci = ci_provider !== 'none';

  const hosting = has('VERCEL') ? 'vercel'
    : has('NETLIFY') ? 'netlify'
    : f.runtime === 'workerd' || has('CF_PAGES') ? 'cloudflare'
    : has('AWS_LAMBDA_FUNCTION_NAME') ? 'aws_lambda'
    : has('K_SERVICE') ? 'cloud_run'
    : has('FLY_APP_NAME') ? 'fly'
    : has('RAILWAY_ENVIRONMENT', 'RAILWAY_PROJECT_ID') ? 'railway'
    : has('RENDER') ? 'render'
    : has('DYNO') ? 'heroku'
    : 'none';

  const life = e.npm_lifecycle_event ?? '';
  // Order matters (first match wins); build/CI are checked before serverless so a
  // platform's build container is not mistaken for its runtime.
  const env_class = has('VITEST', 'JEST_WORKER_ID', 'MOCHA', 'AVA') ? 'test'
    : ci ? 'ci'
    : BUILD_EVENTS.has(life) || e.NEXT_PHASE === 'phase-production-build' ? 'build'
    : has('AWS_LAMBDA_FUNCTION_NAME', 'K_SERVICE', 'FUNCTIONS_WORKER_RUNTIME') ||
        (has('VERCEL') && has('VERCEL_ENV') && e.VERCEL_ENV !== 'development') ||
        (has('NETLIFY') && !has('NETLIFY_DEV')) ||
        f.runtime === 'workerd' ? 'serverless'
    : f.runtime === 'browser' ? 'browser'
    : f.cli && f.tty ? 'cli_interactive'
    : e.NODE_ENV === 'development' || DEV_EVENTS.has(life) ? 'dev'
    : e.NODE_ENV === 'production' ? 'server'
    : 'unknown';

  const ne = e.NODE_ENV;
  const node_env = ne === 'development' || ne === 'production' || ne === 'test' ? ne : ne ? 'other' : 'unset';
  // npm_config_user_agent is "<pm>/<version> node/... " - keep the allow-listed name only.
  const pm = String(e.npm_config_user_agent ?? '').trim().split(/[/\s]/)[0] ?? '';
  const package_manager = PACKAGE_MANAGERS.has(pm) ? pm : 'unknown';

  return { env_class, ci, ci_provider, hosting, is_tty: f.tty, is_container: f.container, node_env, package_manager };
}

function getEnv(): Promise<EnvInfo> {
  return (envP ??= detectEnv().catch(() => ({
    id: randomHex(16),
    base: { runtime: 'unknown', runtime_version: 'unknown', os: 'unknown', arch: 'unknown' },
    env: {},
    flags: { runtime: 'unknown', tty: false, container: false },
  })));
}

async function detectEnv(): Promise<EnvInfo> {
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
  const env: EnvLike = p?.env ?? {};
  let tty = false;
  try {
    if (runtime === 'node' || runtime === 'bun') tty = !!p?.stdout?.isTTY;
    else if (runtime === 'deno') tty = !!g.Deno?.stdout?.isTerminal?.();
  } catch {
    /* not a TTY we can see */
  }
  let container = !!env.KUBERNETES_SERVICE_HOST;
  if (!container && runtime === 'node') {
    try {
      const fsSpec = 'node:fs';
      const fs = await import(/* webpackIgnore: true */ /* @vite-ignore */ fsSpec);
      container = !!fs.existsSync('/.dockerenv');
    } catch {
      /* no fs */
    }
  }
  const base = {
    runtime,
    runtime_version: String(rv).slice(0, 32),
    os: String(p?.platform ?? 'unknown').slice(0, 16),
    arch: String(p?.arch ?? 'unknown').slice(0, 16),
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
  return { id: id || randomHex(16), base, env, flags: { runtime, tty, container } };
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

/** RFC 9562 UUIDv7: 48-bit unix-ms timestamp + version 7 + variant 10 + random. */
function uuidv7(): string {
  const t = Date.now().toString(16).padStart(12, '0');
  const r = randomHex(20);
  const v = '89ab'.charAt(parseInt(r.charAt(3), 16) & 3);
  return `${t.slice(0, 8)}-${t.slice(8)}-7${r.slice(0, 3)}-${v}${r.slice(4, 7)}-${r.slice(7, 19)}`;
}

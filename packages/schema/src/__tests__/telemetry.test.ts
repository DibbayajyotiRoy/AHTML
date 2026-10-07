import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { hostname } from 'node:os';
import {
  track,
  flushTelemetry,
  classifyEnv,
  _setTelemetryTransport,
  type EnvFlags,
  type TelemetryBatch,
} from '../telemetry.js';
import { AHTMLError, makeError } from '../errors.js';
import { InvalidDiffError } from '../diff.js';

const PKG = '@ahtmljs/schema';

/** Install a capturing transport; returns the POSTs it receives. */
function capture(): { url: string; body: TelemetryBatch }[] {
  const posts: { url: string; body: TelemetryBatch }[] = [];
  _setTelemetryTransport((url, body) => {
    posts.push({ url, body });
  });
  return posts;
}

/** Drain anything pending (other tests' leftovers) into a throwaway transport. */
async function drain(): Promise<void> {
  _setTelemetryTransport(() => {});
  await flushTelemetry();
}

afterEach(async () => {
  await drain();
  _setTelemetryTransport(null);
});

test('aggregates repeated events per pkg+event into one PostHog event', async () => {
  await drain();
  const posts = capture();
  track(PKG, '1.1.0', 'agg.a');
  track(PKG, '1.1.0', 'agg.a');
  track(PKG, '1.1.0', 'agg.a', 3);
  track(PKG, '1.1.0', 'agg.b');
  await flushTelemetry();

  assert.equal(posts.length, 1);
  const byName = Object.fromEntries(posts[0]!.body.batch.map((e) => [e.event, e]));
  assert.equal(Object.keys(byName).length, 2);
  assert.equal(byName['agg.a']!.properties.count, 5);
  assert.equal(byName['agg.b']!.properties.count, 1);

  // Nothing left: a second flush sends nothing.
  await flushTelemetry();
  assert.equal(posts.length, 1);
});

test('payload matches the PostHog /batch/ contract and is anonymous', async () => {
  await drain();
  const posts = capture();
  track(PKG, '1.1.0', 'shape.check');
  await flushTelemetry();

  const { url, body } = posts[0]!;
  assert.equal(url, 'https://eu.i.posthog.com/batch/');
  assert.match(body.api_key, /^phc_[A-Za-z0-9]+$/);
  assert.equal(body.batch.length, 1);

  const ev = body.batch[0]!;
  assert.equal(ev.event, 'shape.check');
  assert.match(ev.distinct_id, /^[0-9a-f]{16}$/);
  assert.ok(!Number.isNaN(Date.parse(ev.timestamp)));

  const p = ev.properties;
  assert.equal(p.pkg, PKG);
  assert.equal(p.pkg_version, '1.1.0');
  assert.equal(p.count, 1);
  assert.equal(p.runtime, 'node');
  assert.equal(p.runtime_version, process.versions.node);
  assert.equal(p.os, process.platform);
  assert.equal(p.arch, process.arch);
  assert.equal(typeof p.ci, 'boolean');
  assert.equal(p.$process_person_profile, true);
  assert.ok(!('$geoip_disable' in p), '$geoip_disable must not be sent');
  assert.ok(!('$ip' in p), '$ip must not be sent');
  assert.equal(p.$lib, 'ahtml');
  assert.deepEqual(
    Object.keys(p).sort(),
    [
      '$lib', '$process_person_profile', '$session_id', '$set', '$set_once',
      'arch', 'ci', 'ci_provider', 'count', 'env_class', 'hosting', 'is_container', 'is_tty',
      'node_env', 'os', 'package_manager', 'pkg', 'pkg_version', 'runtime', 'runtime_version',
    ].sort(),
  );

  // No raw hostname / cwd anywhere in the wire payload.
  const wire = JSON.stringify(body);
  assert.ok(!wire.includes(hostname()), 'hostname leaked');
  assert.ok(!wire.includes(process.cwd()), 'cwd leaked');
});

test('distinct_id is stable across flushes in one process', async () => {
  await drain();
  const posts = capture();
  track(PKG, '1.1.0', 'id.one');
  await flushTelemetry();
  track(PKG, '1.1.0', 'id.two');
  await flushTelemetry();
  assert.equal(posts[0]!.body.batch[0]!.distinct_id, posts[1]!.body.batch[0]!.distinct_id);
});

test('invalid event names, package names and versions are dropped', async () => {
  await drain();
  const posts = capture();
  for (const bad of ['', 'Has Upper', 'has space', 'a'.repeat(65), 'slash/name', 'ünï', 'new\nline']) {
    track(PKG, '1.1.0', bad);
  }
  track('Bad Pkg!', '1.1.0', 'ok.name');
  track(PKG, 'not a version!', 'ok.name');
  track(PKG, '1.1.0', 'ok.name'); // the only valid one
  await flushTelemetry();

  assert.equal(posts.length, 1);
  assert.deepEqual(posts[0]!.body.batch.map((e) => e.event), ['ok.name']);
});

test('a throwing or rejecting transport never escapes track() or flushTelemetry()', async () => {
  await drain();
  _setTelemetryTransport(() => {
    throw new Error('sync boom');
  });
  track(PKG, '1.1.0', 'boom.sync');
  await assert.doesNotReject(flushTelemetry());

  _setTelemetryTransport(async () => {
    throw new Error('async boom');
  });
  track(PKG, '1.1.0', 'boom.async');
  await assert.doesNotReject(flushTelemetry());

  // The failed batch was dropped, and telemetry still works afterwards.
  const posts = capture();
  track(PKG, '1.1.0', 'boom.after');
  await flushTelemetry();
  assert.deepEqual(posts.flatMap((p) => p.body.batch.map((e) => e.event)), ['boom.after']);
});

test('track() with garbage arguments does not throw', () => {
  assert.doesNotThrow(() => {
    track(undefined as unknown as string, undefined as unknown as string, undefined as unknown as string);
    track(PKG, '1.1.0', 'garbage.n', Number.NaN);
    track(PKG, '1.1.0', 'garbage.n', -5);
    track(PKG, '1.1.0', 'garbage.n', Infinity);
  });
});

test('splits into at most 50 events per POST', async () => {
  await drain();
  const posts = capture();
  for (let i = 0; i < 120; i++) track(PKG, '1.1.0', `split.e${i}`);
  await flushTelemetry();

  assert.deepEqual(posts.map((p) => p.body.batch.length), [50, 50, 20]);
  const names = new Set(posts.flatMap((p) => p.body.batch.map((e) => e.event)));
  assert.equal(names.size, 120);
});

test('caps in-memory aggregation at 500 distinct keys', async () => {
  await drain();
  const posts = capture();
  for (let i = 0; i < 650; i++) track(PKG, '1.1.0', `cap.e${i}`);
  // Existing keys still aggregate after the cap is hit.
  track(PKG, '1.1.0', 'cap.e0');
  await flushTelemetry();

  const events = posts.flatMap((p) => p.body.batch);
  assert.equal(events.length, 500);
  assert.equal(events.find((e) => e.event === 'cap.e0')!.properties.count, 2);
  assert.ok(!events.some((e) => e.event === 'cap.e600'));
});

test('default transport is a no-op under the node test runner (NODE_TEST_CONTEXT)', async () => {
  await drain();
  _setTelemetryTransport(null); // default transport
  assert.ok(process.env.NODE_TEST_CONTEXT, 'expected node:test to set NODE_TEST_CONTEXT');

  const realFetch = globalThis.fetch;
  const savedCtx = process.env.NODE_TEST_CONTEXT;
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response('{"status":1}', { status: 200 });
  }) as typeof fetch;
  try {
    track(PKG, '1.1.0', 'ctx.suppressed');
    await flushTelemetry();
    assert.equal(calls.length, 0, 'fetch must not be called when NODE_TEST_CONTEXT is set');

    // Outside a test-runner subprocess the same default transport does POST (to PostHog EU).
    delete process.env.NODE_TEST_CONTEXT;
    track(PKG, '1.1.0', 'ctx.live');
    await flushTelemetry();
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, 'https://eu.i.posthog.com/batch/');
    assert.equal(calls[0]!.init.method, 'POST');
    const sent = JSON.parse(calls[0]!.init.body as string) as TelemetryBatch;
    assert.equal(sent.batch[0]!.event, 'ctx.live');
    assert.ok(calls[0]!.init.signal, 'request must carry an AbortSignal timeout');
  } finally {
    globalThis.fetch = realFetch;
    process.env.NODE_TEST_CONTEXT = savedCtx;
  }
});

test('default transport swallows network failures and timeouts', async () => {
  await drain();
  _setTelemetryTransport(null);
  const realFetch = globalThis.fetch;
  const savedCtx = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  // A fetch that only settles when aborted: proves the 1.5s AbortController fires.
  globalThis.fetch = ((_url: string, init: RequestInit) =>
    new Promise((_res, rej) => {
      init.signal!.addEventListener('abort', () => rej(new Error('aborted')));
    })) as typeof fetch;
  try {
    track(PKG, '1.1.0', 'net.hang');
    const t0 = Date.now();
    await assert.doesNotReject(flushTelemetry());
    const took = Date.now() - t0;
    assert.ok(took >= 1000 && took < 4000, `expected ~1.5s abort, took ${took}ms`);
  } finally {
    globalThis.fetch = realFetch;
    process.env.NODE_TEST_CONTEXT = savedCtx;
  }
});

// ---- environment classification -------------------------------------------------

const NODE: EnvFlags = { runtime: 'node', cli: false, tty: false, container: false };
const cls = (env: Record<string, string>, f: Partial<EnvFlags> = {}) => classifyEnv(env, { ...NODE, ...f });

test('env_class precedence: test > ci > build > serverless > browser > cli_interactive > dev > server > unknown', () => {
  // Everything set at once resolves to the top of the ladder, then peel layers off.
  const all: Record<string, string> = {
    VITEST: '1', CI: 'true', npm_lifecycle_event: 'build', AWS_LAMBDA_FUNCTION_NAME: 'fn',
    NODE_ENV: 'development',
  };
  const flags = { cli: true, tty: true };
  assert.equal(cls(all, flags).env_class, 'test');
  for (const k of ['JEST_WORKER_ID', 'MOCHA', 'AVA']) assert.equal(cls({ [k]: '1' }).env_class, 'test');
  delete all.VITEST;
  assert.equal(cls(all, flags).env_class, 'ci');
  delete all.CI;
  assert.equal(cls(all, flags).env_class, 'build');
  assert.equal(cls({ NEXT_PHASE: 'phase-production-build' }).env_class, 'build');
  for (const ev of ['build', 'prebuild', 'postbuild', 'generate', 'export', 'prepare', 'prepack', 'prepublishOnly']) {
    assert.equal(cls({ npm_lifecycle_event: ev }).env_class, 'build', ev);
  }
  delete all.npm_lifecycle_event;
  assert.equal(cls(all, flags).env_class, 'serverless');
  delete all.AWS_LAMBDA_FUNCTION_NAME;
  assert.equal(cls(all, { cli: true, tty: true }).env_class, 'cli_interactive');
  assert.equal(cls(all, { runtime: 'browser', cli: true, tty: true }).env_class, 'browser');
  assert.equal(cls(all).env_class, 'dev'); // NODE_ENV=development, not a CLI tty
  assert.equal(cls({ NODE_ENV: 'production' }, flags).env_class, 'cli_interactive');
  assert.equal(cls({ NODE_ENV: 'production' }).env_class, 'server');
  assert.equal(cls({}).env_class, 'unknown');
  assert.equal(cls({ NODE_ENV: 'staging' }).env_class, 'unknown');
  for (const ev of ['dev', 'start:dev', 'serve', 'watch']) {
    assert.equal(cls({ npm_lifecycle_event: ev }).env_class, 'dev', ev);
  }
  assert.equal(cls({ npm_lifecycle_event: 'start' }).env_class, 'unknown');
});

test('env_class serverless triggers', () => {
  assert.equal(cls({ AWS_LAMBDA_FUNCTION_NAME: 'f' }).env_class, 'serverless');
  assert.equal(cls({ K_SERVICE: 'svc' }).env_class, 'serverless');
  assert.equal(cls({ FUNCTIONS_WORKER_RUNTIME: 'node' }).env_class, 'serverless');
  assert.equal(cls({}, { runtime: 'workerd' }).env_class, 'serverless');
  assert.equal(cls({ VERCEL: '1', VERCEL_ENV: 'production' }).env_class, 'serverless');
  assert.equal(cls({ VERCEL: '1', VERCEL_ENV: 'development' }).env_class, 'unknown'); // `vercel dev`
  assert.equal(cls({ VERCEL: '1' }).env_class, 'unknown'); // no runtime VERCEL_ENV
  // The Vercel build container sets CI=1: that is ci, not serverless.
  assert.equal(cls({ VERCEL: '1', VERCEL_ENV: 'production', CI: '1' }).env_class, 'ci');
  assert.equal(cls({ NETLIFY: 'true' }).env_class, 'serverless');
  assert.equal(cls({ NETLIFY: 'true', NETLIFY_DEV: 'true' }).env_class, 'unknown');
});

test('ci / ci_provider detection', () => {
  const cases: [Record<string, string>, string][] = [
    [{ GITHUB_ACTIONS: 'true', CI: 'true' }, 'github_actions'],
    [{ GITLAB_CI: 'true' }, 'gitlab'],
    [{ CIRCLECI: 'true' }, 'circleci'],
    [{ BUILDKITE: 'true' }, 'buildkite'],
    [{ JENKINS_URL: 'http://j' }, 'jenkins'],
    [{ TRAVIS: 'true' }, 'travis'],
    [{ TF_BUILD: 'True' }, 'azure_pipelines'],
    [{ BITBUCKET_BUILD_NUMBER: '7' }, 'bitbucket'],
    [{ CODEBUILD_BUILD_ID: 'x' }, 'aws_codebuild'],
    [{ VERCEL: '1', CI: '1' }, 'vercel'],
    [{ NETLIFY: 'true', CI: 'true' }, 'netlify'],
    [{ CF_PAGES: '1', CI: 'true' }, 'cloudflare_pages'],
    [{ RENDER: 'true', CI: 'true' }, 'render'],
    [{ CI: 'true' }, 'other_ci'],
    [{}, 'none'],
    [{ CI: 'false' }, 'none'],
    // Platform vars alone (runtime, no CI) are hosting, not CI.
    [{ VERCEL: '1' }, 'none'],
    [{ RENDER: 'true' }, 'none'],
  ];
  for (const [env, want] of cases) {
    const r = cls(env);
    assert.equal(r.ci_provider, want, JSON.stringify(env));
    assert.equal(r.ci, want !== 'none', JSON.stringify(env));
  }
});

test('hosting detection', () => {
  const cases: [Record<string, string>, string, Partial<EnvFlags>?][] = [
    [{ VERCEL: '1' }, 'vercel'],
    [{ NETLIFY: 'true' }, 'netlify'],
    [{ CF_PAGES: '1' }, 'cloudflare'],
    [{}, 'cloudflare', { runtime: 'workerd' }],
    [{ AWS_LAMBDA_FUNCTION_NAME: 'f' }, 'aws_lambda'],
    [{ K_SERVICE: 's' }, 'cloud_run'],
    [{ FLY_APP_NAME: 'a' }, 'fly'],
    [{ RAILWAY_ENVIRONMENT: 'production' }, 'railway'],
    [{ RENDER: 'true' }, 'render'],
    [{ DYNO: 'web.1' }, 'heroku'],
    [{}, 'none'],
  ];
  for (const [env, want, f] of cases) assert.equal(cls(env, f).hosting, want, JSON.stringify(env));
});

test('package_manager is the allow-listed prefix of npm_config_user_agent, no version', () => {
  const ua = (s: string) => cls({ npm_config_user_agent: s }).package_manager;
  assert.equal(ua('npm/10.2.0 node/v20.9.0 linux x64 workspaces/false'), 'npm');
  assert.equal(ua('pnpm/8.6.0 npm/? node/v18.0.0 linux x64'), 'pnpm');
  assert.equal(ua('yarn/1.22.19 npm/? node/v18.0.0 darwin arm64'), 'yarn');
  assert.equal(ua('bun/1.1.0 npm/? node/v22.0.0 linux x64'), 'bun');
  assert.equal(ua('evil/1.0 secret'), 'unknown');
  assert.equal(ua(''), 'unknown');
  assert.equal(cls({}).package_manager, 'unknown');
});

test('node_env, is_tty and is_container', () => {
  for (const v of ['development', 'production', 'test']) assert.equal(cls({ NODE_ENV: v }).node_env, v);
  assert.equal(cls({ NODE_ENV: 'staging' }).node_env, 'other');
  assert.equal(cls({}).node_env, 'unset');
  const r = cls({}, { tty: true, container: true });
  assert.equal(r.is_tty, true);
  assert.equal(r.is_container, true);
  assert.equal(cls({}).is_tty, false);
  assert.equal(cls({}).is_container, false);
});

test('classification emits only enum values: no env var VALUE can leak', () => {
  const env = {
    GITHUB_ACTIONS: 'secretvalue', CI: 'secretvalue', NODE_ENV: 'secretvalue', VERCEL: 'secretvalue',
    VERCEL_ENV: 'secretvalue', K_SERVICE: 'secretvalue', npm_config_user_agent: 'secretvalue/1 node/v1',
    npm_lifecycle_event: 'secretvalue', AWS_LAMBDA_FUNCTION_NAME: 'secretvalue', FLY_APP_NAME: 'secretvalue',
  };
  assert.ok(!JSON.stringify(cls(env, { cli: true, tty: true })).includes('secretvalue'));
});

// ---- wire payload: session, person profile, no leaks ---------------------------

const UUIDV7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('$session_id is a UUIDv7 minted before the first event and stable per process', async () => {
  await drain();
  const posts = capture();
  track(PKG, '1.1.0', 'sess.one');
  await flushTelemetry();
  track(PKG, '1.1.0', 'sess.two');
  await flushTelemetry();

  const a = posts[0]!.body.batch[0]!;
  const b = posts[1]!.body.batch[0]!;
  const sid = a.properties.$session_id as string;
  assert.match(sid, UUIDV7);
  assert.equal(b.properties.$session_id, sid);

  // PostHog: the UUIDv7 time must be <= the first event's time (and within 24h of the last).
  const idMs = parseInt(sid.replace(/-/g, '').slice(0, 12), 16);
  assert.ok(idMs <= Date.parse(a.timestamp), 'session id time must not be after the first event');
  assert.ok(Date.parse(b.timestamp) - idMs < 24 * 3600 * 1000);
});

test('person profile: $process_person_profile true with $set / $set_once and nothing else personal', async () => {
  await drain();
  const posts = capture();
  track(PKG, '1.1.0', 'person.check');
  await flushTelemetry();

  const p = posts[0]!.body.batch[0]!.properties as Record<string, Record<string, unknown>>;
  assert.equal((p as unknown as { $process_person_profile: boolean }).$process_person_profile, true);
  assert.deepEqual(Object.keys(p.$set!).sort(), ['last_env_class', 'last_os', 'last_pkg_version', 'last_runtime']);
  assert.deepEqual(
    Object.keys(p.$set_once!).sort(),
    ['first_env_class', 'first_pkg', 'first_pkg_version', 'first_runtime', 'first_seen_os'],
  );
  const flat = p as unknown as Record<string, unknown>;
  assert.equal(p.$set!.last_env_class, flat.env_class);
  assert.equal(p.$set!.last_runtime, flat.runtime);
  assert.equal(p.$set!.last_pkg_version, '1.1.0');
  assert.equal(p.$set!.last_os, flat.os);
  assert.equal(p.$set_once!.first_env_class, flat.env_class);
  assert.equal(p.$set_once!.first_pkg, PKG);
  assert.equal(p.$set_once!.first_pkg_version, '1.1.0');
  assert.equal(p.$set_once!.first_runtime, flat.runtime);
  assert.equal(p.$set_once!.first_seen_os, flat.os);
  assert.match(String(flat.env_class), /^(test|ci|build|serverless|dev|server|cli_interactive|browser|unknown)$/);
  assert.match(String(flat.ci_provider), /^[a-z_]+$/);
  assert.equal(typeof flat.is_tty, 'boolean');
  assert.equal(typeof flat.is_container, 'boolean');
});

test('env var values never appear in the serialized payload', async () => {
  await drain();
  const keys = ['GITHUB_ACTIONS', 'VERCEL', 'K_SERVICE', 'npm_config_user_agent'] as const;
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  try {
    for (const k of keys) process.env[k] = 'secretvalue';
    const posts = capture();
    track(PKG, '1.1.0', 'leak.check');
    await flushTelemetry();
    const wire = JSON.stringify(posts[0]!.body);
    assert.ok(!wire.includes('secretvalue'), 'an env var value leaked into the payload');
    const p = posts[0]!.body.batch[0]!.properties;
    assert.equal(p.ci_provider, 'github_actions'); // presence was read...
    assert.equal(p.package_manager, 'unknown'); // ...but the unlisted value was not echoed
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
});

// ---- error events ---------------------------------------------------------------

test('AHTMLError construction emits error.<code> with the code only', async () => {
  await drain();
  const posts = capture();
  const secret = 'https://user:pw@internal.example/very/secret/path';
  new AHTMLError({ code: 'RATE_LIMITED', message: secret, context: secret, path: '/x', cause: new Error(secret) });
  makeError({ code: 'SCHEMA_INVALID', message: 'bad ' + secret });
  new InvalidDiffError('add', ['nope ' + secret]); // subclass inherits -> error.diff_invalid
  await flushTelemetry();

  const events = posts.flatMap((p) => p.body.batch);
  assert.deepEqual(events.map((e) => e.event).sort(), ['error.diff_invalid', 'error.rate_limited', 'error.schema_invalid']);
  for (const e of events) assert.equal(e.properties.pkg, PKG);
  const wire = JSON.stringify(posts.map((p) => p.body));
  assert.ok(!wire.includes('secret'), 'error message / context / cause must not be sent');
  assert.ok(!wire.includes('internal.example'));
});

test('re-wrapping an AHTMLError is not counted twice, and bad codes never throw', async () => {
  await drain();
  const posts = capture();
  const inner = new AHTMLError({ code: 'NETWORK', message: 'x' });
  new AHTMLError({ code: 'TIMEOUT', message: 'y', cause: inner }); // wrapper: not counted
  assert.doesNotThrow(() => new AHTMLError({ code: undefined as never, message: 'z' }));
  assert.doesNotThrow(() => new AHTMLError({ code: 'Weird Code!' as never, message: 'z' }));
  await flushTelemetry();
  const events = posts.flatMap((p) => p.body.batch);
  assert.deepEqual(events.map((e) => [e.event, e.properties.count]), [['error.network', 1]]);
});

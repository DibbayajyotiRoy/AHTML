/**
 * Update notifier — hermetic: fetch, clock, env, TTY flag, stderr sink and the
 * cache directory are all injected, so nothing touches the network.
 */
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkForUpdate, isNewer, type UpdateDeps } from '../update-notifier.js';

const NOW = Date.UTC(2026, 0, 10);
const HOUR = 60 * 60 * 1000;

let dir: string;
let out: string[];
let fetched: number;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ahtml-update-test-'));
  out = [];
  fetched = 0;
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const registry = (version: unknown): UpdateDeps['fetch'] => async () => {
  fetched++;
  return { ok: true, json: async () => ({ version }) };
};

const deps = (over: UpdateDeps = {}): UpdateDeps => ({
  fetch: registry('1.2.0'),
  cacheDir: dir,
  now: () => NOW,
  env: {},
  isTTY: true,
  write: (t) => void out.push(t),
  ...over,
});

describe('isNewer', () => {
  test('compares numerically, not lexically', () => {
    assert.equal(isNewer('1.10.0', '1.9.0'), true);
    assert.equal(isNewer('2.0.0', '1.99.99'), true);
    assert.equal(isNewer('1.1.1', '1.1.0'), true);
    assert.equal(isNewer('1.1.0', '1.1.0'), false);
    assert.equal(isNewer('1.0.9', '1.1.0'), false);
  });
  test('ignores prerelease/build tags and unparseable input', () => {
    assert.equal(isNewer('1.2.0-beta.1', '1.2.0'), false);
    assert.equal(isNewer('1.2.0+build.5', '1.1.0'), true);
    assert.equal(isNewer('v1.2.0', '1.1.0'), true);
    assert.equal(isNewer('garbage', '1.1.0'), false);
    assert.equal(isNewer('1.2.0', ''), false);
  });
});

describe('checkForUpdate', () => {
  test('newer version prints a boxed notice to the sink and caches', async () => {
    await checkForUpdate('1.1.0', deps());

    assert.equal(fetched, 1);
    assert.equal(out.length, 1);
    assert.match(out[0]!, /Update available 1\.1\.0 → 1\.2\.0/);
    assert.match(out[0]!, /Run npm i -g @ahtmljs\/cli to update/);
    const lines = out[0]!.trim().split('\n');
    assert.ok(lines[0]!.startsWith('┌') && lines.at(-1)!.startsWith('└'));
    assert.equal(new Set(lines.map((l) => l.length)).size, 1, 'box is rectangular');

    const cache = JSON.parse(await readFile(join(dir, 'ahtml-cli-update-check.json'), 'utf8'));
    assert.deepEqual(cache, { checkedAt: NOW, latest: '1.2.0' });
  });

  test('applies the injected painter to the notice lines', async () => {
    await checkForUpdate('1.1.0', deps({ paint: (t, style) => `<${style}>${t}</${style}>` }));
    assert.match(out[0]!, /<yellow>Update available 1\.1\.0 → 1\.2\.0<\/yellow>/);
    assert.match(out[0]!, /<cyan>Run npm i -g @ahtmljs\/cli to update<\/cyan>/);
  });

  test('equal or older latest prints nothing', async () => {
    await checkForUpdate('1.2.0', deps());
    await checkForUpdate('1.3.0', deps());
    assert.deepEqual(out, []);
  });

  test('cache younger than 24h skips the network and still notifies from the cached value', async () => {
    await writeFile(
      join(dir, 'ahtml-cli-update-check.json'),
      JSON.stringify({ checkedAt: NOW - 23 * HOUR, latest: '1.5.0' }),
    );
    await checkForUpdate('1.1.0', deps());
    assert.equal(fetched, 0);
    assert.match(out[0]!, /1\.1\.0 → 1\.5\.0/);
  });

  test('cache older than 24h is refreshed from the registry', async () => {
    await writeFile(
      join(dir, 'ahtml-cli-update-check.json'),
      JSON.stringify({ checkedAt: NOW - 25 * HOUR, latest: '1.1.0' }),
    );
    await checkForUpdate('1.1.0', deps());
    assert.equal(fetched, 1);
    assert.match(out[0]!, /1\.1\.0 → 1\.2\.0/);
    const cache = JSON.parse(await readFile(join(dir, 'ahtml-cli-update-check.json'), 'utf8'));
    assert.equal(cache.checkedAt, NOW);
  });

  test('fetch failures of every kind are swallowed silently', async () => {
    const failures: UpdateDeps['fetch'][] = [
      async () => {
        throw new Error('offline');
      },
      async () => ({ ok: false, json: async () => ({}) }),
      async () => ({
        ok: true,
        json: async () => {
          throw new SyntaxError('bad json');
        },
      }),
      registry(42), // version of the wrong type
    ];
    for (const f of failures) {
      await rm(join(dir, 'ahtml-cli-update-check.json'), { force: true });
      await assert.doesNotReject(checkForUpdate('1.1.0', deps({ fetch: f })));
    }
    assert.deepEqual(out, []);
  });

  test('a failed check is stamped so offline machines do not retry on every run', async () => {
    const boom = async () => {
      fetched++;
      throw new Error('offline');
    };
    await checkForUpdate('1.1.0', deps({ fetch: boom }));
    await checkForUpdate('1.1.0', deps({ fetch: boom }));
    assert.equal(fetched, 1);
  });

  test('an unreachable cache dir does not break the check', async () => {
    await assert.doesNotReject(
      checkForUpdate('1.1.0', deps({ cacheDir: join(dir, 'does', 'not', 'exist') })),
    );
    assert.match(out[0]!, /Update available/);
  });

  test('NO_UPDATE_NOTIFIER, CI and non-TTY suppress everything', async () => {
    await checkForUpdate('1.1.0', deps({ env: { NO_UPDATE_NOTIFIER: '1' } }));
    for (const v of ['CI', 'GITHUB_ACTIONS', 'GITLAB_CI', 'BUILDKITE', 'CIRCLECI']) {
      await checkForUpdate('1.1.0', deps({ env: { [v]: 'true' } }));
    }
    await checkForUpdate('1.1.0', deps({ isTTY: false }));
    assert.equal(fetched, 0);
    assert.deepEqual(out, []);
  });
});

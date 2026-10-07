/**
 * `ahtml diff <a> <b> [--json] [--fail-on breaking|notable]` — driven through
 * `runDiff` with captured output, plus one run of the built binary to prove the
 * real argv parsing and process exit code.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapshot, toJson, toCompact, type Action, type Snapshot } from '@ahtmljs/schema';
import { runDiff } from '../commands/diff.js';

const here = dirname(fileURLToPath(import.meta.url));
const cliJs = resolve(here, '../../dist/cli.js');

function snap(amount: number, actions: Action[] = [{ id: 'purchase', label: 'Buy' }]): Snapshot {
  let b = snapshot('https://shop.example.com/p', 'product_detail').add({
    id: 'product:p1',
    type: 'product',
    name: 'Widget',
    price: { amount, currency: 'USD' },
  });
  for (const a of actions) b = b.action(a);
  return b.build();
}

let dir: string;
const file = (name: string) => join(dir, name);
const write = (name: string, s: Snapshot) => writeFileSync(file(name), toJson(s, { pretty: true }));

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'ahtml-diff-'));
  write('base.json', snap(100));
  write('same.json', snap(100));
  write('price.json', snap(80)); // notable only
  write('removed.json', snap(100, [])); // breaking: action removed
  writeFileSync(file('base.txt'), toCompact(snap(100)));
  writeFileSync(file('junk.json'), '{"hello":"world"}');
  writeFileSync(file('broken.json'), '{nope');
});
after(() => rmSync(dir, { recursive: true, force: true }));

async function run(...args: string[]) {
  let out = '';
  let err = '';
  const code = await runDiff(args, { out: (s) => (out += s), err: (s) => (err += s) });
  return { code, out, err };
}

describe('ahtml diff', () => {
  test('reports changes, graded by severity, exit 0 without --fail-on', async () => {
    const r = await run(file('base.json'), file('removed.json'));
    assert.equal(r.code, 0);
    assert.match(r.out, /BREAKING\s+Action "purchase" removed/);
    assert.match(r.out, /1 breaking, 0 notable, 0 info/);
  });

  test('prints severities most severe first', async () => {
    write('mixed.json', snap(80, []));
    const r = await run(file('base.json'), file('mixed.json'));
    const order = r.out.match(/BREAKING|NOTABLE|INFO/g);
    assert.deepEqual(order, ['BREAKING', 'NOTABLE']);
    assert.match(r.out, /price decreased from 100 to 80 USD \(-20%\)/);
  });

  test('--fail-on breaking exits 1 on a breaking change', async () => {
    const r = await run(file('base.json'), file('removed.json'), '--fail-on', 'breaking');
    assert.equal(r.code, 1);
    assert.match(r.out, /FAIL/);
  });

  test('--fail-on breaking tolerates notable-only changes; --fail-on notable does not', async () => {
    assert.equal((await run(file('base.json'), file('price.json'), '--fail-on', 'breaking')).code, 0);
    assert.equal((await run(file('base.json'), file('price.json'), '--fail-on', 'notable')).code, 1);
    assert.equal((await run(file('base.json'), file('removed.json'), '--fail-on', 'notable')).code, 1);
  });

  test('flags may precede the operands, and --fail-on=<level> works', async () => {
    assert.equal((await run('--fail-on', 'breaking', file('base.json'), file('removed.json'))).code, 1);
    assert.equal((await run(file('base.json'), file('removed.json'), '--fail-on=breaking')).code, 1);
  });

  test('identical snapshots: "no semantic changes", exit 0 even at the strictest threshold', async () => {
    const r = await run(file('base.json'), file('same.json'), '--fail-on', 'notable');
    assert.equal(r.code, 0);
    assert.match(r.out, /no semantic changes/);
  });

  test('--json emits a machine-readable report', async () => {
    const r = await run(file('base.json'), file('removed.json'), '--json', '--fail-on', 'breaking');
    assert.equal(r.code, 1);
    const j = JSON.parse(r.out);
    assert.deepEqual(j.summary, { total: 1, breaking: 1, notable: 0, info: 0 });
    assert.equal(j.failOn, 'breaking');
    assert.equal(j.failed, true);
    assert.equal(j.changes[0].kind, 'action.removed');
    assert.equal(j.changes[0].severity, 'breaking');
  });

  test('accepts compact-text snapshot files', async () => {
    const r = await run(file('base.txt'), file('price.json'));
    assert.match(r.out, /price decreased/);
  });

  test('argument and load errors exit 1 with a message on stderr', async () => {
    const cases: string[][] = [
      [file('base.json')],
      [file('base.json'), file('same.json'), file('price.json')],
      [file('base.json'), file('same.json'), '--fail-on', 'info'],
      [file('base.json'), file('same.json'), '--fail-on'],
      [file('base.json'), file('same.json'), '--bogus'],
      [file('base.json'), file('missing.json')],
      [file('base.json'), file('junk.json')],
      [file('base.json'), file('broken.json')],
    ];
    for (const args of cases) {
      const r = await run(...args);
      assert.equal(r.code, 1, `expected exit 1 for ${JSON.stringify(args.map((a) => a.replace(dir, '')))}`);
      assert.match(r.err, /error:/);
    }
  });
});

describe('ahtml diff — URLs', () => {
  let server: Server;
  let origin: string;
  const served = new Map<string, Snapshot>();
  const hits: string[] = [];

  before(async () => {
    server = createServer((req, res) => {
      hits.push(req.url ?? '');
      const s = served.get((req.url ?? '').split('?')[0]!);
      if (!s) {
        res.writeHead(404).end('nope');
        return;
      }
      res.writeHead(200, { 'content-type': 'application/ahtml+json' }).end(toJson(s));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const addr = server.address();
    origin = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  });
  after(() => new Promise<void>((r) => server.close(() => r())));

  test('fetches snapshot URLs; a bare origin resolves to <origin>/ahtml', async () => {
    served.set('/ahtml', snap(100));
    served.set('/staging/ahtml', snap(50));
    const r = await run(origin, `${origin}/staging/ahtml`);
    assert.equal(r.code, 0);
    assert.match(r.out, /price decreased from 100 to 50 USD \(-50%\)/);
    assert.ok(hits.includes('/ahtml') && hits.includes('/staging/ahtml'), `hits: ${hits.join(', ')}`);
  });

  test('a URL mixes with a local file; HTTP errors exit 1', async () => {
    const ok = await run(`${origin}/ahtml`, file('removed.json'), '--fail-on', 'breaking');
    assert.equal(ok.code, 1);
    const bad = await run(`${origin}/missing`, file('base.json'));
    assert.equal(bad.code, 1);
    assert.match(bad.err, /error:/);
  });
});

describe('ahtml diff — built binary', () => {
  const skip = !existsSync(join(dirname(cliJs), 'commands', 'diff.js')) && 'cli not built with diff (run npm run build)';

  test('exit code follows --fail-on', { skip }, () => {
    const exec = (...a: string[]) =>
      spawnSync(process.execPath, [cliJs, 'diff', ...a], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
    const bad = exec(file('base.json'), file('removed.json'), '--fail-on', 'breaking');
    assert.equal(bad.status, 1);
    assert.match(bad.stdout, /BREAKING/);
    const ok = exec(file('base.json'), file('price.json'), '--fail-on', 'breaking');
    assert.equal(ok.status, 0);
    assert.match(ok.stdout, /NOTABLE/);
  });

  test('is listed in --help', { skip }, () => {
    const r = spawnSync(process.execPath, [cliJs, '--help'], { encoding: 'utf8' });
    assert.match(r.stdout, /ahtml diff <a> <b>/);
    assert.match(r.stdout, /--fail-on <level>/);
  });
});

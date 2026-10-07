/**
 * `ahtml diff <a> <b> [--json] [--fail-on breaking|notable]`
 *
 * Semantic diff between two snapshots. `<a>` and `<b>` are each an http(s) URL
 * (a bare origin means `<origin>/ahtml`) or a local snapshot file (`.json`, or
 * compact text). Changes are graded breaking / notable / info; with `--fail-on`
 * the command exits 1 when any change meets the threshold, so it can gate CI:
 *
 *   ahtml diff https://staging.shop.com/ahtml https://shop.com/ahtml --fail-on breaking
 *
 * Exit codes: 0 — ran, threshold (if any) not met; 1 — threshold met, bad
 * arguments, or a snapshot could not be loaded.
 */

import { readFileSync } from 'node:fs';
import {
  semanticDiff,
  describeChange,
  fromJson,
  fromCompact,
  AHTMLError,
  type ChangeSeverity,
  type SemanticChange,
  type Snapshot,
} from '@ahtmljs/schema';
import { AHTMLClient } from '@ahtmljs/agent';

/** Minimal ANSI helpers — intentionally not imported from cli.ts. */
const USE_COLOR =
  typeof process !== 'undefined' &&
  process.stdout.isTTY === true &&
  !process.env.NO_COLOR;

function c(text: string, code: string): string {
  return USE_COLOR ? `\x1b[${code}m${text}\x1b[0m` : text;
}
const bold = (t: string) => c(t, '1');
const dim = (t: string) => c(t, '2');
const red = (t: string) => c(t, '31');
const green = (t: string) => c(t, '32');
const yellow = (t: string) => c(t, '33');
const cyan = (t: string) => c(t, '36');

const RANK: Record<ChangeSeverity, number> = { info: 0, notable: 1, breaking: 2 };
const PAINT: Record<ChangeSeverity, (t: string) => string> = { breaking: red, notable: yellow, info: cyan };

export interface DiffIO {
  out: (s: string) => void;
  err: (s: string) => void;
}

const stdio: DiffIO = {
  out: (s) => void process.stdout.write(s),
  err: (s) => void process.stderr.write(s),
};

/** `rest` is argv after the `diff` subcommand. Returns the process exit code. */
export async function runDiff(rest: string[], io: DiffIO = stdio): Promise<number> {
  let json = false;
  let failOn: string | undefined;
  const operands: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === '--json') json = true;
    else if (a === '--fail-on') failOn = rest[++i] ?? '';
    else if (a.startsWith('--fail-on=')) failOn = a.slice('--fail-on='.length);
    else if (a.startsWith('--')) return usage(io, `unknown flag ${a}`);
    else operands.push(a);
  }
  if (operands.length !== 2) return usage(io, 'diff requires exactly two arguments: <a> <b>');
  if (failOn !== undefined && failOn !== 'breaking' && failOn !== 'notable') {
    return usage(io, '--fail-on must be "breaking" or "notable"');
  }
  const [a, b] = operands as [string, string];

  let changes: SemanticChange[];
  try {
    changes = semanticDiff(await load(a), await load(b));
  } catch (err) {
    io.err(red(`error: ${describeError(err)}\n`));
    return 1;
  }

  const count = (s: ChangeSeverity) => changes.filter((x) => x.severity === s).length;
  const failed = failOn !== undefined && changes.some((x) => RANK[x.severity] >= RANK[failOn as ChangeSeverity]);

  if (json) {
    io.out(
      JSON.stringify(
        {
          a,
          b,
          summary: { total: changes.length, breaking: count('breaking'), notable: count('notable'), info: count('info') },
          failOn: failOn ?? null,
          failed,
          changes,
        },
        null,
        2,
      ) + '\n',
    );
    return failed ? 1 : 0;
  }

  io.out(bold(`AHTML diff — ${a} -> ${b}\n`));
  io.out(dim('---\n'));
  if (changes.length === 0) {
    io.out(green('no semantic changes\n'));
    return 0;
  }
  for (const ch of changes) {
    io.out(`${PAINT[ch.severity](ch.severity.toUpperCase().padEnd(8))}  ${describeChange(ch)}\n`);
  }
  io.out(dim('---\n'));
  const summary = `${count('breaking')} breaking, ${count('notable')} notable, ${count('info')} info`;
  io.out((failed ? red : count('notable') + count('breaking') > 0 ? yellow : green)(summary) + '\n');
  if (failed) io.out(red(`FAIL: changes at or above "${failOn}" found (--fail-on ${failOn})\n`));
  return failed ? 1 : 0;
}

function usage(io: DiffIO, msg: string): number {
  io.err(red(`error: ${msg}\n`));
  io.err('usage: ahtml diff <a> <b> [--json] [--fail-on breaking|notable]\n');
  return 1;
}

async function load(src: string): Promise<Snapshot> {
  let snap: Snapshot;
  if (/^https?:\/\//i.test(src)) {
    const u = new URL(src);
    const target = u.pathname === '/' && !u.search ? `${u.origin}/ahtml` : src;
    snap = await new AHTMLClient().fetch(target, { noCache: true, format: 'json' });
  } else {
    const text = readFileSync(src, 'utf8');
    snap = text.trimStart().startsWith('{') ? fromJson(text) : fromCompact(text);
  }
  if (!snap || !Array.isArray(snap.entities) || !Array.isArray(snap.actions)) {
    throw new Error(`${src} is not an AHTML snapshot (missing entities/actions)`);
  }
  return snap;
}

function describeError(err: unknown): string {
  if (AHTMLError.is(err)) return `[${err.code}] ${err.message}${err.hint ? `\n  hint: ${err.hint}` : ''}`;
  const e = err as NodeJS.ErrnoException;
  return e?.code === 'ENOENT' ? `file not found: ${e.path}` : (e?.message ?? String(err));
}

#!/usr/bin/env node
/**
 * @ahtmljs/cli — the AHTML auditor.
 *
 * Two subcommands today:
 *
 *   - `ahtml doctor <url>` — walks the full AHTML discovery chain and
 *     prints a green/red report.
 *   - `ahtml validate <url>` — fast variant that only validates the
 *     snapshot at `<url>/ahtml`.
 *
 * Zero runtime dependencies outside `@ahtmljs/*`. ANSI colors are inline,
 * so the binary boots in a few milliseconds even on cold npx.
 *
 * Exit codes:
 *   0 — every required check passed (warnings allowed)
 *   1 — at least one check failed (or argv was malformed)
 */

import {
  validate,
  AHTMLError,
  type Snapshot,
} from '@ahtmljs/schema';
import { AHTMLClient } from '@ahtmljs/agent';
import { doctor, type DoctorReport } from './doctor.js';

/** Minimal ANSI palette — no chalk dependency by design. */
const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
} as const;

/** Whether to emit ANSI escapes — disabled when stdout is not a TTY or `NO_COLOR` is set. */
const COLOR =
  typeof process !== 'undefined' &&
  process.stdout.isTTY === true &&
  !process.env.NO_COLOR;

function paint(text: string, code: string): string {
  return COLOR ? `${code}${text}${ANSI.reset}` : text;
}

const HELP = `${paint('@ahtmljs/cli', ANSI.bold)} — AHTML auditor

${paint('USAGE', ANSI.bold)}
  ahtml doctor <url>      Walk the AHTML discovery chain and report green/red.
  ahtml validate <url>    Validate the snapshot at <url>/ahtml.

${paint('EXAMPLES', ANSI.bold)}
  npx @ahtmljs/cli doctor https://shop.example.com
  npx @ahtmljs/cli validate https://shop.example.com

${paint('FLAGS', ANSI.bold)}
  --help, -h              Show this message.
  --version, -v           Print version and exit.
`;

const VERSION = '0.9.0';

/** Entrypoint — parses argv and dispatches to a subcommand. */
async function main(argv: string[]): Promise<number> {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(HELP);
    return 0;
  }
  if (argv.includes('--version') || argv.includes('-v')) {
    process.stdout.write(VERSION + '\n');
    return 0;
  }

  const [cmd, ...rest] = argv;
  switch (cmd) {
    case 'doctor': {
      const url = rest[0];
      if (!url) {
        process.stderr.write(paint('error: doctor requires a <url> argument\n', ANSI.red));
        process.stderr.write(HELP);
        return 1;
      }
      return runDoctor(url);
    }
    case 'validate': {
      const url = rest[0];
      if (!url) {
        process.stderr.write(paint('error: validate requires a <url> argument\n', ANSI.red));
        process.stderr.write(HELP);
        return 1;
      }
      return runValidate(url);
    }
    default:
      process.stderr.write(paint(`error: unknown command "${cmd}"\n`, ANSI.red));
      process.stderr.write(HELP);
      return 1;
  }
}

/** Run `doctor()` against a URL and pretty-print the report. */
async function runDoctor(url: string): Promise<number> {
  process.stdout.write(paint(`AHTML doctor — ${url}\n`, ANSI.bold));
  process.stdout.write(paint('---\n', ANSI.gray));

  let report: DoctorReport;
  try {
    report = await doctor(url);
  } catch (err) {
    return handleFatal(err);
  }

  for (const c of report.checks) {
    const marker = renderMarker(c.status);
    const line = `${marker}  ${paint(c.name, ANSI.bold)}`;
    process.stdout.write(line + '\n');
    if (c.detail) process.stdout.write(`    ${paint(c.detail, ANSI.dim)}\n`);
    if (c.status !== 'pass' && c.hint) {
      process.stdout.write(`    ${paint('hint:', ANSI.cyan)} ${c.hint}\n`);
    }
  }

  process.stdout.write(paint('---\n', ANSI.gray));
  const { pass, warn, fail } = report.totals;
  const summary = `${pass} PASS, ${warn} WARN, ${fail} FAIL`;
  const colored =
    fail > 0 ? paint(summary, ANSI.red)
    : warn > 0 ? paint(summary, ANSI.yellow)
    : paint(summary, ANSI.green);
  process.stdout.write(colored + '\n');
  return fail > 0 ? 1 : 0;
}

/** Fast variant — just validate the snapshot at `<url>/ahtml`. */
async function runValidate(url: string): Promise<number> {
  const origin = url.replace(/\/+$/, '');
  const snapshotUrl = `${origin}/ahtml`;
  const client = new AHTMLClient();
  let snap: Snapshot;
  try {
    snap = await client.fetch(snapshotUrl, { noCache: true, format: 'json' });
  } catch (err) {
    return handleFatal(err);
  }
  const issues = validate(snap);
  if (issues.length === 0) {
    process.stdout.write(
      `${renderMarker('pass')}  ${paint('snapshot validated', ANSI.bold)} ` +
        paint(`(page_type=${snap.page_type}, entities=${snap.entities.length}, actions=${snap.actions.length})`, ANSI.dim) +
        '\n',
    );
    return 0;
  }
  process.stdout.write(`${renderMarker('fail')}  ${paint(`${issues.length} validation issue(s)`, ANSI.bold)}\n`);
  for (const i of issues) {
    process.stdout.write(`    ${paint(i.path, ANSI.dim)} — ${i.message}\n`);
  }
  return 1;
}

/** Render a status marker in the per-check output. */
function renderMarker(status: 'pass' | 'warn' | 'fail'): string {
  if (status === 'pass') return paint('PASS', ANSI.green);
  if (status === 'warn') return paint('WARN', ANSI.yellow);
  return paint('FAIL', ANSI.red);
}

/** Render an AHTMLError (or any thrown value) and return exit code 1. */
function handleFatal(err: unknown): number {
  if (AHTMLError.is(err)) {
    process.stderr.write(paint(`error [${err.code}]: ${err.message}\n`, ANSI.red));
    if (err.hint) process.stderr.write(`  ${paint('hint:', ANSI.cyan)} ${err.hint}\n`);
    if (err.context) process.stderr.write(`  ${paint('context:', ANSI.dim)} ${err.context}\n`);
    return 1;
  }
  process.stderr.write(paint(`error: ${(err as Error)?.message ?? String(err)}\n`, ANSI.red));
  return 1;
}

// Top-level dispatch. We swallow the promise in the rejection handler so the
// process never exits with an unhandled-rejection trace.
main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(paint(`fatal: ${(err as Error)?.message ?? String(err)}\n`, ANSI.red));
    process.exit(1);
  });

/**
 * TASKS.md T3.5 — `ahtml badge <url>` prints the README-embeddable markdown.
 * Output snapshot test driven through the built CLI binary.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const cliJs = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist/cli.js');

describe('ahtml badge (T3.5)', () => {
  test('prints the exact embeddable markdown', () => {
    const out = execFileSync(process.execPath, [cliJs, 'badge', 'https://shop.example.com'], {
      encoding: 'utf8',
    });
    assert.equal(
      out,
      'README-embeddable badge for https://shop.example.com:\n\n' +
        '[![AHTML score](https://badge.ahtmljs.com/badge?url=https%3A%2F%2Fshop.example.com)]' +
        '(https://badge.ahtmljs.com/report?url=https%3A%2F%2Fshop.example.com)\n',
    );
  });

  test('honors --service for self-hosted badge deployments', () => {
    const out = execFileSync(
      process.execPath,
      [cliJs, 'badge', 'https://x.com', '--service', 'https://badge.internal'],
      { encoding: 'utf8' },
    );
    assert.match(out, /https:\/\/badge\.internal\/badge\?url=/);
  });

  test('exits 1 without a url', () => {
    assert.throws(() =>
      execFileSync(process.execPath, [cliJs, 'badge'], { encoding: 'utf8', stdio: 'pipe' }),
    );
  });
});

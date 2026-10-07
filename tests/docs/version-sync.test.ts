/**
 * Every package's `src/version.ts` (the VERSION constant used by usage telemetry and the
 * CLI's update notifier) must match its package.json `version`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGES = join(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'), 'packages');

for (const name of readdirSync(PACKAGES)) {
  const file = join(PACKAGES, name, 'src', 'version.ts');
  if (!existsSync(file)) continue;
  test(`${name}/src/version.ts matches package.json`, () => {
    const pkg = JSON.parse(readFileSync(join(PACKAGES, name, 'package.json'), 'utf8'));
    const m = /export const VERSION = '([^']+)'/.exec(readFileSync(file, 'utf8'));
    assert.equal(m?.[1], pkg.version);
  });
}

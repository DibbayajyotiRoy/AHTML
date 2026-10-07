#!/usr/bin/env node
/**
 * Bump every publishable @ahtmljs/* package by one patch, keep every package's
 * src/version.ts (telemetry/update-notifier VERSION constant) in sync, and rewrite internal @ahtmljs/* dependency refs to the
 * newly-bumped versions. Prints the new @ahtmljs/schema version on the last line
 * (used as the release tag).
 *
 * Each package's base is max(repo version, latest on npm), so a later run never
 * reuses a version that already holds different content.
 *
 * ponytail: patch-only, bump-all-every-run. No minor/major logic and no
 * changed-only detection — every release bumps all 16 packages. If release churn
 * ever matters, swap this for changesets; the workflow calls one script either way.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
const pkgsDir = join(root, 'packages');

const pkgs = [];
for (const d of readdirSync(pkgsDir)) {
  const pj = join(pkgsDir, d, 'package.json');
  if (!existsSync(pj)) continue;
  const json = JSON.parse(readFileSync(pj, 'utf8'));
  if (json.private) continue; // skip private packages — they are never published
  pkgs.push({ dir: join(pkgsDir, d), pj, json });
}

const bumpPatch = (v) => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  if (!m) throw new Error(`cannot patch-bump non-semver version: ${v}`);
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
};

const SEMVER = /^\d+\.\d+\.\d+$/;
const cmp = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number));
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
};
const published = (name) => {
  try {
    const v = execFileSync('npm', ['view', name, 'version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return SEMVER.test(v) ? v : null;
  } catch {
    return null; // unpublished (or registry unreachable)
  }
};

const next = new Map();
for (const p of pkgs) {
  const pub = published(p.json.name);
  next.set(p.json.name, bumpPatch(pub && cmp(pub, p.json.version) > 0 ? pub : p.json.version));
}

for (const p of pkgs) {
  p.json.version = next.get(p.json.name);
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const deps = p.json[field];
    if (!deps) continue;
    for (const k of Object.keys(deps)) {
      if (next.has(k) && SEMVER.test(deps[k])) deps[k] = next.get(k); // exact pins only; leave ranges
    }
  }
  writeFileSync(p.pj, JSON.stringify(p.json, null, 2) + '\n');

  const vt = join(p.dir, 'src', 'version.ts');
  if (existsSync(vt)) {
    writeFileSync(vt, readFileSync(vt, 'utf8').replace(/VERSION = '[^']*'/, `VERSION = '${p.json.version}'`));
  }
}

console.error('bumped: ' + [...next].map(([n, v]) => `${n}@${v}`).join(' '));
process.stdout.write(next.get('@ahtmljs/schema') + '\n');

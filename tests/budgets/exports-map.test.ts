/**
 * Exports-map integrity (TASKS.md T0.3 — extends the 0.9
 * ERR_PACKAGE_PATH_NOT_EXPORTED lesson from smoke:imports).
 *
 * For every workspace package, every file path referenced from its
 * `exports` map (and `main`/`types`/`bin`) must exist on disk after a
 * build. smoke:imports covers documented subpaths of published packages;
 * this covers EVERY subpath of EVERY package, including unpublished ones,
 * so a broken exports entry fails CI before it can ship.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const packagesDir = join(repoRoot, 'packages');

/** Collect every relative file path mentioned anywhere in an exports value. */
function referencedFiles(value: unknown): string[] {
  if (typeof value === 'string') return value.startsWith('./') ? [value] : [];
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap(referencedFiles);
  }
  return [];
}

describe('package exports maps reference real files', () => {
  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pkgDir = join(packagesDir, entry.name);
    const manifestPath = join(pkgDir, 'package.json');
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

    test(`packages/${entry.name} (${manifest.name})`, () => {
      const refs = new Set<string>([
        ...referencedFiles(manifest.exports),
        ...referencedFiles(manifest.main),
        ...referencedFiles(manifest.types),
        ...referencedFiles(manifest.bin),
      ]);
      assert.ok(
        refs.size > 0,
        `${manifest.name} declares no exports/main/bin file references — nothing is importable`,
      );
      const missing = [...refs].filter((rel) => {
        // Wildcard subpath patterns (e.g. "./dist/*"): assert the base
        // directory exists — per-file resolution is the wildcard's job.
        if (rel.includes('*')) {
          const base = rel.slice(0, rel.indexOf('*')).replace(/\/$/, '');
          return !existsSync(join(pkgDir, base));
        }
        return !existsSync(join(pkgDir, rel));
      });
      assert.deepEqual(
        missing,
        [],
        `${manifest.name} references missing files (run a build, or fix the exports map): ${missing.join(', ')}`,
      );
    });
  }
});

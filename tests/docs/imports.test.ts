/**
 * Docs test — every documented `@ahtmljs/...` import specifier must resolve
 * against the target package's `exports` map, in BOTH `import` and `require`
 * conditions.
 *
 * Scans README.md, SPEC.md, LANGUAGE.md, docs/*.md, and packages/*\/README.md
 * for specifiers appearing in code fences (import/require) or inline backticks
 * (e.g. `@ahtmljs/schema/emit/mcp`) and resolves each one manually against the
 * package.json `exports` map — no runtime import, so this works even without a
 * build. When the package HAS been built (dist/ present), it additionally
 * asserts the mapped file exists on disk.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PACKAGES_DIR = join(ROOT, 'packages');

// True false-positives only: prose mentions of packages that are explicitly
// documented as planned / roadmap items, not importable code.
const IGNORE: string[] = [
  '@ahtmljs/astro',              // packages/vite/README.md — "in development"
  '@ahtmljs/nuxt',               // packages/vite/README.md — "on the roadmap"
  '@ahtmljs/next-language',      // LANGUAGE.md — planned framework binding
  '@ahtmljs/vite-language',      // LANGUAGE.md — planned framework binding
  '@ahtmljs/sveltekit-language', // LANGUAGE.md — planned framework binding
  '@ahtmljs/sign',               // docs/recipes.md — aspirational "v0.2 target shape"
];

// --- collect markdown files -------------------------------------------------

const docFiles: string[] = [];
for (const f of ['README.md', 'SPEC.md', 'LANGUAGE.md']) {
  if (existsSync(join(ROOT, f))) docFiles.push(join(ROOT, f));
}
for (const f of readdirSync(join(ROOT, 'docs'))) {
  if (f.endsWith('.md')) docFiles.push(join(ROOT, 'docs', f));
}
for (const pkg of readdirSync(PACKAGES_DIR)) {
  const readme = join(PACKAGES_DIR, pkg, 'README.md');
  if (existsSync(readme)) docFiles.push(readme);
}

// --- extract specifiers -----------------------------------------------------

// Matches @ahtmljs/<pkg>[/subpath...] wherever it appears (code fences,
// inline backticks). Excludes trailing punctuation/quotes/backticks.
const SPEC_RE = /@ahtmljs\/[a-z0-9-]+(?:\/[a-zA-Z0-9.*_-]+)*/g;

const found = new Map<string, Set<string>>(); // specifier -> files
for (const file of docFiles) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(SPEC_RE)) {
    const spec = m[0].replace(/\.$/, ''); // strip sentence-ending period
    if (IGNORE.includes(spec)) continue;
    // Skip obvious placeholders and wildcard prose like `@ahtmljs/schema/emit/*`.
    if (spec.includes('<') || spec.includes('[') || spec.includes('*')) continue;
    if (!found.has(spec)) found.set(spec, new Set());
    found.get(spec)!.add(file.slice(ROOT.length + 1));
  }
}

// --- exports-map resolution ---------------------------------------------------

type Exports = string | { [key: string]: Exports } | null;

function resolveConditions(target: Exports, condition: 'import' | 'require'): string | null {
  if (target === null) return null;
  if (typeof target === 'string') return target;
  for (const [key, value] of Object.entries(target)) {
    if (key === condition || key === 'default' || key === 'node') {
      const r = resolveConditions(value, condition);
      if (r !== null) return r;
    }
  }
  return null;
}

function resolveExports(exportsMap: Exports, subpath: string, condition: 'import' | 'require'): string | null {
  if (typeof exportsMap === 'string') {
    return subpath === '.' ? exportsMap : null;
  }
  if (exportsMap === null || typeof exportsMap !== 'object') return null;
  const keys = Object.keys(exportsMap);
  const isSubpathMap = keys.some((k) => k.startsWith('.'));
  if (!isSubpathMap) {
    // Whole map is a conditions object for the root.
    return subpath === '.' ? resolveConditions(exportsMap, condition) : null;
  }
  // Exact match first.
  if (subpath in (exportsMap as Record<string, Exports>)) {
    return resolveConditions((exportsMap as Record<string, Exports>)[subpath], condition);
  }
  // Wildcard patterns like "./emit/*".
  for (const key of keys) {
    const star = key.indexOf('*');
    if (star === -1) continue;
    const prefix = key.slice(0, star);
    const suffix = key.slice(star + 1);
    if (subpath.startsWith(prefix) && subpath.endsWith(suffix) && subpath.length >= key.length - 1) {
      const wildcard = subpath.slice(prefix.length, subpath.length - suffix.length);
      const target = resolveConditions((exportsMap as Record<string, Exports>)[key], condition);
      if (target !== null) return target.replace(/\*/g, wildcard);
    }
  }
  return null;
}

// --- tests --------------------------------------------------------------------

const specifiers = [...found.keys()].sort();

describe(`documented @ahtmljs imports (${specifiers.length} unique specifiers across ${docFiles.length} docs)`, () => {
  assert.ok(specifiers.length > 0, 'expected to find @ahtmljs specifiers in the docs');

  for (const spec of specifiers) {
    const [, pkgName, ...rest] = spec.split('/');
    const pkgDir = join(PACKAGES_DIR, pkgName);
    const subpath = rest.length ? `./${rest.join('/')}` : '.';
    const where = [...found.get(spec)!].join(', ');

    test(`${spec} (documented in: ${where})`, () => {
      assert.ok(
        existsSync(join(pkgDir, 'package.json')),
        `documented package "@ahtmljs/${pkgName}" does not exist in packages/`,
      );
      const pkgJson = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
      const exportsMap: Exports = pkgJson.exports ?? null;
      const distBuilt = existsSync(join(pkgDir, 'dist'));

      if (exportsMap === null) {
        // Legacy resolution (no exports map, e.g. @ahtmljs/cli): "." resolves
        // via "main"; any subpath resolves as a literal file path.
        const target = subpath === '.' ? pkgJson.main : subpath;
        assert.ok(target, `@ahtmljs/${pkgName} has neither "exports" nor "main"`);
        if (distBuilt) {
          assert.ok(
            existsSync(join(pkgDir, target)),
            `"${spec}" resolves to "${target}" but that file does not exist in ${pkgDir}`,
          );
        }
        return;
      }

      // ESM-only packages (no "require" condition anywhere, e.g. @ahtmljs/webmcp)
      // are only required to resolve under the "import" condition.
      const supportsRequire = JSON.stringify(exportsMap).includes('"require"');
      const conditions = supportsRequire ? (['import', 'require'] as const) : (['import'] as const);

      for (const condition of conditions) {
        const target = resolveExports(exportsMap, subpath, condition);
        assert.ok(
          target !== null,
          `"${spec}" does not resolve under the "${condition}" condition of @ahtmljs/${pkgName}'s exports map`,
        );
        // Only check the mapped file on disk when the package has been built;
        // otherwise the exports-map mapping itself is the best we can verify.
        if (distBuilt && !target.includes('*')) {
          assert.ok(
            existsSync(join(pkgDir, target)),
            `"${spec}" maps to "${target}" (${condition}) but that file does not exist in ${pkgDir}`,
          );
        }
      }
    });
  }
});

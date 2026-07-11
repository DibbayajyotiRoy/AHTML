// Verifies every documented entry point resolves in BOTH module systems.
// Run from the repo root after a full build. Exits non-zero on any failure.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const subpaths = {
  '@ahtmljs/schema': [
    '/simulate',
    '',
    '/stream',
    '/kv',
    '/sign',
    '/emit/well-known',
    '/emit/mcp',
    '/emit/openapi',
    '/emit/llms-txt',
    '/http/accept',
    '/http/conditional',
  ],
  '@ahtmljs/agent': ['', '/tokens', '/sign'],
  '@ahtmljs/extract': [''],
  '@ahtmljs/next': ['', '/handler', '/well-known', '/llms-txt', '/extractors', '/mcp', '/openapi'],
  '@ahtmljs/vite': [''],
  '@ahtmljs/hono': [''],
  '@ahtmljs/astro': [''],
  '@ahtmljs/sveltekit': [''],
  '@ahtmljs/insights': [''],
  '@ahtmljs/index': [''],
  '@ahtmljs/langchain': [''],
};

// ESM-only packages (workers / tooling that depend on ESM-only exports):
// asserted under `import` alone — a CJS require failure here is by design.
const esmOnly = {
  '@ahtmljs/badge': [''],
  '@ahtmljs/conformance': [''],
};

let failures = 0;
for (const [pkg, subs] of Object.entries(subpaths)) {
  for (const sub of subs) {
    const id = pkg + sub;
    try {
      require(id);
    } catch (e) {
      failures++;
      console.error(`CJS FAIL ${id} — ${e.code ?? e.message}`);
    }
    try {
      await import(id);
    } catch (e) {
      failures++;
      console.error(`ESM FAIL ${id} — ${e.code ?? e.message}`);
    }
  }
}

for (const [pkg, subs] of Object.entries(esmOnly)) {
  for (const sub of subs) {
    const id = pkg + sub;
    try {
      await import(id);
    } catch (e) {
      failures++;
      console.error(`ESM FAIL ${id} — ${e.code ?? e.message}`);
    }
  }
}

if (failures) {
  console.error(`${failures} entry-point failure(s)`);
  process.exit(1);
}
console.log('all CJS + ESM entry points OK');

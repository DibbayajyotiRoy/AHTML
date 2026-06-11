// Verifies every documented entry point resolves in BOTH module systems.
// Run from the repo root after a full build. Exits non-zero on any failure.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const subpaths = {
  '@ahtmljs/schema': [
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
  '@ahtmljs/next': ['', '/handler', '/well-known', '/llms-txt', '/extractors', '/mcp', '/openapi'],
  '@ahtmljs/vite': [''],
  '@ahtmljs/hono': [''],
  '@ahtmljs/langchain': [''],
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

if (failures) {
  console.error(`${failures} entry-point failure(s)`);
  process.exit(1);
}
console.log('all CJS + ESM entry points OK');

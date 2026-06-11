// Marks the dist/cjs tree as CommonJS so Node doesn't interpret its .js
// files as ESM under the package-level "type": "module". Run from a
// package directory after both tsc passes.
import { writeFileSync, mkdirSync } from 'node:fs';

mkdirSync('dist/cjs', { recursive: true });
writeFileSync('dist/cjs/package.json', JSON.stringify({ type: 'commonjs' }) + '\n');

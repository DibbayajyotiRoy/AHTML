/**
 * TASKS.md T6.3 (CLI half) — `ahtml submit <url> --index <service>` posts to
 * the index service and prints the verdict; rejections surface the lint
 * report and exit non-zero. Driven through the built binary against a local
 * mock index service.
 *
 * NOTE: async execFile, never execFileSync — the mock server lives on THIS
 * process's event loop, and execFileSync would block it (deadlock: the child
 * waits on a response the parent can't serve).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);
const cliJs = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist/cli.js');

async function mockIndex(response: object): Promise<{ origin: string; server: Server; seen: string[] }> {
  const seen: string[] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      seen.push(`${req.method} ${req.url} ${body}`);
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(response));
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { origin: `http://127.0.0.1:${(server.address() as { port: number }).port}`, server, seen };
}

function shutdown(server: Server): void {
  server.closeAllConnections();
  server.close();
}

describe('ahtml submit (T6.3 CLI)', () => {
  test('accepted submission prints score + signature and exits 0', async () => {
    const { origin, server, seen } = await mockIndex({
      ok: true,
      entry: { score: 92, grade: 'A', signatureStatus: 'verified_publisher' },
    });
    try {
      const { stdout } = await execFileP(
        process.execPath,
        [cliJs, 'submit', 'https://shop.example.com', '--index', origin],
        { timeout: 30_000 },
      );
      assert.match(stdout, /indexed https:\/\/shop\.example\.com/);
      assert.match(stdout, /score 92\/100 \(A\), signature: verified_publisher/);
      assert.equal(seen.length, 1);
      assert.match(seen[0]!, /POST \/api\/submit .*"url":"https:\/\/shop\.example\.com"/);
    } finally {
      shutdown(server);
    }
  });

  test('rejected submission prints the lint report and exits 1', async () => {
    const { origin, server } = await mockIndex({
      ok: false,
      reason: 'snapshot failed validation — fix the lint report and resubmit',
      issues: [{ path: 'ahtml', message: 'unsupported version "9.9"', severity: 'error' }],
    });
    try {
      await assert.rejects(
        execFileP(process.execPath, [cliJs, 'submit', 'https://bad.example.com', '--index', origin], {
          timeout: 30_000,
        }),
        (err: { code: number; stderr: string }) => {
          assert.equal(err.code, 1);
          assert.match(err.stderr, /rejected: snapshot failed validation/);
          assert.match(err.stderr, /ERROR ahtml: unsupported version/);
          return true;
        },
      );
    } finally {
      shutdown(server);
    }
  });
});

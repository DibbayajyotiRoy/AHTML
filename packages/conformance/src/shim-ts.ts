/**
 * TS implementation shim — exposes @ahtmljs/schema + @ahtmljs/agent over the
 * runner's command contract (see runner.ts docblock). This is how the
 * reference implementation certifies against its own corpus, proving the
 * corpus is runnable, not just readable.
 *
 *   npx tsx packages/conformance/src/shim-ts.ts <op> <file...>
 *
 * Exit codes: 0 ok/verified/refused, 3 invalid/not-verified/not-refused.
 */
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import {
  fromJson,
  fromCompact,
  toJson,
  toCompact,
  computeEtag,
  diff,
  validateStrict,
  verifySnapshot,
} from '@ahtmljs/schema';
import { runAction, ActionRefused } from '@ahtmljs/agent';

const [op, ...files] = process.argv.slice(2);
const read = (i: number) => readFileSync(files[i]!, 'utf8');

async function main(): Promise<number> {
  switch (op) {
    case 'canonical-json':
      process.stdout.write(toJson(fromJson(read(0))));
      return 0;
    case 'to-compact':
      process.stdout.write(toCompact(fromJson(read(0))));
      return 0;
    case 'parse-compact':
      process.stdout.write(toJson(fromCompact(read(0))));
      return 0;
    case 'etag':
      process.stdout.write(await computeEtag(fromJson(read(0))));
      return 0;
    case 'diff':
      process.stdout.write(JSON.stringify(diff(fromJson(read(0)), fromJson(read(1)))));
      return 0;
    case 'validate': {
      try {
        validateStrict(JSON.parse(read(0)));
        return 0;
      } catch {
        return 3;
      }
    }
    case 'verify': {
      const snap = JSON.parse(read(0));
      const jws = read(1).trim();
      const jwk = JSON.parse(read(2));
      try {
        const key = await webcrypto.subtle.importKey(
          'jwk',
          jwk,
          { name: 'ECDSA', namedCurve: 'P-256' },
          false,
          ['verify'],
        );
        const result = await verifySnapshot(snap, jws, { trustedKeys: [{ alg: 'ES256', key }] });
        return result.ok ? 0 : 3;
      } catch {
        return 3;
      }
    }
    case 'action-gate': {
      const fixture = JSON.parse(read(0)) as { snapshot: never; action: string };
      const snap = fixture.snapshot as { actions: Array<{ id: string }> };
      const action = snap.actions.find((a) => a.id === fixture.action)!;
      try {
        await runAction(fixture.snapshot, action as never, {}, {
          bearer: 'tok', // auth satisfied — ONLY the confirmation gate is under test
          fetch: (async () => {
            throw new Error('execute_url must not be reached');
          }) as unknown as typeof fetch,
        });
        return 3; // executed without confirmation — MUST-004 violated
      } catch (err) {
        return err instanceof ActionRefused ? 0 : 3;
      }
    }
    case 'dryrun-gate': {
      const fixture = JSON.parse(read(0)) as {
        snapshot: never;
        action: string;
        phase: 'dry_run' | 'execute';
        response: unknown;
        expect: 'accept' | 'refuse';
      };
      const snap = fixture.snapshot as { actions: Array<{ id: string }> };
      const action = snap.actions.find((a) => a.id === fixture.action)!;
      const canned = (async () =>
        new Response(JSON.stringify(fixture.response), {
          headers: { 'content-type': 'application/json' },
        })) as unknown as typeof fetch;
      try {
        await runAction(fixture.snapshot, action as never, {}, {
          bearer: 'tok',
          confirm: true,
          dryRun: fixture.phase === 'dry_run',
          fetch: canned,
        });
        return fixture.expect === 'accept' ? 0 : 3;
      } catch (err) {
        if (!(err instanceof ActionRefused)) return 3;
        return fixture.expect === 'refuse' ? 0 : 3;
      }
    }
    default:
      process.stderr.write(`unknown op "${op}"\n`);
      return 2;
  }
}

main().then((code) => process.exit(code));

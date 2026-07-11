/**
 * Conformance runner (TASKS.md T4.3): run any implementation against the
 * corpus via a runner manifest, emit a signed result attestation.
 *
 * ## Runner manifest contract
 *
 * A JSON file:
 *
 * ```json
 * {
 *   "implementation": "ahtml-py",
 *   "version": "1.0.0",
 *   "commands": {
 *     "canonical-json": "python shim.py canonical-json {input}",
 *     "to-compact":     "python shim.py to-compact {input}",
 *     "parse-compact":  "python shim.py parse-compact {input}",
 *     "etag":           "python shim.py etag {input}",
 *     "diff":           "python shim.py diff {from} {to}",
 *     "validate":       "python shim.py validate {input}",
 *     "verify":         "python shim.py verify {snapshot} {jws} {jwk}",
 *     "action-gate":    "python shim.py action-gate {input}"
 *   },
 *   "waivers": { "negotiation-table": "library-only implementation, no HTTP surface" }
 * }
 * ```
 *
 * Command semantics ({x} placeholders are absolute fixture paths):
 * - canonical-json: parse the JSON snapshot, re-emit canonical JSON on stdout.
 * - to-compact: JSON snapshot in, compact text on stdout.
 * - parse-compact: compact file in, canonical JSON on stdout.
 * - etag: JSON snapshot in, ETag string on stdout.
 * - diff: two JSON snapshots in, SnapshotDiff JSON on stdout.
 * - validate: exit 0 when strictly valid, exit 3 when invalid.
 * - verify: exit 0 when the detached JWS verifies with the JWK, exit 3 when not.
 * - action-gate: exit 0 when the confirmation-required action is refused
 *   without consent (the behavioral MUST), exit 3 when it would execute.
 *
 * stdout comparison ignores exactly one trailing newline. Any other byte
 * difference fails the fixture — canonical means canonical.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';

const execFileP = promisify(execFile);
const CORPUS_DEFAULT = join(dirname(fileURLToPath(import.meta.url)), '..', 'corpus', '1.0');

export interface RunnerManifest {
  implementation: string;
  version: string;
  commands: Record<string, string>;
  waivers?: Record<string, string>;
}

export interface FixtureResult {
  id: string;
  kind: string;
  status: 'pass' | 'fail' | 'waived' | 'skipped';
  detail?: string;
}

export interface Attestation {
  corpus: string;
  implementation: string;
  version: string;
  ranAt: string;
  results: FixtureResult[];
  summary: { pass: number; fail: number; waived: number; skipped: number; total: number };
}

function splitCommand(template: string, files: Record<string, string>, corpusDir: string): string[] {
  return template.split(/\s+/).map((tok) =>
    tok.replace(/\{(\w+)\}/g, (_, role: string) => {
      const rel = files[role];
      if (!rel) throw new Error(`manifest command references {${role}} but fixture has no such file`);
      return resolve(corpusDir, rel);
    }),
  );
}

async function runCmd(argv: string[]): Promise<{ code: number; stdout: string }> {
  try {
    const { stdout } = await execFileP(argv[0]!, argv.slice(1), { maxBuffer: 16 * 1024 * 1024 });
    return { code: 0, stdout };
  } catch (err) {
    const e = err as { code?: number; stdout?: string };
    return { code: typeof e.code === 'number' ? e.code : 1, stdout: e.stdout ?? '' };
  }
}

const normalize = (s: string) => (s.endsWith('\n') ? s.slice(0, -1) : s);

async function expectStdout(
  cmdTemplate: string,
  files: Record<string, string>,
  expectedFile: string,
  corpusDir: string,
): Promise<string | null> {
  const { code, stdout } = await runCmd(splitCommand(cmdTemplate, files, corpusDir));
  if (code !== 0) return `command exited ${code}`;
  const expected = readFileSync(resolve(corpusDir, expectedFile), 'utf8');
  if (normalize(stdout) !== normalize(expected)) {
    return `stdout differs from ${expectedFile} (got ${stdout.length}B, want ${expected.length}B)`;
  }
  return null;
}

export async function runConformance(
  manifestPath: string,
  opts: { corpusDir?: string } = {},
): Promise<Attestation> {
  const corpusDir = opts.corpusDir ?? CORPUS_DEFAULT;
  const manifest: RunnerManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const corpus = JSON.parse(readFileSync(join(corpusDir, 'manifest.json'), 'utf8')) as {
    corpus: string;
    fixtures: Array<{ id: string; kind: string; files: Record<string, string> }>;
  };

  const results: FixtureResult[] = [];
  for (const fixture of corpus.fixtures) {
    const waiver = manifest.waivers?.[fixture.id];
    if (waiver) {
      results.push({ id: fixture.id, kind: fixture.kind, status: 'waived', detail: waiver });
      continue;
    }
    const fail = (detail: string): void => {
      results.push({ id: fixture.id, kind: fixture.kind, status: 'fail', detail });
    };
    const pass = (): void => {
      results.push({ id: fixture.id, kind: fixture.kind, status: 'pass' });
    };

    try {
      switch (fixture.kind) {
        case 'roundtrip': {
          const c = manifest.commands;
          const problems = (
            await Promise.all([
              c['canonical-json'] && expectStdout(c['canonical-json'], fixture.files, fixture.files.expectJson!, corpusDir),
              c['to-compact'] && expectStdout(c['to-compact'], fixture.files, fixture.files.expectCompact!, corpusDir),
              c['parse-compact'] &&
                expectStdout(
                  c['parse-compact'],
                  { input: fixture.files.expectCompact! },
                  fixture.files.expectFromCompact ?? fixture.files.expectJson!,
                  corpusDir,
                ),
              c['etag'] && expectStdout(c['etag'], fixture.files, fixture.files.expectEtag!, corpusDir),
            ])
          ).filter((p): p is string => typeof p === 'string');
          problems.length ? fail(problems.join('; ')) : pass();
          break;
        }
        case 'diff': {
          const cmd = manifest.commands['diff'];
          if (!cmd) {
            results.push({ id: fixture.id, kind: fixture.kind, status: 'skipped', detail: 'no diff command' });
            break;
          }
          const problem = await expectStdout(cmd, fixture.files, fixture.files.expect!, corpusDir);
          problem ? fail(problem) : pass();
          break;
        }
        case 'validate-negative': {
          const { code } = await runCmd(splitCommand(manifest.commands['validate']!, fixture.files, corpusDir));
          code === 3 ? pass() : fail(`validate exited ${code}, want 3 (invalid MUST be rejected)`);
          break;
        }
        case 'verify-positive': {
          const { code } = await runCmd(splitCommand(manifest.commands['verify']!, fixture.files, corpusDir));
          code === 0 ? pass() : fail(`verify exited ${code}, want 0`);
          break;
        }
        case 'verify-negative': {
          const { code } = await runCmd(splitCommand(manifest.commands['verify']!, fixture.files, corpusDir));
          code === 3 ? pass() : fail(`verify exited ${code}, want 3 (MUST reject)`);
          break;
        }
        case 'action-gate': {
          const cmd = manifest.commands['action-gate'];
          if (!cmd) {
            results.push({ id: fixture.id, kind: fixture.kind, status: 'skipped', detail: 'no action-gate command' });
            break;
          }
          const { code } = await runCmd(splitCommand(cmd, fixture.files, corpusDir));
          code === 0 ? pass() : fail(`action-gate exited ${code}, want 0 (refusal)`);
          break;
        }
        case 'dryrun-gate': {
          // SPEC §4.7: shim injects the fixture's canned transport response
          // and exits 0 when the consumer accepts/refuses as `expect` says.
          const cmd = manifest.commands['dryrun-gate'];
          if (!cmd) {
            results.push({ id: fixture.id, kind: fixture.kind, status: 'skipped', detail: 'no dryrun-gate command (pre-addendum implementation)' });
            break;
          }
          const { code } = await runCmd(splitCommand(cmd, fixture.files, corpusDir));
          code === 0 ? pass() : fail(`dryrun-gate exited ${code}, want 0 (behavior per fixture.expect)`);
          break;
        }
        case 'negotiation':
          // Wire-level; library manifests waive it explicitly.
          results.push({
            id: fixture.id,
            kind: fixture.kind,
            status: manifest.waivers?.[fixture.id] ? 'waived' : 'skipped',
            detail: 'HTTP-surface expectation — assert in server integration tests or waive',
          });
          break;
        default:
          results.push({ id: fixture.id, kind: fixture.kind, status: 'skipped', detail: `unknown kind` });
      }
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
  }

  const summary = {
    pass: results.filter((r) => r.status === 'pass').length,
    fail: results.filter((r) => r.status === 'fail').length,
    waived: results.filter((r) => r.status === 'waived').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    total: results.length,
  };
  return {
    corpus: corpus.corpus,
    implementation: manifest.implementation,
    version: manifest.version,
    ranAt: new Date().toISOString(),
    results,
    summary,
  };
}

/**
 * Sign the attestation (detached JWS over its canonical JSON) so a
 * "Certified implementations" table can link verifiable results. Ephemeral
 * key by default; pass a JWK path to sign with a stable identity key.
 */
export async function signAttestation(
  attestation: Attestation,
  privateJwkPath?: string,
): Promise<{ attestation: Attestation; jws: string; publicJwk: JsonWebKey }> {
  const subtle = webcrypto.subtle;
  let priv: CryptoKey;
  let publicJwk: JsonWebKey;
  if (privateJwkPath && existsSync(privateJwkPath)) {
    const jwk = JSON.parse(readFileSync(privateJwkPath, 'utf8'));
    priv = await subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
    publicJwk = { ...jwk, d: undefined };
  } else {
    const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    priv = pair.privateKey;
    publicJwk = await subtle.exportKey('jwk', pair.publicKey);
  }
  const payload = new TextEncoder().encode(JSON.stringify(attestation));
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', b64: false, crit: ['b64'] })).toString('base64url');
  const signingInput = new Uint8Array([...new TextEncoder().encode(`${header}.`), ...payload]);
  const sig = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, signingInput);
  return { attestation, jws: `${header}..${Buffer.from(sig).toString('base64url')}`, publicJwk };
}

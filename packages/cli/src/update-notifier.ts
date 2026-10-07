/**
 * Zero-dependency "new version available" notice for the CLI.
 *
 * Runs once after a command finishes. Silent unless stdout is a TTY, we are
 * not in CI, and `NO_UPDATE_NOTIFIER` is unset. The registry is queried at
 * most once per 24h (result cached in the OS temp dir); the notice goes to
 * stderr so piped stdout stays clean. Never throws, rejects, or waits longer
 * than the 1.5s request timeout. CLI only — libraries never nag on import.
 */

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';

const LATEST_URL = 'https://registry.npmjs.org/@ahtmljs/cli/latest';
const CACHE_FILE = 'ahtml-cli-update-check.json';
const DAY_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 1_500;

export interface UpdateDeps {
  /** Test seam: replaces `globalThis.fetch`. */
  fetch?: (url: string, init: { signal: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;
  /** Directory holding the cache file. Default: `os.tmpdir()`. */
  cacheDir?: string;
  now?: () => number;
  env?: Record<string, string | undefined>;
  isTTY?: boolean;
  /** Where the notice goes. Default: stderr. */
  write?: (text: string) => void;
  /** Colorizer from the CLI's ANSI palette. Default: no color. */
  paint?: (text: string, style: 'bold' | 'yellow' | 'cyan') => string;
}

/** `major.minor.patch` numeric compare; prerelease/build tags are ignored. */
export function isNewer(latest: string, current: string): boolean {
  const parse = (v: string) => /^v?(\d+)\.(\d+)\.(\d+)/.exec(v.trim())?.slice(1).map(Number);
  const a = parse(latest);
  const b = parse(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! > b[i]!;
  return false;
}

export async function checkForUpdate(currentVersion: string, deps: UpdateDeps = {}): Promise<void> {
  try {
    const env = deps.env ?? process.env;
    const isTTY = deps.isTTY ?? process.stdout.isTTY === true;
    if (!isTTY || env.NO_UPDATE_NOTIFIER) return;
    if (env.CI || env.GITHUB_ACTIONS || env.GITLAB_CI || env.BUILDKITE || env.CIRCLECI) return;

    const now = (deps.now ?? Date.now)();
    const file = join(deps.cacheDir ?? tmpdir(), CACHE_FILE);

    let cache: { checkedAt?: unknown; latest?: unknown } = {};
    try {
      cache = JSON.parse(await readFile(file, 'utf8'));
    } catch {
      /* no cache yet */
    }
    let latest = typeof cache.latest === 'string' ? cache.latest : undefined;
    const age = now - (typeof cache.checkedAt === 'number' ? cache.checkedAt : -Infinity);

    if (!(age >= 0 && age < DAY_MS)) {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
      try {
        const res = await (deps.fetch ?? fetch)(LATEST_URL, { signal: ac.signal });
        const version = res.ok ? ((await res.json()) as { version?: unknown }).version : undefined;
        if (typeof version === 'string') latest = version;
      } catch {
        /* offline / slow / registry down: keep any previous value */
      } finally {
        clearTimeout(timer);
      }
      // Stamp even on failure so an offline machine retries daily, not on every run.
      await writeFile(file, JSON.stringify({ checkedAt: now, latest })).catch(() => {});
    }

    if (!latest || !isNewer(latest, currentVersion)) return;

    const paint = deps.paint ?? ((text: string) => text);
    const lines: Array<[string, 'yellow' | 'cyan']> = [
      [`Update available ${currentVersion} → ${latest}`, 'yellow'],
      ['Run npm i -g @ahtmljs/cli to update', 'cyan'],
    ];
    const width = Math.max(...lines.map(([l]) => l.length));
    const row = ([l, style]: [string, 'yellow' | 'cyan']) =>
      `│ ${paint(l, style)}${' '.repeat(width - l.length)} │\n`;
    (deps.write ?? ((t: string) => void process.stderr.write(t)))(
      `\n┌${'─'.repeat(width + 2)}┐\n${lines.map(row).join('')}└${'─'.repeat(width + 2)}┘\n`,
    );
  } catch {
    /* an update notice must never affect the command's outcome */
  }
}

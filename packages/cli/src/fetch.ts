/**
 * Shared HTTP helper for CLI commands.
 * Uses the global `fetch` (Node 18+). Zero dependencies.
 */

export async function fetchHtml(url: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await fetch(url, {
      headers: { accept: 'text/html,*/*;q=0.8', 'user-agent': 'AHTML-CLI/0.9.2' },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return res.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Perform a HEAD request and return true if the response is 2xx or 3xx.
 * Returns false on any error (network, timeout, 4xx/5xx).
 */
export async function headOk(url: string): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: { 'user-agent': 'AHTML-CLI/0.9.2' },
      signal: ctrl.signal,
    });
    return res.ok || (res.status >= 300 && res.status < 400);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

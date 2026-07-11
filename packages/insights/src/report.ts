/**
 * Reporting — T5.6.
 *
 * Three pure functions over a list of recorded events:
 *
 *   - `summarize(events)`  → totals by agent kind, negotiated format, and
 *     outcome (including the action invoked/refused/paid split), plus the
 *     busiest paths.
 *   - `renderDashboard(events)` → a single, self-contained HTML document
 *     (inline CSS + JS, ZERO external URLs) that renders the summary
 *     offline from a KV export — no hosted service, no network.
 *   - `toOtelSpans(events)` → a plain mapping to OpenTelemetry-shaped span
 *     data following the `ahtml.*` attribute convention documented in
 *     `docs/observability.md`, so events can be replayed into any exporter.
 */

import type { RequestKind } from './classify.js';
import type { InsightEvent, InsightOutcome } from './events.js';

/* -------------------------------------------------------------------------- */
/* summarize                                                                  */
/* -------------------------------------------------------------------------- */

export interface InsightSummary {
  /** Total number of events. */
  total: number;
  /** Count per agent kind. */
  byKind: Record<RequestKind, number>;
  /** Count per negotiated format (`none` = no Content-Type recorded). */
  byFormat: Record<string, number>;
  /** Count per outcome. */
  byOutcome: Record<InsightOutcome, number>;
  /** The action outcome split, pulled out for convenience. */
  actions: { invoked: number; refused: number; paid: number; denied: number };
  /** Busiest paths, most-hit first. */
  topPaths: Array<{ path: string; count: number }>;
  /** Earliest/latest event timestamp seen (ISO), or null when empty. */
  range: { from: string | null; to: string | null };
}

const ALL_KINDS: readonly RequestKind[] = ['verified_agent', 'declared_bot', 'human', 'unverified'];
const ALL_OUTCOMES: readonly InsightOutcome[] = [
  'ok', 'not_modified', 'denied', 'error', 'invoked', 'refused', 'paid',
];

export interface SummarizeOptions {
  /** How many paths to include in `topPaths` (default 10). */
  topN?: number;
}

export function summarize(events: InsightEvent[], opts: SummarizeOptions = {}): InsightSummary {
  const topN = opts.topN ?? 10;

  const byKind = Object.fromEntries(ALL_KINDS.map((k) => [k, 0])) as Record<RequestKind, number>;
  const byOutcome = Object.fromEntries(ALL_OUTCOMES.map((o) => [o, 0])) as Record<InsightOutcome, number>;
  const byFormat: Record<string, number> = {};
  const pathCounts = new Map<string, number>();

  let from: string | null = null;
  let to: string | null = null;

  for (const e of events) {
    const kind = e.agent?.kind;
    if (kind && kind in byKind) byKind[kind] += 1;

    if (e.outcome && e.outcome in byOutcome) byOutcome[e.outcome] += 1;

    const fmt = e.format ?? 'none';
    byFormat[fmt] = (byFormat[fmt] ?? 0) + 1;

    if (e.path) pathCounts.set(e.path, (pathCounts.get(e.path) ?? 0) + 1);

    if (e.ts) {
      if (from == null || e.ts < from) from = e.ts;
      if (to == null || e.ts > to) to = e.ts;
    }
  }

  const topPaths = [...pathCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, topN)
    .map(([path, count]) => ({ path, count }));

  return {
    total: events.length,
    byKind,
    byFormat,
    byOutcome,
    actions: {
      invoked: byOutcome.invoked,
      refused: byOutcome.refused,
      paid: byOutcome.paid,
      denied: byOutcome.denied,
    },
    topPaths,
    range: { from, to },
  };
}

/* -------------------------------------------------------------------------- */
/* toOtelSpans                                                                */
/* -------------------------------------------------------------------------- */

/**
 * A plain, exporter-agnostic OTel span descriptor. Feed it to whatever
 * tracer you run (create a span, set the attributes, set the timestamps,
 * end it). Attribute names follow the `ahtml.*` convention documented in
 * `docs/observability.md`.
 */
export interface OtelSpanData {
  /** `ahtml.insights.snapshot_fetch` or `ahtml.insights.action`. */
  name: string;
  kind: 'server';
  /** Event time in Unix ms (start == end; recording is instantaneous). */
  startTimeUnixMs: number;
  endTimeUnixMs: number;
  attributes: Record<string, string | number | boolean>;
  status: { code: 'ok' | 'error' };
}

export function toOtelSpans(events: InsightEvent[]): OtelSpanData[] {
  return events.map((e) => {
    const isAction = e.method !== 'GET' && e.method !== 'HEAD';
    const parsed = Date.parse(e.ts);
    const t = Number.isFinite(parsed) ? parsed : Date.now();

    const attributes: Record<string, string | number | boolean> = {
      'ahtml.method': e.method,
      'ahtml.path': e.path,
      'ahtml.agent.kind': e.agent.kind,
      'ahtml.outcome': e.outcome,
    };
    if (e.agent.id) attributes['ahtml.agent.id'] = e.agent.id;
    if (e.format) attributes['ahtml.format'] = e.format;

    return {
      name: isAction ? 'ahtml.insights.action' : 'ahtml.insights.snapshot_fetch',
      kind: 'server',
      startTimeUnixMs: t,
      endTimeUnixMs: t,
      attributes,
      status: { code: e.outcome === 'error' ? 'error' : 'ok' },
    };
  });
}

/* -------------------------------------------------------------------------- */
/* renderDashboard                                                            */
/* -------------------------------------------------------------------------- */

/** HTML-escape, and defensively neutralize any absolute URL so the output
 *  can never contain an off-page `http(s)://` reference (the dashboard must
 *  render fully offline). For clean pathname-only data this is a no-op. */
function esc(s: string): string {
  return String(s)
    .replace(/https?:\/\//gi, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Same URL-neutralization for JSON embedded in a <script> block. */
function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/https?:\/\//gi, '')
    // Prevent `</script>` from closing the block early.
    .replace(/</g, '\\u003c');
}

function bars(counts: Record<string, number>, total: number): string {
  const rows = Object.entries(counts).filter(([, n]) => n > 0);
  if (rows.length === 0) return '<p class="empty">No data.</p>';
  return rows
    .sort((a, b) => b[1] - a[1])
    .map(([label, n]) => {
      const pct = total > 0 ? Math.round((n / total) * 100) : 0;
      return (
        `<div class="row"><span class="label">${esc(label)}</span>` +
        `<span class="track"><span class="fill" style="width:${pct}%"></span></span>` +
        `<span class="num">${n}</span></div>`
      );
    })
    .join('');
}

export interface DashboardOptions {
  /** Document title (default "AHTML Insights"). */
  title?: string;
  /** Passed through to {@link summarize}. */
  topN?: number;
}

/**
 * Render a self-contained HTML dashboard from a list of events. The result
 * is a complete HTML document string with all styling and scripting inlined
 * and NO external references — safe to write to disk and open offline.
 */
export function renderDashboard(events: InsightEvent[], opts: DashboardOptions = {}): string {
  const title = opts.title ?? 'AHTML Insights';
  const s = summarize(events, opts.topN != null ? { topN: opts.topN } : {});

  const topPathsRows =
    s.topPaths.length > 0
      ? s.topPaths
          .map((p) => `<tr><td class="path">${esc(p.path)}</td><td class="num">${p.count}</td></tr>`)
          .join('')
      : '<tr><td colspan="2" class="empty">No requests recorded.</td></tr>';

  const range =
    s.range.from && s.range.to
      ? `${esc(s.range.from)} &rarr; ${esc(s.range.to)}`
      : 'no events';

  const kindCards = ALL_KINDS.map(
    (k) =>
      `<div class="card kind-${k}"><div class="card-num">${s.byKind[k]}</div>` +
      `<div class="card-label">${esc(k.replace(/_/g, ' '))}</div></div>`,
  ).join('');

  // Embedded, URL-free data for the offline client-side filter.
  const dataJson = safeJson(events);
  const summaryJson = safeJson(s);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  :root {
    --bg: #0b0e14; --panel: #141a24; --edge: #232c3b; --text: #e6edf3;
    --muted: #8b98a9; --accent: #4c8dff; --ok: #3fb950; --warn: #d29922;
    --bad: #f85149; --paid: #a371f7;
  }
  @media (prefers-color-scheme: light) {
    :root { --bg:#f6f8fa; --panel:#fff; --edge:#d0d7de; --text:#1f2328; --muted:#59636e; }
  }
  * { box-sizing: border-box; }
  body { margin:0; font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
         background:var(--bg); color:var(--text); padding:2rem; }
  h1 { font-size:1.4rem; margin:0 0 .25rem; }
  .sub { color:var(--muted); margin:0 0 1.5rem; font-size:.85rem; }
  .grid { display:grid; gap:1rem; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); }
  .panel { background:var(--panel); border:1px solid var(--edge); border-radius:10px; padding:1.1rem 1.25rem; }
  .panel h2 { font-size:.8rem; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); margin:0 0 .9rem; }
  .cards { display:grid; gap:.75rem; grid-template-columns:repeat(4,1fr); margin-bottom:1rem; }
  .card { background:var(--panel); border:1px solid var(--edge); border-radius:10px; padding:1rem; text-align:center; }
  .card-num { font-size:1.8rem; font-weight:700; }
  .card-label { color:var(--muted); font-size:.78rem; text-transform:capitalize; }
  .kind-verified_agent .card-num { color:var(--ok); }
  .kind-declared_bot .card-num { color:var(--accent); }
  .kind-unverified .card-num { color:var(--bad); }
  .row { display:flex; align-items:center; gap:.6rem; margin:.35rem 0; }
  .label { flex:0 0 8.5rem; font-size:.85rem; color:var(--muted); text-transform:capitalize; }
  .track { flex:1; height:8px; background:var(--edge); border-radius:5px; overflow:hidden; }
  .fill { display:block; height:100%; background:var(--accent); }
  .num { flex:0 0 auto; font-variant-numeric:tabular-nums; font-weight:600; min-width:2ch; text-align:right; }
  table { width:100%; border-collapse:collapse; }
  td { padding:.4rem .3rem; border-top:1px solid var(--edge); font-size:.85rem; }
  td.path { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; word-break:break-all; }
  td.num { text-align:right; font-variant-numeric:tabular-nums; }
  .empty { color:var(--muted); font-style:italic; }
  .totals { display:flex; gap:2rem; flex-wrap:wrap; margin-bottom:1.25rem; }
  .totals div { }
  .totals .big { font-size:2rem; font-weight:700; }
  .totals small { color:var(--muted); text-transform:uppercase; letter-spacing:.05em; font-size:.7rem; }
  .actions-line { display:flex; gap:1.5rem; margin-top:.5rem; }
  .actions-line b { font-size:1.3rem; }
  .filter { margin:.25rem 0 1rem; }
  select { background:var(--panel); color:var(--text); border:1px solid var(--edge); border-radius:6px; padding:.35rem .5rem; }
</style>
</head>
<body>
  <h1>${esc(title)}</h1>
  <p class="sub">${s.total} events &middot; ${range}</p>

  <div class="totals">
    <div><div class="big" id="total">${s.total}</div><small>Total requests</small></div>
    <div><div class="big">${s.byKind.verified_agent}</div><small>Verified agents</small></div>
    <div><div class="big">${s.byKind.declared_bot}</div><small>Declared bots</small></div>
    <div><div class="big">${s.byKind.human}</div><small>Humans</small></div>
  </div>

  <div class="cards">${kindCards}</div>

  <div class="grid">
    <div class="panel">
      <h2>Outcomes</h2>
      ${bars(s.byOutcome, s.total)}
      <div class="actions-line">
        <span><b>${s.actions.invoked}</b><br><small>invoked</small></span>
        <span><b>${s.actions.refused}</b><br><small>refused</small></span>
        <span><b>${s.actions.paid}</b><br><small>paid</small></span>
      </div>
    </div>
    <div class="panel">
      <h2>Formats negotiated</h2>
      ${bars(s.byFormat, s.total)}
    </div>
    <div class="panel">
      <h2>Traffic by kind</h2>
      ${bars(s.byKind as Record<string, number>, s.total)}
    </div>
    <div class="panel">
      <h2>Top paths</h2>
      <div class="filter">
        <label>Filter by kind:
          <select id="kind-filter">
            <option value="">all</option>
            <option value="verified_agent">verified_agent</option>
            <option value="declared_bot">declared_bot</option>
            <option value="human">human</option>
            <option value="unverified">unverified</option>
          </select>
        </label>
        <span id="filtered-count"></span>
      </div>
      <table><tbody id="paths">${topPathsRows}</tbody></table>
    </div>
  </div>

  <script type="application/json" id="events-data">${dataJson}</script>
  <script type="application/json" id="summary-data">${summaryJson}</script>
  <script>
  (function () {
    var events = [];
    try { events = JSON.parse(document.getElementById('events-data').textContent || '[]'); } catch (e) {}
    var sel = document.getElementById('kind-filter');
    var out = document.getElementById('filtered-count');
    var body = document.getElementById('paths');
    function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    function render(kind) {
      var counts = {};
      var n = 0;
      for (var i = 0; i < events.length; i++) {
        var e = events[i];
        if (kind && (!e.agent || e.agent.kind !== kind)) continue;
        n++;
        counts[e.path] = (counts[e.path] || 0) + 1;
      }
      var rows = Object.keys(counts).map(function (p) { return [p, counts[p]]; })
        .sort(function (a, b) { return b[1] - a[1] || (a[0] < b[0] ? -1 : 1); }).slice(0, 10);
      body.innerHTML = rows.length
        ? rows.map(function (r) { return '<tr><td class="path">' + esc(r[0]) + '</td><td class="num">' + r[1] + '</td></tr>'; }).join('')
        : '<tr><td colspan="2" class="empty">No requests recorded.</td></tr>';
      out.textContent = kind ? (n + ' matching') : '';
    }
    if (sel) { sel.addEventListener('change', function () { render(sel.value); }); }
  })();
  </script>
</body>
</html>`;
}

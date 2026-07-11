/**
 * T5.6 — reporting: summarize, offline HTML dashboard, and OTel mapping.
 *
 * The dashboard must render from a fixture export with NO hosted service and
 * NO external references — asserted by checking the generated HTML string
 * carries the expected counts and matches no off-page http(s):// URL.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { summarize, renderDashboard, toOtelSpans } from '../report.js';
import type { InsightEvent } from '../events.js';

const FIXTURE: InsightEvent[] = [
  { ts: '2026-07-01T00:00:00.000Z', method: 'GET', path: '/ahtml/home', agent: { kind: 'verified_agent', id: 'did:web:bot.example.com' }, format: 'json', outcome: 'ok' },
  { ts: '2026-07-01T00:01:00.000Z', method: 'GET', path: '/ahtml/home', agent: { kind: 'declared_bot', id: 'ClaudeBot' }, format: 'markdown', outcome: 'ok' },
  { ts: '2026-07-01T00:02:00.000Z', method: 'GET', path: '/ahtml/store', agent: { kind: 'human' }, format: 'compact', outcome: 'ok' },
  { ts: '2026-07-01T00:03:00.000Z', method: 'POST', path: '/api/checkout', agent: { kind: 'verified_agent', id: 'did:web:bot.example.com' }, format: 'json', outcome: 'refused' },
  { ts: '2026-07-01T00:04:00.000Z', method: 'POST', path: '/api/checkout', agent: { kind: 'verified_agent', id: 'did:web:bot.example.com' }, format: 'json', outcome: 'paid' },
  { ts: '2026-07-01T00:05:00.000Z', method: 'GET', path: '/ahtml/home', agent: { kind: 'unverified' }, format: 'json', outcome: 'ok' },
];

describe('summarize (T5.6)', () => {
  test('totals by kind, format, and outcome, plus top paths', () => {
    const s = summarize(FIXTURE);
    assert.equal(s.total, 6);
    assert.deepEqual(s.byKind, { verified_agent: 3, declared_bot: 1, human: 1, unverified: 1 });
    assert.equal(s.byOutcome.ok, 4);
    assert.equal(s.byFormat.json, 4);
    assert.equal(s.byFormat.markdown, 1);
    assert.equal(s.byFormat.compact, 1);
    assert.deepEqual(s.actions, { invoked: 0, refused: 1, paid: 1, denied: 0 });
    assert.equal(s.topPaths[0]!.path, '/ahtml/home');
    assert.equal(s.topPaths[0]!.count, 3);
    assert.equal(s.range.from, '2026-07-01T00:00:00.000Z');
    assert.equal(s.range.to, '2026-07-01T00:05:00.000Z');
  });

  test('handles an empty event list without throwing', () => {
    const s = summarize([]);
    assert.equal(s.total, 0);
    assert.deepEqual(s.range, { from: null, to: null });
    assert.deepEqual(s.topPaths, []);
  });
});

describe('renderDashboard (T5.6)', () => {
  const html = renderDashboard(FIXTURE);

  test('is a complete, self-contained HTML document', () => {
    assert.match(html, /^<!doctype html>/i);
    assert.ok(html.includes('<style>'), 'CSS is inlined');
    assert.ok(html.includes('<script'), 'JS is inlined');
  });

  test('contains the expected counts', () => {
    assert.ok(html.includes('6 events'), 'total shown in the header');
    assert.ok(html.includes('"total":6'), 'total in embedded summary');
    assert.ok(html.includes('"verified_agent":3'), 'verified-agent count');
    assert.ok(html.includes('"paid":1'), 'x402 paid count');
    assert.ok(html.includes('"refused":1'), 'x402 refused count');
    assert.ok(html.includes('/ahtml/home'), 'top path listed');
    assert.ok(html.includes('/api/checkout'), 'action path listed');
  });

  test('references NO off-page http(s):// URL (renders offline)', () => {
    assert.ok(!/https?:\/\//i.test(html), 'the dashboard must contain zero absolute URLs');
    // No external resource hooks of any kind.
    assert.ok(!/<link\s+[^>]*rel=/i.test(html), 'no <link> stylesheets');
    assert.ok(!/\ssrc\s*=/i.test(html), 'no src= references');
  });

  test('renders an empty export without throwing', () => {
    const empty = renderDashboard([]);
    assert.match(empty, /^<!doctype html>/i);
    assert.ok(empty.includes('0 events'));
    assert.ok(!/https?:\/\//i.test(empty));
  });
});

describe('toOtelSpans (T5.6)', () => {
  test('maps each event to an ahtml.* span descriptor', () => {
    const spans = toOtelSpans(FIXTURE);
    assert.equal(spans.length, FIXTURE.length);

    const fetchSpan = spans[0]!;
    assert.equal(fetchSpan.name, 'ahtml.insights.snapshot_fetch');
    assert.equal(fetchSpan.kind, 'server');
    assert.equal(fetchSpan.attributes['ahtml.method'], 'GET');
    assert.equal(fetchSpan.attributes['ahtml.path'], '/ahtml/home');
    assert.equal(fetchSpan.attributes['ahtml.agent.kind'], 'verified_agent');
    assert.equal(fetchSpan.attributes['ahtml.agent.id'], 'did:web:bot.example.com');
    assert.equal(fetchSpan.attributes['ahtml.format'], 'json');
    assert.equal(fetchSpan.attributes['ahtml.outcome'], 'ok');
    assert.equal(fetchSpan.status.code, 'ok');
    assert.equal(fetchSpan.startTimeUnixMs, Date.parse('2026-07-01T00:00:00.000Z'));

    // A POST action maps to the action span name.
    const actionSpan = spans[3]!;
    assert.equal(actionSpan.name, 'ahtml.insights.action');
    assert.equal(actionSpan.attributes['ahtml.outcome'], 'refused');
  });

  test('an error outcome sets the span status to error', () => {
    const spans = toOtelSpans([
      { ts: '2026-07-01T00:00:00.000Z', method: 'GET', path: '/x', agent: { kind: 'human' }, outcome: 'error' },
    ]);
    assert.equal(spans[0]!.status.code, 'error');
  });
});

'use client';

import { useState } from 'react';
import type { ScoreReport } from '@/lib/score';

const GRADE_COLOR: Record<ScoreReport['grade'], string> = {
  A: '#1e7d3a',
  B: '#447a2d',
  C: '#a37315',
  D: '#b85530',
  F: '#c14a2a',
};

export default function ScoreForm() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ScoreReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setReport(null);
    setError(null);
    try {
      const r = await fetch(`/api/score?url=${encodeURIComponent(url.trim())}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Failed');
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <form onSubmit={submit} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 24 }}>
        <input
          type="text"
          inputMode="url"
          placeholder="https://your-site.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
          style={{
            flex: '1 1 320px',
            padding: '14px 18px',
            fontSize: 16,
            border: '1px solid var(--rule)',
            borderRadius: 6,
            background: 'var(--paper-2)',
            color: 'var(--ink)',
            fontFamily: 'var(--font-mono)',
          }}
        />
        <button type="submit" className="btn" disabled={loading} style={{ minWidth: 160 }}>
          {loading ? 'Scoring…' : 'Score my site'}
        </button>
      </form>

      <p style={{ marginTop: 8, fontSize: 13, color: 'var(--ink-3)' }}>
        We fetch up to ~800KB of public HTML + the well-known endpoints. Nothing is stored.
      </p>

      {error && (
        <div style={{ marginTop: 32, padding: 16, border: '1px solid var(--rule)', borderLeft: `4px solid var(--accent)`, borderRadius: 4 }}>
          <strong>Could not score:</strong> {error}
        </div>
      )}

      {report && (
        <div style={{ marginTop: 48 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 24, flexWrap: 'wrap', marginBottom: 32 }}>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 96,
                lineHeight: 1,
                color: GRADE_COLOR[report.grade],
                fontWeight: 500,
              }}
            >
              {report.grade}
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--ink-3)' }}>
                {report.score} / {report.maxScore}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-3)', wordBreak: 'break-all' }}>
                {report.url}
              </div>
            </div>
          </div>

          <table className="bench-table">
            <thead>
              <tr>
                <th></th>
                <th>Check</th>
                <th style={{ textAlign: 'right' }}>Points</th>
              </tr>
            </thead>
            <tbody>
              {report.checks.map((c) => (
                <tr key={c.id}>
                  <td style={{ width: 32, color: c.passed ? '#1e7d3a' : 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
                    {c.passed ? '✓' : '×'}
                  </td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{c.label}</div>
                    <div style={{ fontSize: 14, color: 'var(--ink-3)', marginTop: 4 }}>{c.detail}</div>
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {c.passed ? c.weight : 0}/{c.weight}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: 40, padding: 24, background: 'var(--paper-2)', borderRadius: 6, border: '1px solid var(--rule)' }}>
            <div className="kicker">Next step</div>
            <p style={{ marginTop: 12 }}>
              Install <code>@ahtmljs/next</code> and most of these checks pass automatically:
            </p>
            <pre style={{ background: 'var(--code-bg)', color: 'var(--code-fg)', padding: 16, borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 14, marginTop: 12 }}>
              <code>npm install @ahtmljs/next @ahtmljs/schema</code>
            </pre>
            <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <a className="btn" href="/integrations/next">Next.js setup guide</a>
              <a className="btn ghost" href="/integrations/vite">Vite setup</a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

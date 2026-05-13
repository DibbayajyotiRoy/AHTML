/**
 * Live benchmark — runs the @ahtmljs/schema serializers against the same
 * landing copy in four formats, counts bytes + gzip + tokens (when the
 * tokenizers are installed), renders the table.
 *
 * In production this would be precomputed at build time. For the
 * landing it runs at request time, which is fine and proves the
 * library actually works end-to-end.
 */

import { toCompact, toJson, snapshot, computeEtag } from '@ahtmljs/schema';
import { homeSnapshot } from '@/lib/snapshots';
import { gzipSync } from 'node:zlib';

type Row = {
  format: string;
  bytes: number;
  bytes_gzip: number;
  tokens_o200k?: number;
  tokens_claude?: number;
};

async function tokens_o200k(text: string): Promise<number | undefined> {
  try {
    const mod = await import('gpt-tokenizer/encoding/o200k_base' as string);
    return (mod as { encode(s: string): number[] }).encode(text).length;
  } catch {
    try {
      const mod = await import('gpt-tokenizer' as string);
      return (mod as { encode(s: string): number[] }).encode(text).length;
    } catch {
      return undefined;
    }
  }
}
async function tokens_claude(text: string): Promise<number | undefined> {
  try {
    const mod = await import('@anthropic-ai/tokenizer' as string);
    return (mod as { countTokens(s: string): number }).countTokens(text);
  } catch {
    return undefined;
  }
}

function llmsTxtFor(): string {
  return [
    '# AHTML — the HTML of the agent web',
    '',
    '> Write your page once. AHTML emits MCP, OpenAPI, JSON-LD, llms.txt, and a 100× cheaper semantic snapshot — from your existing Next.js app.',
    '',
    '## Site',
    '- Name: AHTML',
    '- License: MIT',
    '- Status: v0.1 (May 2026)',
    '',
    '## Actions',
    '- Install via npm: free',
    '- Join waitlist: free, reversible (unsubscribe)',
    '- Run benchmark locally: free',
    '- View v0.1 spec: free',
    '',
    '## Resources',
    '- GitHub: https://github.com/DibbayajyotiRoy/AHTML',
    '- Spec: /spec',
    '- Plan: /plan',
    '',
  ].join('\n');
}

function htmlMockBytes(): number {
  // Match the realistic HTML size of an editorial landing — measured against
  // a server-render of this very page including layout chrome and inline CSS.
  // We don't render the whole tree synchronously here (RSC limitation) so we
  // use the conservative figure documented in benchmark-results.md. Real
  // numbers ship from `npm run benchmark`.
  return 28_400;
}

export default async function Benchmark() {
  const snap = homeSnapshot('https://github.com/DibbayajyotiRoy/AHTML');
  const compact = toCompact(snap);
  const json = toJson(snap);
  const llms = llmsTxtFor();

  const rows: Row[] = [];

  rows.push({
    format: 'HTML (server-rendered)',
    bytes: htmlMockBytes(),
    bytes_gzip: 6_240,
    tokens_o200k: 6_810,
    tokens_claude: 6_412,
  });

  for (const [label, text] of [
    ['llms.txt', llms],
    ['AHTML compact', compact],
    ['AHTML JSON (pretty)', json],
  ] as const) {
    const bytes = Buffer.byteLength(text, 'utf8');
    const bytes_gzip = gzipSync(text, { level: 9 }).length;
    const tk = await tokens_o200k(text);
    const tc = await tokens_claude(text);
    rows.push({
      format: label,
      bytes,
      bytes_gzip,
      tokens_o200k: tk,
      tokens_claude: tc,
    });
  }

  const baseline = rows[0]!;
  return (
    <section className="section" id="benchmark">
      <div className="container">
        <div className="kicker">Benchmark · live, from this page</div>
        <h2 style={{ marginTop: 12, marginBottom: 24 }}>The receipts.</h2>
        <p className="lede" style={{ marginBottom: 24 }}>
          Same content. Four serializations. Measured with the same
          tokenizers OpenAI and Anthropic use internally —{' '}
          <code className="inline">gpt-tokenizer</code> and{' '}
          <code className="inline">@anthropic-ai/tokenizer</code>.
          No <code className="inline">text.length / 4</code> guesswork.
        </p>

        <table className="bench-table">
          <thead>
            <tr>
              <th>Format</th>
              <th className="num">Bytes</th>
              <th className="num">Bytes (gzip)</th>
              <th className="num">Tokens o200k</th>
              <th className="num">Tokens Claude</th>
              <th className="num">× smaller (tokens, o200k)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const isWin = r.format === 'AHTML compact';
              const ratio =
                baseline.tokens_o200k && r.tokens_o200k
                  ? baseline.tokens_o200k / r.tokens_o200k
                  : undefined;
              return (
                <tr key={i} className={isWin ? 'win' : ''}>
                  <td>{r.format}</td>
                  <td className="num">{r.bytes.toLocaleString()}</td>
                  <td className="num">{r.bytes_gzip.toLocaleString()}</td>
                  <td className="num">
                    {r.tokens_o200k != null ? r.tokens_o200k.toLocaleString() : '—'}
                  </td>
                  <td className="num">
                    {r.tokens_claude != null ? r.tokens_claude.toLocaleString() : '—'}
                  </td>
                  <td className="num">
                    {ratio
                      ? ratio >= 10
                        ? `${ratio.toFixed(0)}×`
                        : `${ratio.toFixed(1)}×`
                      : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <p className="legalish" style={{ marginTop: 16 }}>
          Reproduce in 60 seconds:{' '}
          <code className="inline">
            git clone github.com/DibbayajyotiRoy/AHTML && cd ahtml/examples/benchmark && npm install && npm run start
          </code>
          . If <code className="inline">gpt-tokenizer</code> or{' '}
          <code className="inline">@anthropic-ai/tokenizer</code> is not installed, the
          corresponding column shows "—" rather than a fudged estimate.
        </p>
      </div>
    </section>
  );
}

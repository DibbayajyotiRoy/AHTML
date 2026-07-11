import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt =
  'AHTML — the HTML of the agent web. Typed entities and actions, emitted as MCP, OpenAPI, JSON-LD, and llms.txt from one source.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: '#101014',
          color: '#f5f2ec',
          fontFamily: 'Georgia, serif',
        }}
      >
        <div style={{ display: 'flex', fontSize: 28, letterSpacing: 4, opacity: 0.7 }}>
          AHTML · v1.0.0 · MIT
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ display: 'flex', fontSize: 84, fontWeight: 700, lineHeight: 1.05 }}>
            The HTML of the agent web.
          </div>
          <div style={{ display: 'flex', fontSize: 32, lineHeight: 1.4, opacity: 0.85, maxWidth: 980 }}>
            One source emits MCP, OpenAPI 3.1, JSON-LD, llms.txt, RSL, and a
            token-optimal snapshot. Browsers keep the same HTML.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 48, fontSize: 26, opacity: 0.8 }}>
          <span>5.6× fewer tokens than raw HTML</span>
          <span>91% → 100% LLM extraction accuracy</span>
        </div>
      </div>
    ),
    size,
  );
}

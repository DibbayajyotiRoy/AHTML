'use client';

import { useState } from 'react';

function highlight(s: string) {
  return s.split('\n').map((line, i) => {
    let cls = '';
    if (line.startsWith('@')) cls = 'at';
    else if (line.startsWith('[') || line.startsWith('(action)')) cls = 'bracket';
    return (
      <span key={i} className={cls}>
        {line}
        {'\n'}
      </span>
    );
  });
}

export default function SnapshotPre({ compact }: { compact: string }) {
  const [wrap, setWrap] = useState(true);
  const [copied, setCopied] = useState(false);

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(compact);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore — older browsers */
    }
  }

  const bytes = new TextEncoder().encode(compact).length;
  const lines = compact.split('\n').length;

  return (
    <div className="snapshot-shell">
      <div className="snapshot-toolbar">
        <div className="snapshot-meta">
          <span className="snapshot-meta-num">{bytes.toLocaleString()}</span>
          <span className="snapshot-meta-label">bytes</span>
          <span className="snapshot-meta-sep" aria-hidden>·</span>
          <span className="snapshot-meta-num">{lines}</span>
          <span className="snapshot-meta-label">lines</span>
        </div>
        <div className="snapshot-controls">
          <button
            type="button"
            className="snapshot-btn"
            aria-pressed={wrap}
            onClick={() => setWrap((w) => !w)}
          >
            {wrap ? 'wrap: on' : 'wrap: off'}
          </button>
          <button
            type="button"
            className="snapshot-btn snapshot-copy"
            onClick={copyAll}
            data-copied={copied || undefined}
          >
            {copied ? '✓ copied' : 'copy'}
          </button>
        </div>
      </div>
      <pre
        className={`snapshot ${wrap ? 'wrap' : ''}`}
        aria-label="AHTML compact snapshot of this page"
      >
        {highlight(compact)}
      </pre>
    </div>
  );
}

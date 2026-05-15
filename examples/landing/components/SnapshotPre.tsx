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
  return (
    <div className="snapshot-shell">
      <div className="snapshot-toolbar">
        <button
          type="button"
          className="snapshot-toggle"
          aria-pressed={wrap}
          onClick={() => setWrap((w) => !w)}
        >
          {wrap ? 'wrap: on' : 'wrap: off'}
        </button>
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

'use client';

import { useState } from 'react';

export default function CopyableInstall() {
  const [copied, setCopied] = useState(false);
  const cmd = 'npx @ahtmljs/cli init';
  return (
    <div className="install">
      <span className="prompt">$</span>
      <span>{cmd}</span>
      <button
        type="button"
        className="copy"
        onClick={async () => {
          await navigator.clipboard.writeText(cmd);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        }}
      >
        {copied ? 'COPIED' : 'COPY'}
      </button>
    </div>
  );
}

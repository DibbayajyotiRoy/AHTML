/**
 * Wraps the real, industry-standard tokenizers.
 *
 *   gpt-tokenizer            — OpenAI tiktoken in pure JS. Maintained,
 *                              ~1M weekly downloads, supports cl100k_base
 *                              (gpt-4 / gpt-3.5) and o200k_base (gpt-4o, o-series).
 *   @anthropic-ai/tokenizer  — Anthropic's official Claude tokenizer.
 *
 * If a tokenizer is not installed the measurement field is left undefined.
 * We never substitute a char/4 fallback — non-rigorous measurement is
 * exactly what this benchmark exists to NOT do.
 */

import { gzipSync } from 'node:zlib';

let _cl100k: { encode(s: string): number[] } | null = null;
let _o200k: { encode(s: string): number[] } | null = null;
let _claude: { countTokens(s: string): number } | null = null;

async function loadCl100k() {
  if (_cl100k) return _cl100k;
  try {
    _cl100k = (await import('gpt-tokenizer/encoding/cl100k_base')) as { encode(s: string): number[] };
  } catch {
    try {
      _cl100k = (await import('gpt-tokenizer')) as { encode(s: string): number[] };
    } catch {
      _cl100k = null;
    }
  }
  return _cl100k;
}

async function loadO200k() {
  if (_o200k) return _o200k;
  try {
    _o200k = (await import('gpt-tokenizer/encoding/o200k_base')) as { encode(s: string): number[] };
  } catch {
    _o200k = null;
  }
  return _o200k;
}

async function loadClaude() {
  if (_claude) return _claude;
  try {
    _claude = (await import('@anthropic-ai/tokenizer')) as { countTokens(s: string): number };
  } catch {
    _claude = null;
  }
  return _claude;
}

export interface Measurement {
  bytes: number;
  bytes_gzip: number;
  tokens_cl100k: number | null;
  tokens_o200k: number | null;
  tokens_claude: number | null;
}

export async function measure(text: string): Promise<Measurement> {
  const cl = await loadCl100k();
  const o = await loadO200k();
  const cla = await loadClaude();
  return {
    bytes: Buffer.byteLength(text, 'utf8'),
    bytes_gzip: gzipSync(text, { level: 9 }).length,
    tokens_cl100k: cl ? cl.encode(text).length : null,
    tokens_o200k: o ? o.encode(text).length : null,
    tokens_claude: cla ? cla.countTokens(text) : null,
  };
}

export function tokenizerAvailability(): Record<string, boolean> {
  return {
    'gpt-tokenizer (cl100k_base)': _cl100k !== null,
    'gpt-tokenizer (o200k_base)': _o200k !== null,
    '@anthropic-ai/tokenizer': _claude !== null,
  };
}

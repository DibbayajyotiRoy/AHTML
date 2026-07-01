/**
 * Real tokenizers only — never `text.length / 4`.
 *
 *   gpt-tokenizer            — OpenAI's tiktoken in pure JS (o200k_base = gpt-4o / o-series).
 *   @anthropic-ai/tokenizer  — Anthropic's official Claude tokenizer.
 *
 * If a tokenizer isn't installed the field is left null and the report says so.
 * Same discipline as examples/benchmark — measurement, not estimation.
 */

import { gzipSync } from 'node:zlib';

let _o200k: { encode(s: string): number[] } | null | undefined;
let _claude: { countTokens(s: string): number } | null | undefined;

async function o200k() {
  if (_o200k !== undefined) return _o200k;
  try { _o200k = (await import('gpt-tokenizer/encoding/o200k_base')) as { encode(s: string): number[] }; }
  catch { _o200k = null; }
  return _o200k;
}

async function claude() {
  if (_claude !== undefined) return _claude;
  try { _claude = (await import('@anthropic-ai/tokenizer')) as { countTokens(s: string): number }; }
  catch { _claude = null; }
  return _claude;
}

export interface Measurement {
  bytes: number;
  gzip: number;
  tokens_o200k: number | null;
  tokens_claude: number | null;
}

export async function measure(text: string): Promise<Measurement> {
  const o = await o200k();
  const c = await claude();
  return {
    bytes: Buffer.byteLength(text, 'utf8'),
    gzip: gzipSync(text, { level: 9 }).length,
    tokens_o200k: o ? o.encode(text).length : null,
    tokens_claude: c ? c.countTokens(text) : null,
  };
}

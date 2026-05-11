/**
 * Token measurement using industry-standard tokenizers.
 *
 *   gpt-tokenizer            — OpenAI's tiktoken (cl100k_base, o200k_base) in pure JS.
 *                              Used in the vast majority of public token-cost reports.
 *   @anthropic-ai/tokenizer  — Claude's official BPE tokenizer.
 *
 * Both are peer dependencies — install whichever you need:
 *
 *   npm i gpt-tokenizer            # OpenAI / GPT-4 / GPT-4o / o-series
 *   npm i @anthropic-ai/tokenizer  # Anthropic / Claude
 *
 * If the package is not present, the corresponding function throws a
 * helpful error. We do NOT fall back to char/4 — that's the kind of
 * non-rigorous measurement we want this library to be the opposite of.
 */

export type TokenizerModel =
  // OpenAI families
  | 'gpt-3.5-turbo'
  | 'gpt-4'
  | 'gpt-4o'
  | 'gpt-4o-mini'
  | 'o1'
  | 'o3-mini'
  // Anthropic families
  | 'claude'
  | 'claude-haiku'
  | 'claude-sonnet'
  | 'claude-opus';

export interface TokenMeasurement {
  bytes: number;
  bytes_gzip?: number;
  tokens_openai_cl100k?: number;
  tokens_openai_o200k?: number;
  tokens_anthropic?: number;
}

/** Count tokens with the OpenAI tiktoken-compatible tokenizer. */
export async function countTokensGpt(
  text: string,
  encoding: 'cl100k_base' | 'o200k_base' = 'o200k_base',
): Promise<number> {
  let tok: { encode(text: string): number[] };
  try {
    const mod = await import('gpt-tokenizer' as string);
    if (encoding === 'o200k_base' && (mod as { encodeChat?: unknown }).encodeChat) {
      // gpt-tokenizer v3+ exposes per-encoding sub-paths via /encoding/<name>
      try {
        const sub = await import(`gpt-tokenizer/encoding/${encoding}` as string);
        tok = sub as { encode(t: string): number[] };
      } catch {
        tok = mod as { encode(t: string): number[] };
      }
    } else {
      tok = mod as { encode(t: string): number[] };
    }
  } catch (err) {
    throw new Error(
      `gpt-tokenizer not installed. Run: npm i gpt-tokenizer\n${(err as Error).message}`,
    );
  }
  return tok.encode(text).length;
}

/** Count tokens with Anthropic's official Claude tokenizer. */
export async function countTokensClaude(text: string): Promise<number> {
  let tok: { countTokens(text: string): number };
  try {
    const mod = await import('@anthropic-ai/tokenizer' as string);
    tok = mod as { countTokens(text: string): number };
  } catch (err) {
    throw new Error(
      `@anthropic-ai/tokenizer not installed. Run: npm i @anthropic-ai/tokenizer\n${(err as Error).message}`,
    );
  }
  return tok.countTokens(text);
}

/** Best-effort count for a model name. */
export async function countTokens(text: string, model: TokenizerModel): Promise<number> {
  if (model.startsWith('claude')) return countTokensClaude(text);
  if (model.startsWith('o') || model === 'gpt-4o' || model === 'gpt-4o-mini') {
    return countTokensGpt(text, 'o200k_base');
  }
  return countTokensGpt(text, 'cl100k_base');
}

/** Take a snapshot of every metric we care about. Skips unavailable tokenizers gracefully. */
export async function measure(text: string, opts: { gzip?: boolean } = {}): Promise<TokenMeasurement> {
  const out: TokenMeasurement = { bytes: Buffer.byteLength(text, 'utf8') };
  if (opts.gzip !== false) {
    try {
      const zlib = await import('node:zlib');
      out.bytes_gzip = zlib.gzipSync(text, { level: 9 }).length;
    } catch {}
  }
  try { out.tokens_openai_cl100k = await countTokensGpt(text, 'cl100k_base'); } catch {}
  try { out.tokens_openai_o200k = await countTokensGpt(text, 'o200k_base'); } catch {}
  try { out.tokens_anthropic = await countTokensClaude(text); } catch {}
  return out;
}

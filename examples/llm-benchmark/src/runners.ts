/**
 * Five runner modes:
 *   - mock         : precomputed answers. Validates the pipeline. Zero cost.
 *   - openai       : gpt-4o-mini via OpenAI's chat completions API.
 *   - anthropic    : claude-haiku-4.5 via Anthropic's messages API.
 *   - gemini       : gemini-2.5-flash via Google AI Studio.
 *   - groq         : llama-3.3-70b-versatile via Groq's OpenAI-compatible API.
 *
 * Each reads its key from process.env (loaded from .env by the wrapper script).
 */

import type { Task } from './tasks.js';

export interface RunResult {
  task: Task;
  format: 'HTML' | 'Markdown (auto)' | 'llms.txt' | 'AHTML compact' | 'AHTML JSON';
  model: 'gpt-4o-mini' | 'claude-haiku-4.5' | 'gemini-2.5-flash' | 'llama-3.3-70b' | 'mock';
  answer: string;
  tokens_input: number;
  tokens_output: number;
  cost_usd: number;
  latency_ms: number;
  correct: boolean;
}

export interface Runner {
  name: RunResult['model'];
  ask(systemPrompt: string, userPrompt: string, content: string): Promise<{ answer: string; tokens_input: number; tokens_output: number; cost_usd: number; latency_ms: number }>;
}

const SYSTEM_PROMPT =
  'You are a fact-extraction assistant. Given a page representation, answer the user question concisely and exactly. Respond with the answer only — no preamble, no explanation, no markdown.';

/**
 * Fetch with exponential backoff on transient errors (429, 500–599).
 * Honors the Retry-After header when present.
 * Throws on non-retryable errors (4xx other than 429) or after maxAttempts.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: { maxAttempts?: number; baseDelayMs?: number; label?: string } = {},
): Promise<Response> {
  const maxAttempts = opts.maxAttempts ?? 5;
  const baseDelay = opts.baseDelayMs ?? 1000;
  const label = opts.label ?? 'http';
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      lastErr = err as Error;
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await sleep(delay);
      continue;
    }
    if (res.ok) return res;
    const retryable = res.status === 429 || res.status === 408 || (res.status >= 500 && res.status < 600);
    if (!retryable || attempt === maxAttempts) return res;
    // Honor Retry-After if the server provides it; otherwise exponential backoff.
    const retryAfter = res.headers.get('retry-after');
    let delay = baseDelay * Math.pow(2, attempt - 1);
    if (retryAfter) {
      const ms = /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : new Date(retryAfter).getTime() - Date.now();
      if (Number.isFinite(ms) && ms > 0) delay = Math.max(ms, 500);
    }
    // Drain the body to free the connection
    await res.text().catch(() => undefined);
    process.stderr.write(`    [${label}] ${res.status}; retry ${attempt}/${maxAttempts} in ${Math.round(delay)}ms\n`);
    await sleep(delay);
  }
  throw lastErr ?? new Error(`${label}: exhausted ${maxAttempts} attempts`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =====================================================================
// Mock runner — for CI + dev, no API keys needed.
// Uses simple heuristics on the content to mimic LLM behavior.
// =====================================================================
export const mockRunner: Runner = {
  name: 'mock',
  async ask(_system, userPrompt, content) {
    const start = Date.now();
    // Naive heuristic: find a likely answer in the content.
    const text = content.slice(0, 16000);   // cap to mimic context window pressure
    let answer = '';
    const q = userPrompt.toLowerCase();

    if (q.includes('price') && q.includes('number')) {
      const m = text.match(/\b(\d{1,3}(?:,?\d{3})*(?:\.\d{2})?)\b\s*(USD|usd|\$)?/);
      if (m) answer = m[1]!.replace(/,/g, '');
    } else if (q.includes('currency')) {
      const m = text.match(/\b(USD|EUR|GBP|JPY|AUD|CAD)\b/);
      answer = m ? m[1]! : 'USD';
    } else if (q.includes('stock') && q.includes('yes')) {
      answer = /in[_ ]?stock/i.test(text) ? 'yes' : 'no';
    } else if (q.includes('stock') && q.includes('quantity')) {
      const m = text.match(/in[_ ]?stock\s*\((\d+)\)|quantity[:\s]+(\d+)|\b(\d+)\s+(?:available|in stock)/i);
      answer = m ? (m[1] ?? m[2] ?? m[3] ?? '') : '';
    } else if (q.includes('sku')) {
      const m = text.match(/SKU[:\s]+([A-Z0-9-]+)|sku[:\s"]+([A-Z0-9-]+)/i);
      answer = m ? (m[1] ?? m[2] ?? '') : '';
    } else if (q.includes('rating') && q.includes('5')) {
      const m = text.match(/rating[:\s"]+(\d+(?:\.\d+)?)|(\d+\.\d+)\s*\/\s*5|(\d+\.\d+)\s*\(\d+\)/i);
      answer = m ? (m[1] ?? m[2] ?? m[3] ?? '') : '';
    } else if (q.includes('how many reviews')) {
      const m = text.match(/\((\d{2,6})\s+reviews?\)|reviewCount[":\s]+(\d+)|count[":\s]+(\d+)/i);
      answer = m ? (m[1] ?? m[2] ?? m[3] ?? '') : '';
    } else if (q.includes('brand')) {
      const m = text.match(/brand[:"\s]+([A-Z][A-Za-z]+)/);
      answer = m ? m[1]! : '';
    } else if (q.includes('purchase') && q.includes('confirmation')) {
      answer = /confirmation[:\s"]+required/i.test(text) ? 'yes' : 'no';
    } else if (q.includes('return window') || q.includes('how long')) {
      const m = text.match(/P(\d+)D|(\d+)[\s-]*day/i);
      answer = m ? (m[1] ?? m[2] ?? '') : '';
    } else if (q.includes('email to the buyer')) {
      answer = /email_buyer/i.test(text) ? 'yes' : 'no';
    } else if (q.includes('action to purchase')) {
      answer = /\(action\)\s*purchase|"id"\s*:\s*"purchase"/i.test(text) ? 'yes' : 'no';
    } else if (q.includes('title of this article')) {
      const m = text.match(/title[:"\s]+([^"\n]+?)(?=[\n"])|<h1[^>]*>([^<]+)</i);
      answer = m ? (m[1] ?? m[2] ?? '') : '';
    } else if (q.includes('author')) {
      const m = text.match(/author[:"\s]+([A-Z][a-z]+ [A-Z][a-z]+)/i);
      answer = m ? m[1]! : '';
    } else if (q.includes('published') || q.includes('when was this')) {
      const m = text.match(/(\d{4}-\d{2}-\d{2})/);
      answer = m ? m[1]! : '';
    } else if (q.includes('language') && q.includes('2-letter')) {
      const m = text.match(/language[":\s]+["']?(\w{2})["']?|lang=["'](\w{2})/i);
      answer = m ? (m[1] ?? m[2] ?? 'en') : 'en';
    } else if (q.includes('open') && q.includes('state')) {
      const matches = text.match(/\bopen\b/gi);
      answer = matches ? String(Math.min(matches.length, 5)) : '0';
    } else if (q.includes('urgent')) {
      answer = /urgent/i.test(text) ? 'yes' : 'no';
    } else if (q.includes('delete') && q.includes('confirmation')) {
      answer = /delete[_a-z]*[\s\S]{0,200}confirmation[:\s"]+required/i.test(text) ? 'yes' : 'no';
    } else if (q.includes('create a new task')) {
      answer = /create[_a-z]*[\s\S]{0,200}task|"id"\s*:\s*"create_task"/i.test(text) ? 'yes' : 'no';
    }

    const tokens_input = Math.ceil(content.length / 4);
    const tokens_output = Math.ceil(answer.length / 4);
    return {
      answer,
      tokens_input,
      tokens_output,
      cost_usd: 0,
      latency_ms: Date.now() - start,
    };
  },
};

// =====================================================================
// OpenAI runner — real API. Requires OPENAI_API_KEY.
// =====================================================================
export const openaiRunner: Runner = {
  name: 'gpt-4o-mini',
  async ask(system, user, content) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not set');
    const start = Date.now();
    const res = await fetchWithRetry('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `${user}\n\n--- BEGIN PAGE ---\n${content}\n--- END PAGE ---` },
        ],
        temperature: 0,
        max_tokens: 64,
      }),
    }, { label: 'openai' });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { choices: [{ message: { content: string } }]; usage: { prompt_tokens: number; completion_tokens: number } };
    const answer = data.choices[0]!.message.content.trim();
    const tokens_input = data.usage.prompt_tokens;
    const tokens_output = data.usage.completion_tokens;
    // gpt-4o-mini pricing as of 2026: $0.15 / 1M input, $0.60 / 1M output
    const cost_usd = (tokens_input * 0.15 + tokens_output * 0.6) / 1_000_000;
    return { answer, tokens_input, tokens_output, cost_usd, latency_ms: Date.now() - start };
  },
};

// =====================================================================
// Anthropic runner — real API. Requires ANTHROPIC_API_KEY.
// =====================================================================
export const anthropicRunner: Runner = {
  name: 'claude-haiku-4.5',
  async ask(system, user, content) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
    const start = Date.now();
    const res = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        system,
        messages: [{ role: 'user', content: `${user}\n\n--- BEGIN PAGE ---\n${content}\n--- END PAGE ---` }],
        max_tokens: 64,
        temperature: 0,
      }),
    }, { label: 'anthropic' });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { content: [{ text: string }]; usage: { input_tokens: number; output_tokens: number } };
    const answer = data.content[0]!.text.trim();
    const tokens_input = data.usage.input_tokens;
    const tokens_output = data.usage.output_tokens;
    // Haiku 4.5 pricing as of 2026: $1 / 1M input, $5 / 1M output
    const cost_usd = (tokens_input * 1 + tokens_output * 5) / 1_000_000;
    return { answer, tokens_input, tokens_output, cost_usd, latency_ms: Date.now() - start };
  },
};

// =====================================================================
// Google Gemini runner — real API. Requires GEMINI_API_KEY.
// =====================================================================
export const geminiRunner: Runner = {
  name: 'gemini-2.5-flash',
  async ask(system, user, content) {
    const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY (or GOOGLE_API_KEY) not set');
    const start = Date.now();
    const res = await fetchWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents: [
            { role: 'user', parts: [{ text: `${user}\n\n--- BEGIN PAGE ---\n${content}\n--- END PAGE ---` }] },
          ],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 96,                  // a little more headroom in case the model verbose-prefixes
            thinkingConfig: { thinkingBudget: 0 }, // disable thinking — flash burns all 64 tokens "thinking" otherwise
          },
        }),
      },
      { label: 'gemini' },
    );
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
      promptFeedback?: { blockReason?: string };
    };
    const candidate = data.candidates?.[0];
    const answer = (candidate?.content?.parts?.[0]?.text ?? '').trim();
    const tokens_input = data.usageMetadata?.promptTokenCount ?? 0;
    const tokens_output = data.usageMetadata?.candidatesTokenCount ?? 0;
    if (!answer && candidate?.finishReason && candidate.finishReason !== 'STOP') {
      // Empty response with a non-STOP finish reason — record what happened
      // (don't throw; let the scoring layer mark it incorrect).
      process.stderr.write(`    [gemini] empty response (finishReason=${candidate.finishReason})\n`);
    }
    if (data.promptFeedback?.blockReason) {
      process.stderr.write(`    [gemini] prompt blocked: ${data.promptFeedback.blockReason}\n`);
    }
    // gemini-2.5-flash pricing as of May 2026 (under 200K context): $0.075 / 1M in, $0.30 / 1M out
    const cost_usd = (tokens_input * 0.075 + tokens_output * 0.30) / 1_000_000;
    return { answer, tokens_input, tokens_output, cost_usd, latency_ms: Date.now() - start };
  },
};

// =====================================================================
// Groq runner — real API. Requires GROQ_API_KEY.
// OpenAI-compatible API, very fast (often 500+ tokens/sec).
// =====================================================================
export const groqRunner: Runner = {
  name: 'llama-3.3-70b',
  async ask(system, user, content) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('GROQ_API_KEY not set');
    const start = Date.now();
    const res = await fetchWithRetry('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `${user}\n\n--- BEGIN PAGE ---\n${content}\n--- END PAGE ---` },
        ],
        temperature: 0,
        max_tokens: 64,
      }),
    }, { label: 'groq', maxAttempts: 7, baseDelayMs: 2000 });
    if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { choices: [{ message: { content: string } }]; usage: { prompt_tokens: number; completion_tokens: number } };
    const answer = data.choices[0]!.message.content.trim();
    const tokens_input = data.usage.prompt_tokens;
    const tokens_output = data.usage.completion_tokens;
    // Groq llama-3.3-70b-versatile pricing as of 2026: $0.59 / 1M in, $0.79 / 1M out
    const cost_usd = (tokens_input * 0.59 + tokens_output * 0.79) / 1_000_000;
    return { answer, tokens_input, tokens_output, cost_usd, latency_ms: Date.now() - start };
  },
};

export const SYSTEM = SYSTEM_PROMPT;

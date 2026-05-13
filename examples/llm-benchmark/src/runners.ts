/**
 * Three runner modes:
 *   - mock(): returns precomputed answers. Validates the pipeline. Zero cost.
 *   - openai(): calls OpenAI's chat completions API with gpt-4o-mini.
 *   - anthropic(): calls Anthropic's messages API with claude-haiku.
 */

import type { Task } from './tasks.js';

export interface RunResult {
  task: Task;
  format: 'HTML' | 'llms.txt' | 'AHTML compact' | 'AHTML JSON';
  model: 'gpt-4o-mini' | 'claude-haiku-4.5' | 'mock';
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
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
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
    });
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
    const res = await fetch('https://api.anthropic.com/v1/messages', {
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
    });
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

export const SYSTEM = SYSTEM_PROMPT;

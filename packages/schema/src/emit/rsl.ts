/**
 * RSL 1.0 (rslstandard.org) emitter.
 *
 * RSL (Rights and Signals Layer) is a standardized machine-readable
 * content license declaration. Output at /rsl.txt or embedded in a
 * <meta name="rsl"> tag.
 *
 * Usage:
 *   import { toRsl } from '@ahtmljs/schema';
 *   // In a Next.js route handler for GET /rsl.txt:
 *   return new Response(toRsl(snapshot), { headers: { 'content-type': 'text/plain' } });
 */

import type { Snapshot, Policy } from '../types.js';

export interface RslOptions {
  /** Publisher name or URL. */
  publisher?: string;
  /** Explicit RSL version (default: '1.0'). */
  version?: string;
}

/**
 * Render an RSL 1.0 file from a snapshot's policy block.
 * Pass the site-level snapshot (page_type: 'home' or any) — the policy
 * block is the relevant part.
 */
export function toRsl(snap: Snapshot, opts: RslOptions = {}): string {
  return policyToRsl(snap.policy ?? { agents_welcome: true }, snap.url, opts);
}

/**
 * Render an RSL 1.0 file directly from a Policy object.
 */
export function policyToRsl(policy: Policy, siteUrl: string, opts: RslOptions = {}): string {
  const lines: string[] = [];
  const version = opts.version ?? '1.0';

  lines.push('[RSL]');
  lines.push(`version = ${version}`);
  lines.push(`site = ${new URL(siteUrl).origin}`);

  if (opts.publisher) {
    lines.push(`publisher = ${opts.publisher}`);
  }

  // License
  if (policy.license) {
    lines.push(`license = ${policy.license}`);
  } else {
    lines.push('license = all-rights-reserved');
  }

  // Republication
  if (policy.republish === 'allowed') {
    lines.push('republication = allowed');
  } else if (policy.republish === 'attribution_only') {
    lines.push('republication = requires-attribution');
  } else {
    lines.push('republication = requires-permission');
  }

  // Attribution
  if (policy.attribution_required) {
    lines.push('attribution = required');
  } else {
    lines.push('attribution = appreciated');
  }

  // Content Signals — the RSL 1.0 / contentsignals.org overlap
  const cs = policy.content_signals;
  if (cs) {
    lines.push('');
    lines.push('[content-signals]');
    if (cs.search !== undefined) lines.push(`search = ${cs.search}`);
    if (cs.ai_input !== undefined) lines.push(`ai-input = ${cs.ai_input}`);
    if (cs.ai_train !== undefined) lines.push(`ai-train = ${cs.ai_train}`);
  } else {
    // Default conservative signals
    lines.push('');
    lines.push('[content-signals]');
    lines.push('search = allowed');
    lines.push(`ai-input = ${policy.agents_welcome ? 'allowed' : 'denied'}`);
    lines.push('ai-train = denied');
  }

  // Contact
  if (policy.contact) {
    lines.push('');
    lines.push(`contact = ${policy.contact}`);
  }
  if (policy.terms_url) {
    lines.push(`terms-url = ${policy.terms_url}`);
  }

  return lines.join('\n') + '\n';
}

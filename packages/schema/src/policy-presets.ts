/**
 * Built-in policy presets for common agent access patterns.
 *
 * Use these as starting points in your AHTML config:
 *
 *   import { POLICY_PRESETS } from '@ahtmljs/schema';
 *   mountAHTML(app, { policy: POLICY_PRESETS.rateLimited, ... });
 *
 * Presets are plain objects — spread and override fields freely.
 */

import type { Policy } from './types.js';

export type PolicyPreset = Omit<Policy, 'per_agent_policy'>;

/**
 * Public read-only: agents welcome, all actions allowed, no rate limiting.
 * Suitable for static content, documentation, and open APIs.
 */
export const publicReadOnly: PolicyPreset = {
  agents_welcome: true,
  republish: 'attribution_only',
  content_signals: { search: 'allowed', ai_input: 'allowed', ai_train: 'allowed' },
};

/**
 * Rate limited: agents welcome but throttled. Actions require no auth.
 * Suitable for most SaaS products and public APIs.
 */
export const rateLimited: PolicyPreset = {
  agents_welcome: true,
  rate_limit: '100/min',
  republish: 'attribution_only',
  attribution_required: true,
  content_signals: { search: 'allowed', ai_input: 'allowed', ai_train: 'denied' },
};

/**
 * Auth required: agents must authenticate before actions are available.
 * Suitable for member-only or subscription products.
 */
export const authRequired: PolicyPreset = {
  agents_welcome: true,
  actions_require: 'bearer',
  verified_agents_only: true,
  rate_limit: '500/hour',
  republish: 'denied',
  content_signals: { search: 'allowed', ai_input: 'allowed', ai_train: 'denied' },
};

/**
 * Paid actions: agents can read freely but actions require payment via x402.
 * Suitable for e-commerce and pay-per-use APIs.
 */
export const paidAction: PolicyPreset = {
  agents_welcome: true,
  actions_require: 'x402',
  rate_limit: '1000/hour',
  republish: 'denied',
  attribution_required: true,
  content_signals: { search: 'allowed', ai_input: 'allowed', ai_train: 'denied' },
};

/**
 * Train deny: agents can read and act, but content must not be used for AI training.
 * Suitable for creative, journalistic, or premium content.
 */
export const trainDeny: PolicyPreset = {
  agents_welcome: true,
  rate_limit: '200/min',
  republish: 'denied',
  attribution_required: true,
  license: 'no-ai-training',
  content_signals: { search: 'allowed', ai_input: 'allowed', ai_train: 'denied' },
};

/** All five presets as a named map. */
export const POLICY_PRESETS = {
  publicReadOnly,
  rateLimited,
  authRequired,
  paidAction,
  trainDeny,
} as const;

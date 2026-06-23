/**
 * HTTP Message Signatures for AHTML agents.
 *
 * Wraps the low-level schema primitives with agent-friendly defaults.
 * The typical usage is:
 *
 *   import { signRequest, buildAgentHeader } from '@ahtmljs/agent/request-sign';
 *   const signed = await signRequest(myRequest, signingKey, { id: 'did:web:mybot.example.com' });
 */

export {
  signHttpRequest as signRequest,
  verifyHttpSignature as verifyAgentSignature,
  type AgentIdentity,
  type AgentVerifyResult,
  type RequestSignOptions,
} from '@ahtmljs/schema';

import type { AgentIdentity } from '@ahtmljs/schema';

/**
 * Build the X-AHTML-Agent header value (a JSON string) for manual use.
 * Usually you call `signRequest()` directly; this is for testing or custom HTTP stacks.
 */
export function buildAgentHeader(identity: AgentIdentity): string {
  return JSON.stringify(identity);
}

/**
 * @ahtmljs/insights — agent-traffic analytics for AHTML publishers.
 *
 * Classifies incoming requests (verified RFC 9421 agent / self-declared bot
 * / human), records snapshot fetches, action outcomes, and x402 payments
 * behind the `@ahtmljs/kv` abstraction, and reports the result as a summary,
 * a self-contained offline HTML dashboard, or OpenTelemetry span data.
 *
 * The privacy guarantee is structural: only method, path, agent identity,
 * negotiated format, timestamp, and outcome are ever stored — never bodies,
 * query strings, cookies, or arbitrary headers.
 */

// Classification (T5.1)
export {
  classifyRequest,
  matchBotUserAgent,
  KNOWN_BOT_TOKENS,
  type Classification,
  type ClassifyInput,
  type ClassifyOptions,
  type RequestKind,
  type HeadersLike,
  type AgentIdentity,
} from './classify.js';

// Event model + sanitization (T5.2 / T5.3)
export {
  sanitizeEvent,
  formatFromContentType,
  pathnameOnly,
  type InsightEvent,
  type InsightAgent,
  type InsightFormat,
  type InsightOutcome,
} from './events.js';

// KV-backed storage (T5.2)
export {
  InsightStore,
  type InsightStoreOptions,
} from './store.js';

// Recorder + middleware (T5.2 / T5.5)
export {
  createInsights,
  type Insights,
  type InsightsConfig,
  type RecordOptions,
  type RecordRequest,
  type ResponseLike,
  type NextRouteHandler,
  type HonoMiddleware,
  type HonoContextLike,
} from './recorder.js';

// Reporting (T5.6)
export {
  summarize,
  renderDashboard,
  toOtelSpans,
  type InsightSummary,
  type SummarizeOptions,
  type DashboardOptions,
  type OtelSpanData,
} from './report.js';

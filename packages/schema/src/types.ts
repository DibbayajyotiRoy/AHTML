/**
 * AHTML Semantic Snapshot — core type definitions.
 *
 * A snapshot is the canonical agent-facing representation of a web page.
 * Same data, two serializations:
 *   - JSON  (strict, machine-canonical)
 *   - Compact text  (token-optimal for LLMs — see format-compact.ts)
 */

export type AhtmlVersion = '0.1';

export interface Snapshot {
  ahtml: AhtmlVersion;
  url: string;
  fetched_at: string;
  ttl?: number;
  etag?: string;
  page_type: PageType;
  policy?: Policy;
  provenance?: Provenance;
  entities: Entity[];
  actions: Action[];
  links?: Links;
  schemas?: Record<string, JsonSchema>;
  meta?: Meta;
}

export type PageType =
  | 'home'
  | 'product_detail'
  | 'product_list'
  | 'article'
  | 'document'
  | 'profile'
  | 'task_list'
  | 'task_detail'
  | 'dataset'
  | 'conversation'
  | 'checkout'
  | 'search_results'
  | 'category'
  | 'other';

export type EntityId = string;

export type EntityType =
  | 'product'
  | 'document'
  | 'task'
  | 'profile'
  | 'dataset'
  | 'conversation';

export type Freshness = 'live' | 'near_realtime' | 'daily' | 'static';

export interface BaseEntity {
  id: EntityId;
  type: EntityType;
  freshness?: Freshness;
  updated_at?: string;
}

export interface Money {
  amount: number;
  currency: string;
}

export interface Stock {
  status: 'in_stock' | 'low_stock' | 'out_of_stock' | 'preorder' | 'discontinued';
  quantity?: number;
}

export interface Asset {
  url: string;
  alt?: string;
  width?: number;
  height?: number;
}

export interface Product extends BaseEntity {
  type: 'product';
  name: string;
  brand?: string;
  description?: string;
  price?: Money;
  list_price?: Money;
  stock?: Stock;
  sku?: string;
  variants?: ProductVariant[];
  images?: Asset[];
  attributes?: Record<string, string | number | boolean>;
  rating?: { average: number; count: number };
  category?: EntityId;
}

export interface ProductVariant {
  id: EntityId;
  name: string;
  price?: Money;
  stock?: Stock;
  attributes?: Record<string, string>;
}

export interface Document extends BaseEntity {
  type: 'document';
  title: string;
  author?: string | string[];
  published_at?: string;
  modified_at?: string;
  summary?: string;
  content?: string;
  word_count?: number;
  reading_time?: number;
  language?: string;
  tags?: string[];
  canonical_url?: string;
  /**
   * Optional retrieval-ready chunks of the document's content.
   *
   * Designed for RAG pipelines: each chunk has a deterministic id,
   * byte range against `content`, optional citation anchor (matches a
   * heading or named anchor in the source HTML), and optional embedding
   * hints. Chunks form a singly-linked list via prev/next so retrievers
   * can fetch neighboring context cheaply.
   *
   * Stable across snapshots: chunk ids are content-addressed; agents
   * can cache embeddings keyed on id.
   */
  chunks?: Chunk[];
}

export interface Chunk {
  /** Deterministic, content-addressed id. Conventionally "<document-id>#<short-hash>". */
  id: string;
  /** Inclusive-exclusive byte range against the parent Document's `content`. */
  byte_range: [number, number];
  /** Citation target in the source HTML (e.g. "#introduction"). */
  anchor?: string;
  /** Heading text the chunk falls under, if any. */
  heading?: string;
  /** Parent document id — back-reference for cache invalidation. */
  parent: EntityId;
  /** Previous chunk id in reading order (linked list). */
  prev?: string;
  /** Next chunk id in reading order. */
  next?: string;
  /** Optional retrieval hint. The class is informational; embedding pipelines may ignore. */
  embed_hint?: {
    model_class?: 'small' | 'medium' | 'large' | 'multilingual';
    notes?: string;
  };
  /** Token count for this chunk if pre-computed by the publisher. */
  tokens?: number;
}

export interface Task extends BaseEntity {
  type: 'task';
  title: string;
  description?: string;
  state: 'open' | 'in_progress' | 'blocked' | 'done' | 'cancelled';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  assignee?: EntityId;
  due_at?: string;
  labels?: string[];
  parent?: EntityId;
}

export interface Profile extends BaseEntity {
  type: 'profile';
  name: string;
  kind: 'person' | 'organization' | 'bot';
  handle?: string;
  avatar?: Asset;
  bio?: string;
  email?: string;
  homepage?: string;
  verified?: boolean;
  attributes?: Record<string, string>;
}

export interface DatasetColumn {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'datetime' | 'entity_ref' | 'money';
  format?: string;
}

export interface Dataset extends BaseEntity {
  type: 'dataset';
  name: string;
  columns: DatasetColumn[];
  rows: unknown[][];
  row_count_total?: number;
  description?: string;
}

export interface ConversationMessage {
  id: string;
  author: EntityId;
  posted_at: string;
  content: string;
  reply_to?: string;
}

export interface Conversation extends BaseEntity {
  type: 'conversation';
  title?: string;
  participants: EntityId[];
  messages: ConversationMessage[];
  message_count_total?: number;
}

export type Entity = Product | Document | Task | Profile | Dataset | Conversation;

export type ActionCategory =
  | 'read'
  | 'search'
  | 'navigate'
  | 'create'
  | 'update'
  | 'delete'
  | 'transact'
  | 'send'
  | 'auth';

export type AuthRequirement =
  | 'none'
  | 'optional'
  | 'required'
  | { scheme: string; scopes?: string[] };

export interface ActionCost {
  amount?: number;
  currency?: string;
  unit?: 'request' | 'token' | 'credit' | 'message' | 'item';
  category: 'free' | 'purchase' | 'subscription' | 'rate_limited' | 'compute';
  notes?: string;
}

export interface Reversibility {
  reversible: boolean;
  window?: string;
  policy?: string;
}

export type SideEffect =
  | 'charge_card'
  | 'email_buyer'
  | 'email_seller'
  | 'sms'
  | 'decrement_stock'
  | 'create_account'
  | 'modify_profile'
  | 'public_post'
  | 'send_message'
  | 'consume_credit'
  | 'webhook'
  | string;

export interface Action {
  id: string;
  label?: string;
  target?: EntityId | EntityId[];
  input?: JsonSchema | { $ref: string };
  output?: JsonSchema | { $ref: string };
  auth?: AuthRequirement;
  cost?: ActionCost;
  reversible?: Reversibility;
  side_effects?: SideEffect[];
  rate_limit?: string;
  preview_url?: string;
  execute_url?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  confirmation?: 'none' | 'recommended' | 'required';
  category?: ActionCategory;
}

export interface Policy {
  agents_welcome: boolean;
  license?: string;
  rate_limit?: string;
  actions_require?: string;
  contact?: string;
  terms_url?: string;
  attribution_required?: boolean;
  republish?: 'allowed' | 'denied' | 'attribution_only';
  caching?: { ttl?: number; allowed?: boolean };
}

export interface Provenance {
  issuer?: string;
  signed?: boolean;
  signature?: string;
  signature_alg?: string;
  fetched_via?: string;
}

export interface PaginationLink {
  cursor?: string;
  url?: string;
  expected?: number;
  total?: number;
}

export interface Links {
  self?: string;
  next?: PaginationLink;
  prev?: PaginationLink;
  parent?: EntityId | string;
  related?: EntityId[];
  canonical?: string;
}

export interface Meta {
  snapshot_bytes?: number;
  html_bytes?: number;
  compression_ratio?: number;
  generated_by?: string;
  [k: string]: unknown;
}

export interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  enum?: unknown[];
  format?: string;
  $ref?: string;
  [k: string]: unknown;
}

export type DiffChange =
  | { op: 'add'; entity: Entity }
  | { op: 'remove'; id: EntityId }
  | { op: 'update'; id: EntityId; patch: Record<string, unknown> }
  | { op: 'add_action'; action: Action }
  | { op: 'remove_action'; id: string };

export interface SnapshotDiff {
  ahtml: AhtmlVersion;
  url: string;
  from_etag?: string;
  to_etag?: string;
  changes: DiffChange[];
}

export const AHTML_VERSION: AhtmlVersion = '0.1';

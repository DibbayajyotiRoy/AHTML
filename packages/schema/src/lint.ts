/**
 * Snapshot quality linter — best-practice checks beyond schema validity.
 *
 * `validate()` answers "is this a structurally legal snapshot?". `lint()`
 * answers a harder question: "is this snapshot actually *good* — will an
 * agent be able to do something useful with it?". A snapshot can be
 * perfectly valid and still be near-useless to an agent: a product with no
 * price, a product-detail page with no actions, an action with side
 * effects but no confirmation, a paginated dataset with no `next` link.
 *
 * Every finding has a stable `rule` id so publishers can suppress
 * individual rules in CI (`lint(snap, { disable: ['no-ttl'] })`).
 *
 * Zero runtime dependencies, like the rest of this package. `lint()`
 * assumes the snapshot is already structurally valid — run `validate()`
 * first if the input is untrusted.
 */

import type { Snapshot, Action, Product, Document, Dataset } from './types.js';

export type LintSeverity = 'warning' | 'info';

export interface LintWarning {
  /** Stable, kebab-case rule id — safe to reference in CI suppressions. */
  rule: string;
  /** Dotted path into the snapshot, e.g. `entities[2].price`. */
  path: string;
  /** Human-readable description of the quality gap. */
  message: string;
  severity: LintSeverity;
  /** Concrete, actionable fix. */
  hint?: string;
}

export interface LintOptions {
  /** Rule ids to skip entirely. */
  disable?: string[];
  /**
   * A `document.content` longer than this (in characters) with no `chunks`
   * triggers `oversized-content`. Default 50000 (~12k tokens).
   */
  oversizedContentChars?: number;
}

/** Page types that are expected to carry at least one entity. */
const CONTENT_PAGE_TYPES = new Set<Snapshot['page_type']>([
  'product_detail',
  'product_list',
  'article',
  'document',
  'profile',
  'task_list',
  'task_detail',
  'dataset',
  'conversation',
]);

/** Action categories that change server state — agents need a way to run them. */
const MUTATING_CATEGORIES = new Set(['create', 'update', 'delete', 'transact', 'send']);

/** Side effects serious enough that an unconfirmed action is a footgun. */
const HIGH_RISK_SIDE_EFFECTS = new Set([
  'charge_card',
  'create_account',
  'public_post',
  'send_message',
  'sms',
]);

/**
 * Lint a snapshot for agent-usability problems.
 *
 * Returns an empty array for a high-quality snapshot. Findings are ordered
 * snapshot-level first, then per entity, then per action.
 */
export function lint(snap: Snapshot, opts: LintOptions = {}): LintWarning[] {
  const disabled = new Set(opts.disable ?? []);
  const oversizedAt = opts.oversizedContentChars ?? 50_000;
  const out: LintWarning[] = [];

  const push = (w: LintWarning): void => {
    if (!disabled.has(w.rule)) out.push(w);
  };

  // --- snapshot-level ----------------------------------------------------

  if (!snap.policy) {
    push({
      rule: 'no-policy',
      path: 'policy',
      message: 'no policy block — agents cannot tell whether they are welcome',
      severity: 'info',
      hint: 'add a policy with at least `agents_welcome` and `contact`',
    });
  } else if (!snap.policy.contact) {
    push({
      rule: 'policy-no-contact',
      path: 'policy.contact',
      message: 'policy has no contact — agents have no way to reach the publisher',
      severity: 'info',
      hint: 'set policy.contact to an email or URL',
    });
  }

  if (snap.ttl == null) {
    push({
      rule: 'no-ttl',
      path: 'ttl',
      message: 'no ttl — agents cannot tell how long this snapshot stays fresh',
      severity: 'info',
      hint: 'set ttl (seconds) so agents can cache safely',
    });
  }

  if (snap.entities.length === 0 && CONTENT_PAGE_TYPES.has(snap.page_type)) {
    push({
      rule: 'no-entities',
      path: 'entities',
      message: `page_type is "${snap.page_type}" but no entities were extracted`,
      severity: 'warning',
      hint: 'a content page with zero entities usually means a failed extraction',
    });
  }

  const productPage = snap.page_type === 'product_detail';
  const hasProduct = snap.entities.some((e) => e.type === 'product');
  if (productPage && hasProduct && snap.actions.length === 0) {
    push({
      rule: 'product-detail-no-actions',
      path: 'actions',
      message: 'product-detail page exposes no actions — agents can read it but cannot transact',
      severity: 'warning',
      hint: 'add a purchase / add-to-cart action with an execute_url',
    });
  }

  // --- entity-level ------------------------------------------------------

  const entityIds = new Set(snap.entities.map((e) => e.id));

  snap.entities.forEach((e, i) => {
    const p = `entities[${i}]`;

    if (!e.updated_at && !e.freshness) {
      push({
        rule: 'entity-no-freshness',
        path: `${p}`,
        message: `entity "${e.id}" has neither updated_at nor freshness — agents cannot judge staleness`,
        severity: 'info',
        hint: 'set freshness ("live" | "near_realtime" | "daily" | "static") or updated_at',
      });
    }

    if (e.type === 'product') lintProduct(e, p, push);
    if (e.type === 'document') lintDocument(e, p, oversizedAt, push);
    if (e.type === 'dataset') lintDataset(e, p, snap, push);
  });

  // --- action-level ------------------------------------------------------

  snap.actions.forEach((a, i) => {
    const p = `actions[${i}]`;

    if (!a.label) {
      push({
        rule: 'action-no-label',
        path: `${p}.label`,
        message: `action "${a.id}" has no label — agents have no human-readable name to surface`,
        severity: 'info',
        hint: 'add a short imperative label, e.g. "Add to cart"',
      });
    }

    if (a.category && MUTATING_CATEGORIES.has(a.category) && !a.execute_url) {
      push({
        rule: 'action-no-execute-url',
        path: `${p}.execute_url`,
        message: `action "${a.id}" is "${a.category}" but has no execute_url — agents cannot perform it`,
        severity: 'warning',
        hint: 'set execute_url (and method) so the action is callable',
      });
    }

    const risky = (a.side_effects ?? []).filter((s) => HIGH_RISK_SIDE_EFFECTS.has(s));
    if (risky.length > 0 && a.confirmation !== 'required') {
      push({
        rule: 'action-unconfirmed-side-effects',
        path: `${p}.confirmation`,
        message: `action "${a.id}" has high-risk side effects (${risky.join(', ')}) but confirmation is "${a.confirmation ?? 'unset'}"`,
        severity: 'warning',
        hint: 'set confirmation: "required" for actions that charge, post, or message',
      });
    }

    if (a.category === 'transact' && !a.cost) {
      push({
        rule: 'action-transact-no-cost',
        path: `${p}.cost`,
        message: `action "${a.id}" is a transaction but declares no cost — agents cannot budget for it`,
        severity: 'info',
        hint: 'add a cost { amount, currency, category }',
      });
    }

    for (const ref of targetIds(a)) {
      if (!entityIds.has(ref)) {
        push({
          rule: 'action-dangling-target',
          path: `${p}.target`,
          message: `action "${a.id}" targets "${ref}", which is not an entity in this snapshot`,
          severity: 'warning',
          hint: 'targets should reference an entity id present in `entities`',
        });
      }
    }
  });

  return out;
}

function lintProduct(e: Product, p: string, push: (w: LintWarning) => void): void {
  if (!e.price) {
    push({
      rule: 'product-no-price',
      path: `${p}.price`,
      message: `product "${e.id}" has no price — the single most-asked agent question is unanswered`,
      severity: 'warning',
      hint: 'set price { amount, currency }',
    });
  }
  if (e.price && !e.stock) {
    push({
      rule: 'product-no-stock',
      path: `${p}.stock`,
      message: `product "${e.id}" is priced but has no stock status — agents cannot tell if it is buyable`,
      severity: 'info',
      hint: 'set stock { status, quantity? }',
    });
  }
  if (!e.description) {
    push({
      rule: 'product-no-description',
      path: `${p}.description`,
      message: `product "${e.id}" has no description`,
      severity: 'info',
      hint: 'a one-line description helps agents match the product to a user need',
    });
  }
}

function lintDocument(
  e: Document,
  p: string,
  oversizedAt: number,
  push: (w: LintWarning) => void,
): void {
  if (!e.summary) {
    push({
      rule: 'document-no-summary',
      path: `${p}.summary`,
      message: `document "${e.id}" has no summary — agents must read the full body to know what it is`,
      severity: 'info',
      hint: 'a summary lets agents triage without spending tokens on the content',
    });
  }
  if (e.content && e.content.length > oversizedAt && (!e.chunks || e.chunks.length === 0)) {
    push({
      rule: 'oversized-content',
      path: `${p}.content`,
      message: `document "${e.id}" has ${e.content.length} chars of content but no chunks — expensive for retrieval`,
      severity: 'info',
      hint: 'split large content into `chunks` so RAG pipelines fetch only what they need',
    });
  }
}

function lintDataset(e: Dataset, p: string, snap: Snapshot, push: (w: LintWarning) => void): void {
  if (
    e.row_count_total != null &&
    e.rows.length < e.row_count_total &&
    !snap.links?.next
  ) {
    push({
      rule: 'dataset-truncated-no-pagination',
      path: `${p}.rows`,
      message: `dataset "${e.id}" shows ${e.rows.length} of ${e.row_count_total} rows but the snapshot has no links.next`,
      severity: 'warning',
      hint: 'add links.next so agents can page through the rest of the rows',
    });
  }
}

/** Normalize an action's target into a list of entity-id strings. */
function targetIds(a: Action): string[] {
  if (!a.target) return [];
  return Array.isArray(a.target) ? a.target : [a.target];
}

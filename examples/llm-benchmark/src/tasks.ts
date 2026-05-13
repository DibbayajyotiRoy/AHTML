/**
 * 20 extraction tasks covering common agent queries.
 *
 * Each task has:
 *   - a prompt question
 *   - a ground-truth answer string (or regex)
 *   - the archetype it tests against
 */

export interface Task {
  id: string;
  archetype: 'product' | 'article' | 'dashboard';
  prompt: string;
  /** Ground-truth answer for accuracy scoring. */
  truth: string | RegExp;
  /** Why this task matters. */
  rationale: string;
}

export const TASKS: Task[] = [
  // Product page tasks
  { id: 'price-amount', archetype: 'product', prompt: 'What is the price of this product? Answer with a number only.', truth: '1999', rationale: 'Core e-commerce read; bedrock for shopping agents.' },
  { id: 'price-currency', archetype: 'product', prompt: 'What currency is this product priced in? Answer with the 3-letter ISO code.', truth: 'USD', rationale: 'Cross-border purchasing.' },
  { id: 'stock-status', archetype: 'product', prompt: 'Is this product in stock? Answer "yes" or "no".', truth: /^yes$/i, rationale: 'Cart safety: prevent agents from buying unavailable inventory.' },
  { id: 'stock-quantity', archetype: 'product', prompt: 'How many units of this product are in stock? Answer with a number only.', truth: '42', rationale: 'Bulk order feasibility.' },
  { id: 'sku', archetype: 'product', prompt: 'What is the SKU of this product?', truth: /MBP14[- ]M3[- ]?512[- ]?SB/i, rationale: 'Unique identifier for order placement.' },
  { id: 'rating-avg', archetype: 'product', prompt: 'What is the average customer rating out of 5?', truth: '4.7', rationale: 'Quality assessment.' },
  { id: 'rating-count', archetype: 'product', prompt: 'How many reviews does this product have?', truth: '1284', rationale: 'Confidence interval on the rating.' },
  { id: 'brand', archetype: 'product', prompt: 'Who is the brand of this product?', truth: 'Apple', rationale: 'Brand-filtered search.' },
  { id: 'purchase-action-exists', archetype: 'product', prompt: 'Is there an action to purchase this product? Answer "yes" or "no".', truth: /^yes$/i, rationale: 'Action discovery — the core agent affordance.' },
  { id: 'purchase-requires-confirmation', archetype: 'product', prompt: 'Does the purchase action require explicit user confirmation? Answer "yes" or "no".', truth: /^yes$/i, rationale: 'Safety contract — prevents autonomous purchases.' },
  { id: 'purchase-reversible-window', archetype: 'product', prompt: 'How long is the return window in days?', truth: '30', rationale: 'Refund policy.' },
  { id: 'purchase-side-effects', archetype: 'product', prompt: 'Will the purchase action send an email to the buyer? Answer "yes" or "no".', truth: /^yes$/i, rationale: 'Side-effect transparency.' },

  // Article tasks
  { id: 'article-title', archetype: 'article', prompt: 'What is the title of this article?', truth: /Why agents need.*HTML/i, rationale: 'Citation discovery.' },
  { id: 'article-author', archetype: 'article', prompt: 'Who is the author of this article? Answer with their full name only.', truth: /Roy/i, rationale: 'Attribution.' },
  { id: 'article-published', archetype: 'article', prompt: 'When was this article published? Answer with the date in YYYY-MM-DD format.', truth: /2026-05-1[2-4]/, rationale: 'Freshness scoring.' },
  { id: 'article-language', archetype: 'article', prompt: 'What language is this article in? Answer with the 2-letter ISO code.', truth: /^en$/i, rationale: 'Multi-language pipelines.' },

  // Dashboard tasks
  { id: 'dashboard-open-tasks', archetype: 'dashboard', prompt: 'How many tasks are currently in the "open" state? Answer with a number only.', truth: /[2-5]/, rationale: 'Workflow status.' },
  { id: 'dashboard-urgent-priority', archetype: 'dashboard', prompt: 'Is there at least one task with priority "urgent"? Answer "yes" or "no".', truth: /^yes$/i, rationale: 'Triage discovery.' },
  { id: 'dashboard-delete-confirmation', archetype: 'dashboard', prompt: 'Does deleting a task require confirmation? Answer "yes" or "no".', truth: /^yes$/i, rationale: 'Destructive action gate.' },
  { id: 'dashboard-create-task-exists', archetype: 'dashboard', prompt: 'Is there an action to create a new task? Answer "yes" or "no".', truth: /^yes$/i, rationale: 'Workflow affordance discovery.' },
];

export function tasksForArchetype(archetype: Task['archetype']): Task[] {
  return TASKS.filter((t) => t.archetype === archetype);
}

export function scoreAnswer(task: Task, answer: string): boolean {
  if (typeof task.truth === 'string') {
    return answer.trim().toLowerCase().includes(task.truth.toLowerCase());
  }
  return task.truth.test(answer.trim());
}

import type { Snapshot, Product, Document, Task, Profile, Action } from './types.js';

/**
 * Render an AHTML snapshot as human+LLM-readable Markdown.
 * This is the text/markdown response format — a structured, readable
 * representation of the page contract. Unlike auto-HTML-to-markdown
 * (lossy), this reflects the hand-authored AHTML data.
 */
export function toMarkdown(snap: Snapshot): string {
  const lines: string[] = [];

  // Header
  lines.push(`# ${snap.page_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} — ${snap.url}`);
  lines.push('');

  // Entities grouped by type
  const products = snap.entities.filter((e): e is Product => e.type === 'product');
  const documents = snap.entities.filter((e): e is Document => e.type === 'document');
  const tasks = snap.entities.filter((e): e is Task => e.type === 'task');
  const profiles = snap.entities.filter((e): e is Profile => e.type === 'profile');
  const others = snap.entities.filter(e => !['product', 'document', 'task', 'profile'].includes(e.type));

  if (products.length > 0) {
    lines.push('## Products');
    lines.push('');
    for (const p of products) {
      lines.push(`### ${p.name}`);
      if (p.brand) lines.push(`**Brand:** ${p.brand}`);
      if (p.price) lines.push(`**Price:** ${p.price.amount} ${p.price.currency}`);
      if (p.list_price) lines.push(`**List price:** ${p.list_price.amount} ${p.list_price.currency}`);
      if (p.stock) {
        const qty = p.stock.quantity !== undefined ? ` (${p.stock.quantity} units)` : '';
        lines.push(`**Stock:** ${p.stock.status.replace(/_/g, ' ')}${qty}`);
      }
      if (p.sku) lines.push(`**SKU:** ${p.sku}`);
      if (p.rating) lines.push(`**Rating:** ${p.rating.average}/5 (${p.rating.count} reviews)`);
      if (p.description) lines.push(`\n${p.description}`);
      lines.push('');
    }
  }

  if (documents.length > 0) {
    lines.push('## Documents');
    lines.push('');
    for (const d of documents) {
      lines.push(`### ${d.title}`);
      if (d.author) {
        const authorStr = Array.isArray(d.author) ? d.author.join(', ') : d.author;
        lines.push(`**Author:** ${authorStr}`);
      }
      if (d.published_at) lines.push(`**Published:** ${d.published_at}`);
      if (d.modified_at) lines.push(`**Updated:** ${d.modified_at}`);
      if (d.summary) lines.push(`\n${d.summary}`);
      if (d.canonical_url) lines.push(`\n[Full article](${d.canonical_url})`);
      lines.push('');
    }
  }

  if (tasks.length > 0) {
    lines.push('## Tasks');
    lines.push('');
    for (const t of tasks) {
      const stateIcon = t.state === 'done' ? '✓' : t.state === 'in_progress' ? '→' : '○';
      lines.push(`- ${stateIcon} **${t.title}**${t.priority ? ` [${t.priority}]` : ''}${t.assignee ? ` — ${t.assignee}` : ''}`);
    }
    lines.push('');
  }

  if (profiles.length > 0) {
    lines.push('## Profiles');
    lines.push('');
    for (const p of profiles) {
      lines.push(`### ${p.name}`);
      if (p.bio) lines.push(p.bio);
      lines.push('');
    }
  }

  if (others.length > 0) {
    lines.push('## Other Entities');
    lines.push('');
    for (const e of others) {
      lines.push(`- **${e.id}** (${e.type})`);
    }
    lines.push('');
  }

  // Actions
  if (snap.actions.length > 0) {
    lines.push('## Actions');
    lines.push('');
    for (const a of snap.actions) {
      const parts: string[] = [`**${a.id}**`];
      if (a.auth && a.auth !== 'none') parts.push(`Auth: ${typeof a.auth === 'string' ? a.auth : a.auth.scheme}`);
      if (a.cost && a.cost.amount !== undefined && a.cost.currency) parts.push(`Cost: ${a.cost.amount} ${a.cost.currency}`);
      if (a.reversible?.reversible === false) parts.push('Not reversible');
      else if (a.reversible?.reversible && a.reversible.window) parts.push(`Reversible: ${a.reversible.window}`);
      if (a.confirmation && a.confirmation !== 'none') parts.push(`Confirm: ${a.confirmation}`);
      lines.push(`- ${parts.join(' · ')}`);
    }
    lines.push('');
  }

  // Policy summary (brief)
  if (snap.policy) {
    lines.push('## Policy');
    lines.push('');
    const pol = snap.policy;
    if (pol.agents_welcome === false) lines.push('> Agents not welcome on this site.');
    else lines.push('> Agents welcome.');
    if (pol.rate_limit) lines.push(`Rate limit: ${pol.rate_limit}`);
    lines.push('');
  }

  // Footer
  lines.push('---');
  lines.push(`*AHTML snapshot · ${snap.page_type} · ${snap.url}*`);

  return lines.join('\n');
}

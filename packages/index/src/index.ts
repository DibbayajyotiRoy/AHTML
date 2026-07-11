/**
 * @ahtmljs/index — the AHTML Index (ROADMAP Feature 6, TASKS.md T6.1–T6.7).
 *
 * A registry + crawler for AHTML-enabled sites:
 *
 * - `submit(url)` (T6.3): verify `.well-known/ahtml.json`, fetch + validate
 *   the snapshot (rejecting invalid sites WITH the lint report), check the
 *   signature, score, and record what the site offers.
 * - `recrawl()` (T6.2/T6.4): honors each snapshot's TTL (skips fresh
 *   entries) and ETag (conditional GET — an unchanged site costs the origin
 *   exactly one 304). Sites that drop `.well-known/ahtml.json` or publish
 *   `agents_welcome: false` (the RSL/policy opt-out) are delisted within one
 *   cycle.
 * - `query(...)` / `indexToMcp(...)` (T6.6): "find sites that sell X",
 *   "find sites with refundable checkout actions" — the MCP surface reuses
 *   `snapshotsToMcp` over the index's own snapshot.
 * - `buildIndexSnapshot(...)` (T6.7): the index dogfoods — it publishes its
 *   own AHTML snapshot (a dataset of indexed sites + typed query actions).
 *
 * Storage is behind `@ahtmljs/kv` (`KvStore`); fetch/score/clock are
 * injectable, so the whole crawler runs hermetically in tests.
 */
import {
  validate,
  verifySnapshot,
  snapshot as buildSnapshot,
  snapshotsToMcp,
  type Snapshot,
  type KvStore,
  type VerifyKey,
} from '@ahtmljs/schema';

export type SignatureStatus = 'verified_publisher' | 'unsigned' | 'invalid';

export interface IndexEntry {
  url: string;
  origin: string;
  status: 'indexed' | 'delisted';
  delistReason?: string;
  etag?: string;
  ttl?: number;
  score: number;
  grade: string;
  signatureStatus: SignatureStatus;
  pageType: string;
  entityTypes: string[];
  productNames: string[];
  actionIds: string[];
  actionCategories: string[];
  /** True when any action is reversible per its contract. */
  hasReversibleActions: boolean;
  indexedAt: string;
  lastCrawledAt: string;
}

export interface SubmitResult {
  ok: boolean;
  entry?: IndexEntry;
  /** Lint report — present exactly when validation rejected the site. */
  issues?: Array<{ path: string; message: string; severity: string }>;
  reason?: string;
}

export interface IndexOptions {
  kv: KvStore;
  fetch?: typeof fetch;
  /** Scorer — defaults to a stub that must be replaced in production
   *  (`computeScore` from @ahtmljs/cli/score); injectable to keep this
   *  package dependency-light and tests hermetic. */
  score?: (url: string) => Promise<{ score: number; grade: string }>;
  now?: () => number;
  /** Trusted keys for signature verification (did:web resolution can layer
   *  on top by resolving before submit). */
  trustedKeys?: VerifyKey[];
}

const SITES_KEY = 'ahtml-index:origins';
const entryKey = (origin: string) => `ahtml-index:site:${origin}`;

export function createIndex(options: IndexOptions) {
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const score =
    options.score ??
    (async () => {
      throw new Error('createIndex: no scorer injected — wire computeScore from @ahtmljs/cli/score');
    });
  const kv = options.kv;

  async function origins(): Promise<string[]> {
    const raw = await kv.get(SITES_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  }
  async function saveOrigins(list: string[]): Promise<void> {
    await kv.set(SITES_KEY, JSON.stringify(list));
  }
  async function getEntry(origin: string): Promise<IndexEntry | null> {
    const raw = await kv.get(entryKey(origin));
    return raw ? (JSON.parse(raw) as IndexEntry) : null;
  }
  async function putEntry(entry: IndexEntry): Promise<void> {
    await kv.set(entryKey(entry.origin), JSON.stringify(entry));
  }

  async function fetchSnapshot(
    origin: string,
    etag?: string,
  ): Promise<{ status: number; snap?: Snapshot; etag?: string; jws?: string }> {
    const headers: Record<string, string> = { accept: 'application/ahtml+json' };
    if (etag) headers['if-none-match'] = etag;
    const res = await fetchImpl(`${origin}/ahtml`, { headers });
    if (res.status === 304) return { status: 304 };
    if (!res.ok) return { status: res.status };
    const snap = (await res.json()) as Snapshot;
    return {
      status: res.status,
      snap,
      etag: res.headers.get('etag') ?? snap.etag,
      jws: res.headers.get('x-ahtml-signature') ?? snap.provenance?.signature,
    };
  }

  async function signatureStatus(snap: Snapshot, jws?: string): Promise<SignatureStatus> {
    if (!jws) return 'unsigned';
    if (!options.trustedKeys?.length) return 'invalid'; // present but unverifiable — NEVER 'verified'
    try {
      const result = await verifySnapshot(snap, jws, { trustedKeys: options.trustedKeys });
      return result.ok ? 'verified_publisher' : 'invalid';
    } catch {
      return 'invalid';
    }
  }

  function describe(snap: Snapshot): Pick<
    IndexEntry,
    'pageType' | 'entityTypes' | 'productNames' | 'actionIds' | 'actionCategories' | 'hasReversibleActions'
  > {
    return {
      pageType: snap.page_type,
      entityTypes: [...new Set(snap.entities.map((e) => e.type))],
      productNames: snap.entities
        .filter((e) => e.type === 'product')
        .map((e) => (e as { name?: string }).name ?? '')
        .filter(Boolean),
      actionIds: snap.actions.map((a) => a.id),
      actionCategories: [
        ...new Set(snap.actions.flatMap((a) => (a.category ? [String(a.category)] : []))),
      ],
      hasReversibleActions: snap.actions.some(
        (a) => typeof a.reversible === 'object' && a.reversible?.reversible === true,
      ),
    };
  }

  return {
    /** T6.3 — opt-in submission with validate + score + signature check. */
    async submit(url: string): Promise<SubmitResult> {
      const origin = new URL(url).origin;
      const wellKnown = await fetchImpl(`${origin}/.well-known/ahtml.json`);
      if (!wellKnown.ok) {
        return { ok: false, reason: `.well-known/ahtml.json not found (HTTP ${wellKnown.status}) — AHTML is opt-in; publish it first` };
      }
      const fetched = await fetchSnapshot(origin);
      if (!fetched.snap) {
        return { ok: false, reason: `snapshot endpoint ${origin}/ahtml returned HTTP ${fetched.status}` };
      }
      const issues = validate(fetched.snap);
      const errors = issues.filter((i) => i.severity === 'error');
      if (errors.length) {
        return { ok: false, reason: 'snapshot failed validation — fix the lint report and resubmit', issues };
      }
      if (fetched.snap.policy?.agents_welcome === false) {
        return { ok: false, reason: 'site policy sets agents_welcome: false — not indexed' };
      }
      const { score: points, grade } = await score(url);
      const t = new Date(now()).toISOString();
      const entry: IndexEntry = {
        url,
        origin,
        status: 'indexed',
        etag: fetched.etag,
        ttl: fetched.snap.ttl,
        score: points,
        grade,
        signatureStatus: await signatureStatus(fetched.snap, fetched.jws),
        ...describe(fetched.snap),
        indexedAt: t,
        lastCrawledAt: t,
      };
      await putEntry(entry);
      const list = await origins();
      if (!list.includes(origin)) await saveOrigins([...list, origin]);
      return { ok: true, entry };
    },

    /** T6.2/T6.4 — TTL/ETag-honoring re-crawl with opt-out delisting. */
    async recrawl(): Promise<{ crawled: number; unchanged: number; updated: number; delisted: number; skippedFresh: number }> {
      const stats = { crawled: 0, unchanged: 0, updated: 0, delisted: 0, skippedFresh: 0 };
      for (const origin of await origins()) {
        const entry = await getEntry(origin);
        if (!entry || entry.status === 'delisted') continue;
        // TTL: a fresh snapshot is not re-fetched at all.
        const ageMs = now() - Date.parse(entry.lastCrawledAt);
        if (entry.ttl && ageMs < entry.ttl * 1000) {
          stats.skippedFresh++;
          continue;
        }
        stats.crawled++;
        const fetched = await fetchSnapshot(origin, entry.etag);
        if (fetched.status === 304) {
          // Unchanged: the origin paid exactly one conditional request.
          entry.lastCrawledAt = new Date(now()).toISOString();
          await putEntry(entry);
          stats.unchanged++;
          continue;
        }
        if (!fetched.snap) {
          // Snapshot gone — is the site still opted in at all?
          const wellKnown = await fetchImpl(`${origin}/.well-known/ahtml.json`);
          if (!wellKnown.ok) {
            entry.status = 'delisted';
            entry.delistReason = '.well-known/ahtml.json removed — site opted out';
          } else {
            entry.delistReason = `snapshot endpoint failing (HTTP ${fetched.status}) — kept, will retry`;
          }
          entry.lastCrawledAt = new Date(now()).toISOString();
          await putEntry(entry);
          if (entry.status === 'delisted') stats.delisted++;
          continue;
        }
        if (fetched.snap.policy?.agents_welcome === false) {
          entry.status = 'delisted';
          entry.delistReason = 'policy agents_welcome: false (RSL/policy opt-out)';
          entry.lastCrawledAt = new Date(now()).toISOString();
          await putEntry(entry);
          stats.delisted++;
          continue;
        }
        Object.assign(entry, describe(fetched.snap), {
          etag: fetched.etag,
          ttl: fetched.snap.ttl,
          signatureStatus: await signatureStatus(fetched.snap, fetched.jws),
          lastCrawledAt: new Date(now()).toISOString(),
        });
        await putEntry(entry);
        stats.updated++;
      }
      return stats;
    },

    async entries(includeDelisted = false): Promise<IndexEntry[]> {
      const out: IndexEntry[] = [];
      for (const origin of await origins()) {
        const e = await getEntry(origin);
        if (e && (includeDelisted || e.status === 'indexed')) out.push(e);
      }
      return out;
    },

    /** T6.6 — the query surface behind the MCP tools. */
    async query(q: {
      sells?: string;
      entityType?: string;
      actionId?: string;
      actionCategory?: string;
      reversible?: boolean;
      verifiedOnly?: boolean;
    }): Promise<IndexEntry[]> {
      const all = await this.entries();
      return all.filter((e) => {
        if (q.sells && !e.productNames.some((n) => n.toLowerCase().includes(q.sells!.toLowerCase()))) return false;
        if (q.entityType && !e.entityTypes.includes(q.entityType)) return false;
        if (q.actionId && !e.actionIds.includes(q.actionId)) return false;
        if (q.actionCategory && !e.actionCategories.includes(q.actionCategory)) return false;
        if (q.reversible && !e.hasReversibleActions) return false;
        if (q.verifiedOnly && e.signatureStatus !== 'verified_publisher') return false;
        return true;
      });
    },

    /** T6.7 — the index's own AHTML snapshot (dogfood). */
    async buildIndexSnapshot(indexUrl: string): Promise<Snapshot> {
      const all = await this.entries();
      const b = buildSnapshot(indexUrl, 'dataset')
        .ttl(300)
        .policy({ agents_welcome: true, license: 'MIT', rate_limit: '100/min' })
        .add({
          id: 'dataset:indexed-sites',
          type: 'dataset',
          name: 'AHTML Index — indexed sites',
          columns: [
            { key: 'origin', label: 'Origin', type: 'string' },
            { key: 'score', label: 'Score', type: 'number' },
            { key: 'signature', label: 'Signature', type: 'string' },
            { key: 'entity_types', label: 'Entity types', type: 'string' },
          ],
          rows: all.map((e) => [e.origin, e.score, e.signatureStatus, e.entityTypes.join(',')]),
          row_count_total: all.length,
        })
        .action(
          {
            id: 'search_sites',
            label: 'Find indexed sites selling or offering something',
            category: 'search',
            method: 'GET',
            execute_url: '/api/search',
            auth: 'none',
            cost: { category: 'free' },
            input: {
              type: 'object',
              properties: {
                sells: { type: 'string' },
                entity_type: { type: 'string' },
                action_category: { type: 'string' },
              },
            },
          },
          {
            id: 'sites_with_action',
            label: 'Find indexed sites exposing a given action type',
            category: 'search',
            method: 'GET',
            execute_url: '/api/sites-with-action',
            auth: 'none',
            cost: { category: 'free' },
            input: {
              type: 'object',
              properties: {
                action_id: { type: 'string' },
                reversible: { type: 'boolean' },
              },
              required: ['action_id'],
            },
          },
        );
      return b.build();
    },

    /** T6.6 — MCP emission, reusing the standard snapshotsToMcp machinery. */
    async indexToMcp(indexUrl: string) {
      const snap = await this.buildIndexSnapshot(indexUrl);
      return snapshotsToMcp({ name: 'ahtml-index', url: indexUrl }, [snap]);
    },
  };
}

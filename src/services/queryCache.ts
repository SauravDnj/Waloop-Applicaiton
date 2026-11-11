/**
 * Contacts, boards, fields, tags, campaigns and channels kept on the phone, per
 * account: the screens show the saved copy at once (also offline) and refresh
 * it from the server in the background. The saved copy goes with the account
 * when it signs out (its storage is cleared).
 */
import { dehydrate, hydrate, type DehydratedState, type QueryClient } from '@tanstack/react-query';

import { readJson, writeJson } from '@/services/storage';
import { activeAccountId, useAccountsStore } from '@/stores/accounts';

const KEY = 'queries.cache.v1';

/** Which queries are worth keeping (by the first part of their key). */
const KEEP = new Set(['leads', 'lead', 'board', 'fields', 'tags', 'segments', 'notes', 'wa', 'quickReplies', 'campaigns', 'channels', 'team']);
/**
 * Not every variant is kept: Meta's live channel data (number health…) is fetched when asked for,
 * templates have their own saved copy, and of the contact lists only the unfiltered ones
 * (a list per search term would grow without end).
 */
const worthKeeping = (key: unknown[]) => {
  if (!KEEP.has(String(key[0]))) return false;
  if (key[1] === 'prop' || (key[0] === 'wa' && key[1] === 'templates')) return false;
  if (key[0] === 'leads') {
    const f = (key[1] ?? {}) as { search?: string; segment?: string; tags?: unknown[]; fields?: Record<string, unknown[]> };
    return !f.search && !f.segment && !f.tags?.length && !Object.values(f.fields ?? {}).some((v) => v?.length);
  }
  return true;
};

/** Lists that page: only the first pages are kept. */
const MAX_PAGES = 2;

type Dated = { createdAt?: unknown; updatedAt?: unknown };
/** Contacts carry Dates, which JSON turns into text: turn them back. */
const reviveLead = <T extends Dated>(l: T): T => ({
  ...l,
  createdAt: typeof l.createdAt === 'string' ? new Date(l.createdAt) : l.createdAt,
  updatedAt: typeof l.updatedAt === 'string' ? new Date(l.updatedAt) : l.updatedAt,
});

const revive = (key: unknown[], data: unknown): unknown => {
  if (!data || typeof data !== 'object') return data;
  const d = data as { pages?: { leads?: Dated[] }[]; leads?: Dated[] };
  if (key[0] === 'leads' && Array.isArray(d.pages)) return { ...d, pages: d.pages.map((p) => ({ ...p, leads: (p.leads ?? []).map(reviveLead) })) };
  if (key[0] === 'board' && Array.isArray(d.leads)) return { ...d, leads: d.leads.map(reviveLead) };
  if (key[0] === 'lead') return reviveLead(data as Dated);
  return data;
};

/** Puts the account's saved screens into the query cache (only where nothing fresher is loaded). */
export const restoreQueries = (qc: QueryClient, acct: string | null) => {
  if (!acct) return;
  const saved = readJson<DehydratedState>(KEY, acct);
  if (!saved?.queries?.length) return;
  try {
    hydrate(qc, {
      ...saved,
      queries: saved.queries.map((q) => ({ ...q, state: { ...q.state, data: revive(q.queryKey as unknown[], q.state.data) } })),
    });
  } catch {
    // A saved copy from an older shape: ignore it, the screens load from the server.
  }
};

const save = (qc: QueryClient, acct: string) => {
  const state = dehydrate(qc, {
    shouldDehydrateQuery: (q) => q.state.status === 'success' && worthKeeping(q.queryKey as unknown[]),
    shouldDehydrateMutation: () => false,
  });
  const queries = state.queries.map((q) => {
    const data = q.state.data as { pages?: unknown[]; pageParams?: unknown[] } | undefined;
    if (!data || !Array.isArray(data.pages) || data.pages.length <= MAX_PAGES) return q;
    return { ...q, state: { ...q.state, data: { ...data, pages: data.pages.slice(0, MAX_PAGES), pageParams: (data.pageParams ?? []).slice(0, MAX_PAGES) } } };
  });
  try {
    writeJson(KEY, { ...state, queries }, acct);
  } catch {
    // Storage full or unavailable: the screens still load from the server.
  }
};

/** Saves the active account's kept queries a moment after they change. */
export const startQueryCache = (qc: QueryClient) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return qc.getQueryCache().subscribe((e) => {
    if (e.type !== 'updated' || e.action.type !== 'success' || !worthKeeping(e.query.queryKey as unknown[])) return;
    const acct = activeAccountId();
    // Already due: a burst of updates is written once (throttled, never put off indefinitely).
    if (!acct || timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      // Only if the account on screen is still the one the data belongs to.
      if (activeAccountId() === acct && useAccountsStore.getState().sessions.some((x) => x.id === acct)) save(qc, acct);
    }, 2000);
  });
};

/**
 * The inbox kept on the phone, like WhatsApp: each account's chat list and the
 * latest messages of its recent chats are saved as they change, and shown at
 * once on the next launch (or with no internet) while the socket catches up.
 * The live socket stays the source of truth: whatever it loads replaces this.
 */
import { readJson, writeJson } from '@/services/storage';
import { useAccountsStore } from '@/stores/accounts';
import { inboxOf, useInboxStore, type AccountInbox, type ChatMessage } from './store';

const KEY = 'inbox.cache.v1';
const MAX_CHATS = 200;
const MAX_THREADS = 50;
const MAX_MESSAGES = 40;
/** A busy inbox (events every second) still gets saved at least this often. */
const MAX_WAIT_MS = 10_000;

type Saved = { at: number; chats: AccountInbox['chats']; threads: Record<string, ChatMessage[]> };

const snapshot = (a: AccountInbox): Saved => {
  const chats = a.chats.slice(0, MAX_CHATS);
  const threads: Record<string, ChatMessage[]> = {};
  // The newest chats' threads: the ones someone is likely to open next.
  for (const c of chats.slice(0, MAX_THREADS)) {
    const list = (a.threads[c.id] ?? []).filter((m) => !m.pending && !String(m.id).startsWith('local-'));
    if (list.length) threads[c.id] = list.slice(-MAX_MESSAGES);
  }
  return { at: Date.now(), chats, threads };
};

/** Shows the saved inbox for an account that has nothing loaded yet. */
export const restoreInbox = (acct: string) => {
  if (inboxOf(acct).chats.length) return;
  const saved = readJson<Saved>(KEY, acct);
  if (!saved?.chats?.length) return;
  useInboxStore.getState().patch(acct, (cur) => ({
    chats: saved.chats,
    threads: { ...saved.threads, ...cur.threads },
    loaded: true,
    // More pages come from the server once connected.
    nextPage: null,
  }));
};

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const last = new Map<string, AccountInbox>();
/** When each account's oldest unsaved change happened. */
const dirtySince = new Map<string, number>();

const write = (acct: string) => {
  timers.delete(acct);
  dirtySince.delete(acct);
  // Signed out (or dropped) meanwhile: its storage is gone, and must not be recreated.
  const now = inboxOf(acct);
  if (!now.chats.length || !useAccountsStore.getState().sessions.some((x) => x.id === acct)) return;
  try {
    writeJson(KEY, snapshot(now), acct);
  } catch {
    // Storage full or unavailable: the live inbox still works.
  }
};

/** Saves each account's inbox a moment after it changes (bursts of messages are written once). */
export const startInboxCache = () =>
  useInboxStore.subscribe((s) => {
    for (const [acct, a] of Object.entries(s.byAccount)) {
      if (last.get(acct) === a) continue;
      last.set(acct, a);
      // Nothing worth saving before the first load (and never overwrite a saved list with an empty one).
      if (!a.chats.length) continue;
      clearTimeout(timers.get(acct));
      const since = dirtySince.get(acct) ?? Date.now();
      dirtySince.set(acct, since);
      // Quiet for 1.5 s, or 10 s since the first unsaved change, whichever comes first.
      timers.set(acct, setTimeout(() => write(acct), Math.max(0, Math.min(1500, since + MAX_WAIT_MS - Date.now()))));
    }
  });

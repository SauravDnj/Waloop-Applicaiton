/**
 * Signed-in accounts.
 *
 * Several accounts can be signed in at once — different logins, or several
 * workspaces of one login. All of them stay active: each keeps its token and
 * its own cache, and the background sync logs calls into every account whose
 * SIM selection matches. "Switching" only changes which one the UI shows.
 *
 * Tokens live in SecureStore (see `secure`), mirrored here in memory so API
 * clients can resolve them synchronously per request.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { forgetTokenAccess, getAuthAccessId, registerTokenAccess } from '@/services/accessId';
import { kvStorage, secure, setActiveStorageAccount } from '@/services/storage';

/** 15 account colours, distinct on light and dark backgrounds. */
export const ACCOUNT_COLORS = [
  '#4F46E5',
  '#2563EB',
  '#0891B2',
  '#0D9488',
  '#16A34A',
  '#65A30D',
  '#CA8A04',
  '#EA580C',
  '#DC2626',
  '#DB2777',
  '#C026D3',
  '#7C3AED',
  '#475569',
  '#92400E',
  '#0F766E',
] as const;

export type AccountSession = {
  /** `${userId}:${workspaceId}` — one login in one workspace. */
  id: string;
  userId: string;
  email: string;
  name: string;
  workspaceId: string;
  workspaceName: string;
  /** Project id this account signs in to (SSO) and calls CPaaS with. */
  accessId: string;
  isOwner: boolean;
  roleTitle: string;
  color: string;
  addedAt: number;
};

type AccountsState = {
  sessions: AccountSession[];
  activeId: string | null;
  upsert: (
    s: Omit<AccountSession, 'color' | 'addedAt' | 'accessId'> & Partial<Pick<AccountSession, 'color' | 'accessId'>>,
  ) => AccountSession;
  setActive: (id: string | null) => void;
  remove: (id: string) => void;
  setColor: (id: string, color: string) => void;
};

const tokens = new Map<string, string>();
export const tokenFor = (id: string | null | undefined) => (id ? (tokens.get(id) ?? '') : '');
export const setTokenFor = async (id: string, token: string) => {
  tokens.set(id, token);
  const s = useAccountsStore.getState().sessions.find((x) => x.id === id);
  if (s) registerTokenAccess(token, s.accessId);
  await secure.setToken(id, token);
};
export const forgetToken = (id: string) => {
  forgetTokenAccess(tokens.get(id) ?? '');
  tokens.delete(id);
};

/** Loads every account's token from secure storage into memory (boot and background task). */
export const hydrateTokens = async (): Promise<void> => {
  const { sessions } = useAccountsStore.getState();
  await Promise.all(
    sessions.map(async (s) => {
      const t = await secure.getToken(s.id).catch(() => null);
      if (t) {
        tokens.set(s.id, t);
        registerTokenAccess(t, s.accessId || getAuthAccessId());
      }
    }),
  );
};

/** One login in one workspace of one project. */
export const sessionId = (userId: string, workspaceId: string) => `${userId}:${workspaceId || 'own'}`;

export const useAccountsStore = create<AccountsState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeId: null,
      upsert: (input) => {
        const existing = get().sessions.find((s) => s.id === input.id);
        const used = new Set(get().sessions.map((s) => s.color));
        const color =
          input.color ?? existing?.color ?? ACCOUNT_COLORS.find((c) => !used.has(c)) ?? ACCOUNT_COLORS[get().sessions.length % ACCOUNT_COLORS.length];
        const next: AccountSession = {
          ...existing,
          ...input,
          color,
          accessId: input.accessId || existing?.accessId || getAuthAccessId(),
          addedAt: existing?.addedAt ?? Date.now(),
        };
        registerTokenAccess(tokens.get(next.id) ?? '', next.accessId);
        set({ sessions: existing ? get().sessions.map((s) => (s.id === next.id ? next : s)) : [...get().sessions, next] });
        return next;
      },
      setActive: (id) => {
        setActiveStorageAccount(id);
        set({ activeId: id });
      },
      remove: (id) => {
        forgetToken(id);
        const sessions = get().sessions.filter((s) => s.id !== id);
        // The next active account must still be signed in.
        const activeId = get().activeId === id ? (sessions.find((s) => tokenFor(s.id))?.id ?? null) : get().activeId;
        setActiveStorageAccount(activeId);
        set({ sessions, activeId });
      },
      setColor: (id, color) => set({ sessions: get().sessions.map((s) => (s.id === id ? { ...s, color } : s)) }),
    }),
    {
      name: 'accounts',
      storage: createJSONStorage(() => kvStorage),
      partialize: (s) => ({ sessions: s.sessions, activeId: s.activeId }),
      onRehydrateStorage: () => (state) => setActiveStorageAccount(state?.activeId ?? null),
    },
  ),
);

// Synchronous storage hydrates on creation; make sure the active scope is set.
setActiveStorageAccount(useAccountsStore.getState().activeId);

export const activeAccountId = () => useAccountsStore.getState().activeId;
export const activeSession = () => {
  const { sessions, activeId } = useAccountsStore.getState();
  return sessions.find((s) => s.id === activeId) ?? null;
};
export const useActiveSession = () => useAccountsStore((s) => s.sessions.find((x) => x.id === s.activeId) ?? null);

type Listener = (activeId: string | null) => void;
const listeners = new Set<Listener>();
/** Fires after the active account changes (switch, add, sign-out). */
export const onActiveAccountChange = (l: Listener) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
export const emitActiveAccountChange = (id: string | null) => listeners.forEach((l) => l(id));

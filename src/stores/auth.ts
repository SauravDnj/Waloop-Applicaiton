/**
 * Auth state for the *active* account, on top of the multi-account store.
 *
 * Status machine:
 *   booting → signedOut | signedIn
 *   signedIn → accountLost (A403 on the active account) | signedOut (last account removed)
 *
 * Signing in while already signed in (`beginAddAccount`) adds another account;
 * the existing ones stay signed in and keep syncing.
 */
import type { AccountContext, AccountOption, MappedProfile } from '@ab-ecosystem/sso';
import { useQuery } from '@tanstack/react-query';
import { create } from 'zustand';

import * as sso from '@/services/sso/client';
import { clearAccountStorage, readJson, secure, writeJson } from '@/services/storage';
import { isWebPreview, previewContext, startWebPreview } from '@/lib/webPreview';
import { useWhatsAppStore } from './whatsapp';
import { useSettingsStore } from './settings';
import { usePinStore } from '@/services/inbox/pins';
import { removePin, unlock } from './appLock';
import { getAuthAccessId, labelAccessId, registerTokenAccess, setAuthAccessId } from '@/services/accessId';
import { configureSessionCheck } from '@/services/sessionExpiry';
import {
  activeSession,
  useActiveSession,
  emitActiveAccountChange,
  forgetToken,
  hydrateTokens,
  sessionId,
  setTokenFor,
  tokenFor,
  useAccountsStore,
  type AccountSession,
} from './accounts';

export type AuthStatus = 'booting' | 'signedOut' | 'signedIn' | 'accountLost';

type AuthState = {
  status: AuthStatus;
  token: string | null;
  profile: MappedProfile | null;
  context: AccountContext | null;
  /** Workspaces reachable from the active login (SSO `/accounts`). */
  accounts: AccountOption[];
  pending: null | { kind: '2fa'; email: string; password: string } | { kind: 'account'; ticket: string; accounts: AccountOption[] };
  /** True while the auth screens are open to add another account. */
  adding: boolean;
  error: string | null;
  /** The account whose sign-in expired, so the sign-in screen can say so and fill in the email. */
  expired: { email: string; workspace: string } | null;
  boot: () => Promise<void>;
  /** `accessId` defaults to the one the sign-in screens chose. */
  adoptToken: (token: string, accessId?: string) => Promise<AccountSession>;
  login: (email: string, password: string, captchaToken?: string) => Promise<void>;
  verifyOtp: (code: string, captchaToken?: string) => Promise<void>;
  chooseAccount: (accountId: string) => Promise<void>;
  /** Replaces the active session with another workspace (used when access was lost). */
  switchAccount: (accountId: string) => Promise<void>;
  /** Adds another workspace of the active login as a separate, parallel account. */
  addWorkspace: (workspaceId: string) => Promise<void>;
  /** Makes another signed-in account the one the UI shows. */
  switchSession: (id: string) => Promise<void>;
  beginAddAccount: () => void;
  cancelAddAccount: () => void;
  refreshAccounts: () => Promise<void>;
  /** Signs out one account (default: the active one). */
  signOut: (id?: string) => Promise<void>;
  clearPending: () => void;
  onUnauthorized: (accountLost: boolean) => void;
  /** The account's sign-in expired: drop its token but keep its data, and ask for the password again. */
  expireSession: (id: string) => Promise<void>;
};

const toSession = (me: sso.Me) => {
  const workspaceId = me.context?.accountId ?? '';
  return {
    id: sessionId(me.profile.id, workspaceId),
    userId: me.profile.id,
    email: me.profile.email,
    name: [me.profile.firstName, me.profile.lastName].filter(Boolean).join(' ') || me.profile.email,
    workspaceId,
    workspaceName: me.context?.accountName || [me.profile.firstName, me.profile.lastName].filter(Boolean).join(' ') || me.profile.email,
    isOwner: me.context?.isOwner ?? true,
    roleTitle: me.context?.role?.title ?? '',
  };
};

/**
 * Removes an account from the phone: its token, cached data and per-account
 * settings. The next active account is one that is still signed in.
 */
const forgetAccount = async (accountId: string) => {
  await clearAccountStorage(accountId);
  await removePin(accountId);
  useWhatsAppStore.getState().forget(accountId);
  usePinStore.setState((s) => {
    const { [accountId]: _pins, ...byAccount } = s.byAccount;
    return { byAccount };
  });
  useSettingsStore.setState((s) => {
    const { [accountId]: _country, ...countryByAccount } = s.countryByAccount;
    return { countryByAccount };
  });
  useAccountsStore.getState().remove(accountId);
};

export const useAuthStore = create<AuthState>()((set, get) => ({
  status: 'booting',
  expired: null,
  token: null,
  profile: null,
  context: null,
  accounts: [],
  pending: null,
  adding: false,
  error: null,

  boot: async () => {
    // Local web dev only: a demo workspace for checking layouts and taking screenshots.
    if (isWebPreview()) {
      const demo = await startWebPreview();
      set({ status: 'signedIn', token: demo.token, profile: demo.profile as never, context: previewContext() as never, error: null });
      return;
    }
    await hydrateTokens();
    const acc = useAccountsStore.getState();
    const valid = acc.sessions.filter((s) => tokenFor(s.id));
    if (!valid.length) {
      set({ status: 'signedOut', token: null });
      return;
    }
    const active = valid.find((s) => s.id === acc.activeId) ?? valid[0];
    if (active.id !== acc.activeId) acc.setActive(active.id);
    const token = tokenFor(active.id);
    set({ token });
    // Another account became active meanwhile (e.g. a notification tap): its own switch owns the state.
    const stillActive = () => useAccountsStore.getState().activeId === active.id;
    try {
      const me = await sso.getMe(token);
      if (!stillActive()) return;
      set({ status: 'signedIn', profile: me.profile, context: me.context, error: null });
      useAccountsStore.getState().upsert({ ...toSession(me), id: active.id });
      void get().refreshAccounts();
    } catch (err) {
      if (!stillActive()) return;
      if (err instanceof sso.SsoError && err.isAccountAccessLost) {
        set({ status: 'accountLost', error: err.message });
        void get().refreshAccounts();
      } else if (err instanceof sso.SsoError && err.status === 401) {
        // Expired while the app was closed: sign in again, the account's data stays.
        await get().expireSession(active.id);
      } else {
        // Offline: keep the session and show cached data.
        set({ status: 'signedIn', error: err instanceof Error ? err.message : 'Could not reach the server' });
      }
    }
  },

  adoptToken: async (token, accessId = getAuthAccessId()) => {
    registerTokenAccess(token, accessId);
    const me = await sso.getMe(token);
    const session = useAccountsStore.getState().upsert({ ...toSession(me), accessId });
    labelAccessId(accessId, session.workspaceName);
    await setTokenFor(session.id, token);
    useAccountsStore.getState().setActive(session.id);
    set({ token, pending: null, adding: false, status: 'signedIn', profile: me.profile, context: me.context, error: null, expired: null });
    emitActiveAccountChange(session.id);
    void get().refreshAccounts();
    return session;
  },

  login: async (email, password, captchaToken) => {
    set({ error: null });
    const res = await sso.login({ email, password, captchaToken });
    if (res.twoFactorRequired) {
      set({ pending: { kind: '2fa', email, password } });
      return;
    }
    if (res.accountSelectionRequired) {
      set({ pending: { kind: 'account', ticket: res.selectionTicket ?? '', accounts: res.accounts ?? [] } });
      return;
    }
    const token = sso.readAccessToken(res);
    if (!token) throw new sso.SsoError('No access token in the response');
    // Just signed in with the password: no PIN asked on top of it.
    unlock((await get().adoptToken(token)).id);
  },

  verifyOtp: async (code, captchaToken) => {
    const p = get().pending;
    if (!p || p.kind !== '2fa') throw new sso.SsoError('No sign-in is waiting for a code');
    const res = await sso.verifyTwoFactor({ email: p.email, password: p.password, twoFactorToken: code, captchaToken });
    if (res.accountSelectionRequired) {
      set({ pending: { kind: 'account', ticket: res.selectionTicket ?? '', accounts: res.accounts ?? [] } });
      return;
    }
    const token = sso.readAccessToken(res);
    if (!token) throw new sso.SsoError('No access token in the response');
    unlock((await get().adoptToken(token)).id);
  },

  chooseAccount: async (accountId) => {
    const p = get().pending;
    if (!p || p.kind !== 'account') throw new sso.SsoError('No account selection is pending');
    const token = await sso.selectAccount(p.ticket, accountId);
    // The ticket comes from a password sign-in.
    unlock((await get().adoptToken(token)).id);
  },

  switchAccount: async (accountId) => {
    const token = get().token;
    const oldId = useAccountsStore.getState().activeId;
    if (!token) throw new sso.SsoError('Not signed in');
    const next = await sso.switchAccount(token, accountId);
    const session = await get().adoptToken(next, activeSession()?.accessId);
    // Access to the old workspace was lost (that is when this runs): drop it and its data.
    if (oldId && oldId !== session.id) await forgetAccount(oldId);
  },

  addWorkspace: async (workspaceId) => {
    const token = get().token;
    if (!token) throw new sso.SsoError('Not signed in');
    const next = await sso.switchAccount(token, workspaceId);
    await get().adoptToken(next, activeSession()?.accessId);
  },

  switchSession: async (id) => {
    const acc = useAccountsStore.getState();
    const target = acc.sessions.find((s) => s.id === id);
    const token = tokenFor(id);
    if (!target || !token) throw new sso.SsoError('That account is not signed in');
    acc.setActive(id);
    set({ token, status: 'signedIn', profile: null, context: null, accounts: [], error: null });
    emitActiveAccountChange(id);
    // A later switch may have happened while this one waited: only the active account's reply counts.
    const stillActive = () => useAccountsStore.getState().activeId === id;
    try {
      const me = await sso.getMe(token);
      if (!stillActive()) return;
      set({ profile: me.profile, context: me.context });
      void get().refreshAccounts();
    } catch (err) {
      if (!stillActive()) return;
      if (err instanceof sso.SsoError && err.isAccountAccessLost) set({ status: 'accountLost', error: err.message });
      else if (err instanceof sso.SsoError && err.status === 401) await get().expireSession(id);
    }
  },

  beginAddAccount: () => set({ adding: true, pending: null, error: null }),
  cancelAddAccount: () => set({ adding: false, pending: null }),

  refreshAccounts: async () => {
    if (isWebPreview()) return;
    const token = get().token;
    if (!token) return;
    try {
      set({ accounts: await sso.listAccounts(token) });
    } catch {
      // Non-fatal.
    }
  },

  signOut: async (id) => {
    const acc = useAccountsStore.getState();
    const target = id ?? acc.activeId;
    if (!target) return;
    const wasActive = target === acc.activeId;
    const token = tokenFor(target);
    // While the token still works: withdraw this device's push, then end the SSO session.
    if (token) await import('@/services/notifications').then((m) => m.unregisterPushDevice(target)).catch(() => undefined);
    if (token) await sso.logout(token).catch(() => undefined);
    await forgetAccount(target);
    if (!wasActive) return;
    const next = useAccountsStore.getState().activeId;
    const signedOut = () => {
      set({ status: 'signedOut', token: null, profile: null, context: null, accounts: [], pending: null, adding: false, error: null });
      emitActiveAccountChange(null);
    };
    if (!next) return signedOut();
    // Never leave the app half-switched (that kept boot on the splash screen).
    await get()
      .switchSession(next)
      .catch(() => signedOut());
  },

  clearPending: () => set({ pending: null, error: null }),

  onUnauthorized: (accountLost) => {
    if (isWebPreview()) return;
    if (accountLost) {
      set({ status: 'accountLost' });
      void get().refreshAccounts();
    } else {
      const id = useAccountsStore.getState().activeId;
      if (id) void get().expireSession(id);
    }
  },

  expireSession: async (id) => {
    const session = useAccountsStore.getState().sessions.find((x) => x.id === id);
    // Not signOut(): that forgets the account with its settings.
    // Only the token goes; signing in to the same workspace again brings everything back.
    await secure.clearToken(id).catch(() => undefined);
    forgetToken(id);
    // Its live inbox goes too: the socket would keep notifying, and retry with no token.
    void import('@/services/inbox/manager').then((m) => m.disconnectInbox(id));
    if (session?.accessId) setAuthAccessId(session.accessId);
    if (useAccountsStore.getState().activeId !== id) return;
    set({
      status: 'signedOut',
      token: null,
      profile: null,
      context: null,
      pending: null,
      adding: false,
      error: null,
      expired: session ? { email: session.email, workspace: session.workspaceName } : null,
    });
    emitActiveAccountChange(null);
  },
}));

/**
 * The account's role context: the live one from `/me`, else the last one this phone saw
 * for the account (offline start, account switch in progress). A member is never treated
 * as an owner just because `/me` hasn't answered yet.
 */
const CONTEXT_KEY = 'me.context.v1';
const ENFORCED_KEY = 'permissions.enforced.v1';
const useRoleContext = (): AccountContext | null => {
  const live = useAuthStore((s) => s.context);
  const acct = useAccountsStore((s) => s.activeId);
  return live ?? (acct ? readJson<AccountContext>(CONTEXT_KEY, acct) : null);
};
// Remember each account's role as soon as `/me` gives it.
useAuthStore.subscribe((cur, prev) => {
  const acct = useAccountsStore.getState().activeId;
  if (cur.context && cur.context !== prev.context && acct) writeJson(CONTEXT_KEY, cur.context, acct);
});

export const useIsOwner = () => {
  const context = useRoleContext();
  const session = useActiveSession();
  return context ? context.isOwner : (session?.isOwner ?? true);
};
/**
 * Whether the server enforces role permissions on this account. Asked once per
 * session for members (the catalogue is readable by any member); owners skip
 * it. Until the answer arrives, members are treated as enforced, so options
 * appear late rather than show and then vanish.
 */
/** The member's permission catalogue; the last answer this phone saw stands in while it loads or fails. */
const usePermissionCatalogue = () => {
  const token = useAuthStore((s) => s.token);
  const acct = useAccountsStore((s) => s.activeId);
  const member = !useIsOwner();
  const catalogue = useQuery({
    queryKey: ['permissions', acct],
    queryFn: async () => {
      const c = await sso.getPermissions(token!);
      if (acct) writeJson(ENFORCED_KEY, c?.enforced !== false, acct);
      return c;
    },
    enabled: member && !!token,
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });
  const saved = acct ? readJson<boolean>(ENFORCED_KEY, acct) : null;
  const enforced = catalogue.data ? catalogue.data.enforced !== false : (saved ?? true);
  return { member, enforced: member && enforced, settled: !member || catalogue.isSuccess || catalogue.isError || saved !== null };
};

const usePermissionsEnforced = (): boolean => usePermissionCatalogue().enforced;

/** False while a member's permissions are still unknown (no answer yet, and none saved from before). */
export const usePermissionsSettled = (): boolean => usePermissionCatalogue().settled;

/** The check behind `useCan`: keys go by the role, when the account enforces them. */
const useAllows = () => {
  const enforced = usePermissionsEnforced();
  const context = useRoleContext();
  return (permission: string) => !enforced || sso.hasPermission(context, permission);
};

/**
 * Whether the signed-in person may do something: a permission key such as
 * `CRM.CONTACT.DELETE` (see `@/lib/permissions`). Owners may do everything; so
 * may members while the account doesn't enforce the server's permissions.
 */
export const useCan = (permission: string) => useAllows()(permission);

/** True when any of the keys is allowed (e.g. listing channels of any type). */
export const useCanAny = (permissions: string[]) => permissions.some(useAllows());

/** True when every key is allowed. */
export const useCanAll = (permissions: string[]) => permissions.every(useAllows());
export const useMyUserId = () => useAuthStore((s) => s.profile?.id ?? '');
export const useMyName = () => useAuthStore((s) => [s.profile?.firstName, s.profile?.lastName].filter(Boolean).join(' ') || s.profile?.email || 'You');

// A 401 anywhere while the app is open is checked here once (see sessionExpiry.ts).
configureSessionCheck({
  verify: async (token) => {
    try {
      await sso.getMe(token);
      return 'valid';
    } catch (err) {
      if (!(err instanceof sso.SsoError)) return 'unknown';
      if (err.isAccountAccessLost) return 'lost';
      return err.status === 401 ? 'expired' : 'unknown';
    }
  },
  onExpired: () => useAuthStore.getState().onUnauthorized(false),
  onLost: () => useAuthStore.getState().onUnauthorized(true),
});

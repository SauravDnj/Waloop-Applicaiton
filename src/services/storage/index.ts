/**
 * Storage tiers.
 *
 * - `secure` (expo-secure-store): one session token per signed-in account,
 *   keyed by account id. Keychain / Keystore backed.
 * - `kvGlobal()` (MMKV "inbox-campaigns"): app-wide state — settings, the list of
 *   signed-in accounts, the live dial session, the device id.
 * - `kvFor(accountId)` (MMKV per account): everything that belongs to one
 *   workspace — local call-log mirror, data-store ids, lookup caches,
 *   reminders, sync cursors. Accounts never see each other's cache, and a
 *   background sync for account B never touches account A's files.
 * - `kv()` is the store of the *active* account (or the global one before
 *   anyone is signed in), for UI code that only ever deals with the active one.
 */
import * as SecureStore from 'expo-secure-store';
import { createMMKV, type MMKV } from 'react-native-mmkv';
import type { StateStorage } from 'zustand/middleware';

let globalStore: MMKV | null = null;
const accountStores = new Map<string, MMKV>();
let activeAccountId: string | null = null;

export const kvGlobal = (): MMKV => {
  if (!globalStore) globalStore = createMMKV({ id: 'inbox-campaigns' });
  return globalStore;
};

const safeId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);

export const kvFor = (accountId: string | null | undefined): MMKV => {
  if (!accountId) return kvGlobal();
  let store = accountStores.get(accountId);
  if (!store) {
    store = createMMKV({ id: `inbox-campaigns-acct-${safeId(accountId)}` });
    accountStores.set(accountId, store);
  }
  return store;
};

/** Called by the accounts store whenever the active account changes. */
export const setActiveStorageAccount = (accountId: string | null) => {
  activeAccountId = accountId;
};
export const activeStorageAccount = () => activeAccountId;

export const kv = (): MMKV => kvFor(activeAccountId);

/** Zustand persistence for app-wide stores (settings, accounts, WhatsApp). */
export const kvStorage: StateStorage = {
  getItem: (name) => kvGlobal().getString(name) ?? null,
  setItem: (name, value) => kvGlobal().set(name, value),
  removeItem: (name) => {
    kvGlobal().remove(name);
  },
};

export const readJson = <T>(key: string, accountId?: string | null): T | null => {
  const raw = (accountId === undefined ? kv() : kvFor(accountId)).getString(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export const writeJson = (key: string, value: unknown, accountId?: string | null) =>
  (accountId === undefined ? kv() : kvFor(accountId)).set(key, JSON.stringify(value));

const tokenKey = (accountId: string) => `inboxcampaign.token.${safeId(accountId)}`;

export const secure = {
  getToken: (accountId: string) => SecureStore.getItemAsync(tokenKey(accountId)),
  setToken: (accountId: string, token: string) => SecureStore.setItemAsync(tokenKey(accountId), token),
  clearToken: (accountId: string) => SecureStore.deleteItemAsync(tokenKey(accountId)),
};

/** "Remember password": one email and password per access id, in the Keychain / Keystore. */
export type SavedLogin = { email: string; password: string };
const loginKey = (accessId: string) => `inboxcampaign.login.${safeId(accessId)}`;

export const savedLogins = {
  get: async (accessId: string): Promise<SavedLogin | null> => {
    try {
      const raw = await SecureStore.getItemAsync(loginKey(accessId));
      const v = raw ? (JSON.parse(raw) as Partial<SavedLogin>) : null;
      return v?.email && v.password ? { email: v.email, password: v.password } : null;
    } catch {
      return null;
    }
  },
  set: (accessId: string, login: SavedLogin) => SecureStore.setItemAsync(loginKey(accessId), JSON.stringify(login)).catch(() => undefined),
  clear: (accessId: string) => SecureStore.deleteItemAsync(loginKey(accessId)).catch(() => undefined),
};

/** App-lock PINs, one per account, on this device only (Keychain / Keystore). */
const lockKey = (accountId: string) => `inboxcampaign.lockpin.${safeId(accountId)}`;
export const lockPins = {
  matches: async (accountId: string, pin: string) => (await SecureStore.getItemAsync(lockKey(accountId)).catch(() => null)) === pin,
  set: (accountId: string, pin: string) => SecureStore.setItemAsync(lockKey(accountId), pin),
  clear: (accountId: string) => SecureStore.deleteItemAsync(lockKey(accountId)).catch(() => undefined),
};

/** Removes one account's token and cache. */
export const clearAccountStorage = async (accountId: string) => {
  await secure.clearToken(accountId).catch(() => undefined);
  kvFor(accountId).clearAll();
  accountStores.delete(accountId);
};

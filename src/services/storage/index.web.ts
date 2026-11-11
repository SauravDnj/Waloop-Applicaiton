/**
 * Web storage: the same API as the native module, on localStorage. Each
 * account gets its own key namespace; tokens sit in localStorage too, the
 * same trade-off the SSO package makes on the web by default.
 */
import type { StateStorage } from 'zustand/middleware';

const ROOT = 'inboxcampaign:';

const ls = (): Storage | null => {
  try {
    // Node 25+ defines a `localStorage` global during the server render that has no
    // working methods unless started with `--localstorage-file`; only use a real one.
    return typeof localStorage !== 'undefined' && typeof localStorage?.getItem === 'function' ? localStorage : null;
  } catch {
    return null;
  }
};

const memory = new Map<string, string>();

type KvLike = {
  getString: (k: string) => string | undefined;
  getNumber: (k: string) => number | undefined;
  set: (k: string, v: string | number | boolean) => void;
  remove: (k: string) => boolean;
  clearAll: () => void;
};

const makeStore = (prefix: string): KvLike => {
  const get = (k: string): string | undefined => ls()?.getItem(prefix + k) ?? memory.get(prefix + k);
  return {
    getString: get,
    getNumber: (k) => {
      const v = get(k);
      return v == null ? undefined : Number(v);
    },
    set: (k, v) => {
      try {
        ls()?.setItem(prefix + k, String(v));
      } catch {
        // quota / private mode
      }
      memory.set(prefix + k, String(v));
    },
    remove: (k) => {
      ls()?.removeItem(prefix + k);
      memory.delete(prefix + k);
      return true;
    },
    clearAll: () => {
      const l = ls();
      if (l) for (const key of Object.keys(l)) if (key.startsWith(prefix)) l.removeItem(key);
      for (const key of [...memory.keys()]) if (key.startsWith(prefix)) memory.delete(key);
    },
  };
};

const globalStore = makeStore(`${ROOT}g:`);
const accountStores = new Map<string, KvLike>();
let activeAccountId: string | null = null;

export const kvGlobal = (): KvLike => globalStore;

export const kvFor = (accountId: string | null | undefined): KvLike => {
  if (!accountId) return globalStore;
  let s = accountStores.get(accountId);
  if (!s) {
    s = makeStore(`${ROOT}a:${accountId}:`);
    accountStores.set(accountId, s);
  }
  return s;
};

export const setActiveStorageAccount = (accountId: string | null) => {
  activeAccountId = accountId;
};
export const activeStorageAccount = () => activeAccountId;

export const kv = (): KvLike => kvFor(activeAccountId);

export const kvStorage: StateStorage = {
  getItem: (name) => globalStore.getString(name) ?? null,
  setItem: (name, value) => globalStore.set(name, value),
  removeItem: (name) => {
    globalStore.remove(name);
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

const tokens = makeStore(`${ROOT}t:`);

/** App-lock PINs on web: only a salted SHA-256 of the PIN is kept in this browser. */
const lockStore = makeStore(`${ROOT}l:`);
const pinHash = async (accountId: string, pin: string) => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`inbox-lock:${accountId}:${pin}`));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
};
export const lockPins = {
  matches: async (accountId: string, pin: string) => lockStore.getString(accountId) === (await pinHash(accountId, pin)),
  set: async (accountId: string, pin: string) => lockStore.set(accountId, await pinHash(accountId, pin)),
  clear: async (accountId: string) => {
    lockStore.remove(accountId);
  },
};

/** Web: the browser's own password manager remembers sign-ins; the app keeps no password. */
export type SavedLogin = { email: string; password: string };
export const savedLogins = {
  get: async (_accessId: string): Promise<SavedLogin | null> => null,
  set: async (_accessId: string, _login: SavedLogin) => undefined,
  clear: async (_accessId: string) => undefined,
};

export const secure = {
  getToken: async (accountId: string) => tokens.getString(accountId) ?? null,
  setToken: async (accountId: string, token: string) => tokens.set(accountId, token),
  clearToken: async (accountId: string) => {
    tokens.remove(accountId);
  },
};

export const clearAccountStorage = async (accountId: string) => {
  await secure.clearToken(accountId);
  kvFor(accountId).clearAll();
  accountStores.delete(accountId);
};

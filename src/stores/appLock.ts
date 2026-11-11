/**
 * App lock: a 4-digit PIN per account, on this device only. A locked account
 * asks for its PIN when the app opens, when it comes back after a minute in
 * the background, and every time the user switches back to it. A forgotten
 * PIN is reset with the account's password (see `AppLock`).
 *
 * The PIN sits in secure storage (`lockPins`); which accounts have one, and
 * the wrong tries (so restarting the app doesn't reset the wait), are kept in
 * plain storage, so the gate knows on first render without waiting.
 */
import { AppState } from 'react-native';
import { create } from 'zustand';

import { kvGlobal, lockPins, savedLogins } from '@/services/storage';
import { useAccountsStore } from './accounts';

const IDS_KEY = 'appLock.ids';
/** Back from the background after this long, every account locks again. */
export const RELOCK_AFTER_MS = 60_000;
/** Wrong PINs allowed before a wait, which doubles each time. */
const FREE_TRIES = 5;

const readIds = (): string[] => {
  try {
    const raw = kvGlobal().getString(IDS_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};
const writeIds = (ids: string[]) => kvGlobal().set(IDS_KEY, JSON.stringify(ids));

const FAILS_KEY = 'appLock.fails';
type Fails = Record<string, { count: number; until: number }>;
const readFails = (): Fails => {
  try {
    return (JSON.parse(kvGlobal().getString(FAILS_KEY) ?? '{}') as Fails) ?? {};
  } catch {
    return {};
  }
};
const setFails = (fails: Fails) => {
  kvGlobal().set(FAILS_KEY, JSON.stringify(fails));
  useAppLockStore.setState({ fails });
};

type State = {
  /** Accounts with a PIN on this device. */
  ids: string[];
  /** Accounts unlocked since the app last opened or relocked. */
  unlocked: Record<string, true>;
  /** Wrong tries per account, and until when (ms) the next try must wait. */
  fails: Fails;
  /** The app is not in the foreground: a locked account's screens are hidden (app-switcher snapshot). */
  covered: boolean;
};

export const useAppLockStore = create<State>()(() => ({ ids: readIds(), unlocked: {}, fails: readFails(), covered: false }));

export const hasPin = (id: string) => useAppLockStore.getState().ids.includes(id);
export const useHasPin = (id: string | null | undefined) => useAppLockStore((s) => !!id && s.ids.includes(id));
/** True while this account must show the lock screen. */
export const useIsLocked = (id: string | null | undefined) => useAppLockStore((s) => !!id && s.ids.includes(id) && !s.unlocked[id]);

export const setPin = async (id: string, pin: string) => {
  await lockPins.set(id, pin);
  // A remembered password would open the account from the sign-in screen without the PIN.
  const s = useAccountsStore.getState().sessions.find((x) => x.id === id);
  if (s) await forgetSavedPassword(s.accessId, s.email);
  const ids = [...new Set([...useAppLockStore.getState().ids, id])];
  writeIds(ids);
  // Whoever just set it is using the account: it stays open until the next relock.
  useAppLockStore.setState((s) => ({ ids, unlocked: { ...s.unlocked, [id]: true } }));
};

export const removePin = async (id: string) => {
  await lockPins.clear(id);
  const ids = useAppLockStore.getState().ids.filter((x) => x !== id);
  writeIds(ids);
  const { [id]: _f, ...fails } = useAppLockStore.getState().fails;
  setFails(fails);
  useAppLockStore.setState({ ids });
};

/** Drops the remembered sign-in for this login, if it is the one remembered. */
export const forgetSavedPassword = async (accessId: string, email: string) => {
  const saved = await savedLogins.get(accessId);
  if (saved && saved.email.toLowerCase() === email.toLowerCase()) await savedLogins.clear(accessId);
};

/** Ms until another try is allowed (0: now). */
export const waitFor = (id: string) => Math.max(0, (useAppLockStore.getState().fails[id]?.until ?? 0) - Date.now());

export type PinCheck = { ok: true } | { ok: false; waitMs: number };

/** Checks a PIN, counting wrong ones; a right one unlocks the account. */
export const checkPin = async (id: string, pin: string): Promise<PinCheck> => {
  const wait = waitFor(id);
  if (wait) return { ok: false, waitMs: wait };
  if (await lockPins.matches(id, pin)) {
    unlock(id);
    return { ok: true };
  }
  const fails = useAppLockStore.getState().fails;
  const count = (fails[id]?.count ?? 0) + 1;
  // Capped at a day so a long-forgotten PIN can still be reset with the password.
  const waitMs = count >= FREE_TRIES ? Math.min(30_000 * 2 ** (count - FREE_TRIES), 24 * 3600_000) : 0;
  setFails({ ...fails, [id]: { count, until: Date.now() + waitMs } });
  return { ok: false, waitMs };
};

export const unlock = (id: string) => {
  const { [id]: _f, ...fails } = useAppLockStore.getState().fails;
  setFails(fails);
  useAppLockStore.setState((s) => ({ unlocked: { ...s.unlocked, [id]: true } }));
};

export const lockAll = () => useAppLockStore.setState({ unlocked: {} });

const relock = (id: string) =>
  useAppLockStore.setState((s) => {
    const { [id]: _u, ...unlocked } = s.unlocked;
    return { unlocked };
  });

// Leaving an account locks it again: switching back asks for its PIN.
useAccountsStore.subscribe((s, prev) => {
  if (prev.activeId && prev.activeId !== s.activeId) relock(prev.activeId);
});

// Time in the background, tracked for the whole app (not only while signed-in screens are
// mounted). A clock set back counts as "long enough", so it can't be used to skip the relock.
let leftAt: number | null = null;
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    if (leftAt !== null) {
      const away = Date.now() - leftAt;
      if (away < 0 || away > RELOCK_AFTER_MS) lockAll();
    }
    leftAt = null;
    useAppLockStore.setState({ covered: false });
  } else {
    if (state === 'background' && leftAt === null) leftAt = Date.now();
    useAppLockStore.setState({ covered: true });
  }
});

/** The app is in the background and the account on screen has a PIN: cover it (app switcher). */
export const useCovered = (id: string | null | undefined) => useAppLockStore((s) => !!id && s.ids.includes(id) && s.covered);

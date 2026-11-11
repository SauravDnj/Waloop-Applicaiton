/**
 * Automatic phone-contacts sync for the account on screen: when the app opens or
 * comes back (at most every `AUTO_EVERY_MS`), and half a minute after the
 * address book changes. Does nothing unless that account chose automatic sync
 * and the contacts permission is granted.
 */
import { useQueryClient } from '@tanstack/react-query';
import { addContactsChangeListener } from 'expo-contacts';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { AUTO_EVERY_MS, hasContactsPermission, isSyncRunning, readDeviceContacts, readSyncSettings, syncContacts } from '@/services/phoneContacts';
import { useAccountsStore } from '@/stores/accounts';

/** One automatic run for an account, if it is due (or `force`d by an address-book change). */
export const runAutoSync = async (acct: string, force = false): Promise<'added' | 'none' | 'busy'> => {
  if (Platform.OS === 'web') return 'none';
  if (isSyncRunning()) return 'busy';
  const s = readSyncSettings(acct);
  if (s.mode !== 'auto' || (!force && Date.now() - s.lastRunAt < AUTO_EVERY_MS)) return 'none';
  if (!(await hasContactsPermission().catch(() => false))) return 'none';
  try {
    const res = await syncContacts(acct, await readDeviceContacts());
    return res.busy ? 'busy' : res.added > 0 ? 'added' : 'none';
  } catch {
    return 'none';
  }
};

export const usePhoneContactsSync = () => {
  const acct = useAccountsStore((s) => s.activeId);
  const qc = useQueryClient();
  useEffect(() => {
    if (!acct || Platform.OS === 'web') return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = (force = false) =>
      void runAutoSync(acct, force).then((res) => {
        if (res === 'added') void qc.invalidateQueries({ queryKey: ['leads'] });
        // An address-book change during another run: try again after it.
        if (res === 'busy' && force) timer = setTimeout(() => run(true), 30_000);
      });
    run();
    const app = AppState.addEventListener('change', (state) => state === 'active' && run());
    // Android reports a change late and sometimes twice: one run, a little after the last report.
    const book = addContactsChangeListener(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => run(true), 30_000);
    });
    return () => {
      app.remove();
      book.remove();
      if (timer) clearTimeout(timer);
    };
  }, [acct, qc]);
};

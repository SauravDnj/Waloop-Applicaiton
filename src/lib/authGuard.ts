/**
 * Route guards for the two route groups. Each group's layout calls its guard
 * and renders a <Redirect> itself; a redirect from inside a mounted layout is
 * reliable on every platform (one from the root layout is not on Android).
 */
import { useGlobalSearchParams, usePathname, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';

import { HOME } from '@/lib/nav';
import { hasChosenAccessId } from '@/services/accessId';
import { useAuthStore } from '@/stores/auth';
import { useAccountsStore } from '@/stores/accounts';

/** Signed-in area only: anyone else is sent to sign in. */
export const useAppGuard = () => {
  const status = useAuthStore((s) => s.status);
  if (status === 'booting') return { ready: false as const, redirect: null };
  if (status === 'signedIn') return { ready: true as const, redirect: null };
  const href: Href = status === 'accountLost' ? '/(auth)/accounts' : hasChosenAccessId() ? '/(auth)/login' : '/(auth)/access';
  return { ready: false as const, redirect: href };
};

/** Sign-in screens: a signed-in user is sent home, unless they are adding another account. */
export const useAuthGuard = (): Href | null => {
  const status = useAuthStore((s) => s.status);
  const adding = useAuthStore((s) => s.adding);
  return status === 'signedIn' && !adding ? HOME : null;
};

const AUTH_PATHS = ['/access', '/login', '/otp', '/signup', '/forgot', '/accounts'];

/**
 * Coming back from the add-account screens any way (hardware back, swipe)
 * ends "adding", so the sign-in guard works normally again. Only a return from
 * them counts: tapping "Add account" sets the flag a moment before the sign-in
 * screen opens, and must not be undone.
 */
export const useEndAddingOutsideAuth = () => {
  const pathname = usePathname();
  const inAuth = AUTH_PATHS.some((p) => pathname.startsWith(p));
  const wasInAuth = useRef(false);
  useEffect(() => {
    if (inAuth) wasInAuth.current = true;
    else if (wasInAuth.current) {
      wasInAuth.current = false;
      if (useAuthStore.getState().adding) useAuthStore.getState().cancelAddAccount();
    }
  }, [inAuth]);
};

/** A link with `?account=<id>` (e.g. from a widget set to one account) switches to that account. */
export const useAccountFromLink = () => {
  const { account } = useGlobalSearchParams<{ account?: string }>();
  useEffect(() => {
    if (!account) return;
    const { activeId, sessions } = useAccountsStore.getState();
    if (account !== activeId && sessions.some((s) => s.id === account)) void useAuthStore.getState().switchSession(account).catch(() => undefined);
  }, [account]);
};

export { HOME };

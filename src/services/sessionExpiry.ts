/**
 * What happens when a request comes back 401 (the sign-in token expired or was
 * revoked) while the app is open.
 *
 * A single 401 is not trusted on its own: the session is checked once (`GET
 * /me`). Expired → the account's token is dropped and the sign-in screen asks
 * for the password again (its data stays, so signing back in picks up where it
 * left off). Access to the workspace removed → the "account lost" screen.
 * Anything else (offline, a one-off failure) → nothing.
 *
 * Only the account on screen is handled here; a background account with an
 * expired token is caught the next time it is opened.
 *
 * The check itself is handed in by the auth store (`configureSessionCheck`):
 * the API clients report here, and the auth store depends on those clients.
 */
import { activeAccountId, tokenFor } from '@/stores/accounts';

/** What a session check found. */
export type SessionVerdict = 'valid' | 'expired' | 'lost' | 'unknown';

type Check = {
  /** Asks the server about this token. */
  verify: (token: string) => Promise<SessionVerdict>;
  onExpired: () => void;
  onLost: () => void;
};

let check: Check | null = null;
export const configureSessionCheck = (c: Check) => {
  check = c;
};

let checking = false;
/** When each account was last checked: one account's check never silences another's. */
const lastCheck = new Map<string, number>();
const QUIET_MS = 15_000;

export const reportUnauthorized = (accountId: string | null | undefined) => {
  const active = activeAccountId();
  const acct = accountId ?? active;
  if (!check || !acct || acct !== active) return;
  if (checking || Date.now() - (lastCheck.get(acct) ?? 0) < QUIET_MS) return;
  const token = tokenFor(acct);
  if (!token) return;
  checking = true;
  lastCheck.set(acct, Date.now());
  const c = check;
  void c
    .verify(token)
    .then((verdict) => {
      // The answer is about `acct`: if the user switched accounts meanwhile, it must not sign out the new one.
      if (activeAccountId() !== acct) return;
      if (verdict === 'expired') c.onExpired();
      else if (verdict === 'lost') c.onLost();
    })
    .catch(() => undefined)
    .finally(() => {
      checking = false;
    });
};

/** A fetch that reports 401s, for an API client bound to one account (`null` = whichever is on screen). */
export const watchedFetch =
  (accountId: () => string | null): typeof fetch =>
  async (input, init) => {
    const res = await globalThis.fetch(input, init);
    if (res.status === 401) reportUnauthorized(accountId());
    return res;
  };

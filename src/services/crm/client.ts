/**
 * CRM clients, one per signed-in account.
 *
 * `crm()` is the active account's client; its token is resolved per request,
 * so switching account never needs it rebuilt. `crmFor(id)` is a client pinned
 * to one account, used by work that must keep using that account's token
 * even if the user switches account halfway through.
 *
 * `origin` is set explicitly: React Native's fetch sends no `origin` header,
 * and the gateway refuses the call without one off-browser.
 */
import '@/polyfills';

import { CrmApiError, CrmClient, CrmConfigError } from '@ab-ecosystem/cpaas';

import { env } from '@/config/env';
import { isWebPreview, previewClient } from '@/lib/webPreview';
import { watchedFetch } from '@/services/sessionExpiry';
import { getAuthAccessId } from '@/services/accessId';
import { activeAccountId, tokenFor, useAccountsStore } from '@/stores/accounts';

const make = (clientId: string, token: () => string, account: () => string | null): CrmClient =>
  // Local web dev only (`?preview=1`): a sample workspace instead of the network.
  isWebPreview()
    ? previewClient()
    : new CrmClient({
    gatewayUrl: env.cpassBaseUrl,
    clientId,
    origin: env.appOrigin || undefined,
    authToken: token,
    timeoutMs: 30_000,
    // An expired sign-in shows up as a 401 here first: it triggers the session check.
    fetch: watchedFetch(account),
  });

/** The Access ID an account calls CPaaS with (its project id). */
const accessOf = (accountId: string | null) => {
  const session = accountId ? useAccountsStore.getState().sessions.find((s) => s.id === accountId) : undefined;
  if (session?.accessId) return session.accessId;
  // Saved before Access IDs existed: those accounts used the app's built-in project id.
  if (session) return env.fixedAccessId || env.clientId || getAuthAccessId();
  return getAuthAccessId();
};

// The client id is fixed per CrmClient, so clients are cached per Access ID.
const activeClients = new Map<string, CrmClient>();
const pinned = new Map<string, CrmClient>();

export const crm = (): CrmClient => {
  const access = accessOf(activeAccountId());
  let c = activeClients.get(access);
  if (!c) {
    c = make(access, () => tokenFor(activeAccountId()), activeAccountId);
    activeClients.set(access, c);
  }
  return c;
};

/**
 * Client for one account. `undefined` means the active account.
 *
 * A named account always gets its own pinned client, even when it is the
 * active one: background work started for account A must keep using A's
 * token if the user switches to B halfway through.
 */
export const crmFor = (accountId?: string | null): CrmClient => {
  if (accountId === undefined || accountId === null) return crm();
  const access = accessOf(accountId);
  const key = `${accountId}|${access}`;
  let c = pinned.get(key);
  if (!c) {
    c = make(
      access,
      () => tokenFor(accountId),
      () => accountId,
    );
    pinned.set(key, c);
  }
  return c;
};

/** Drops cached clients so the next call rebuilds them (after env changes in dev). */
export const resetCrmClient = () => {
  activeClients.clear();
  pinned.clear();
};

export { CrmApiError, CrmConfigError };

/** Human-readable message for any error the CRM layer can throw. */
export const describeCrmError = (err: unknown): string => {
  if (err instanceof CrmApiError) {
    if (err.status === 402) {
      if (err.code === 'subscription_required') return 'Your workspace has no active subscription.';
      if (err.code === 'quota_exceeded') {
        const d = (err.details ?? {}) as {
          resource?: string;
          limit?: number;
          used?: number;
        };
        return `Plan limit reached for ${d.resource ?? 'this resource'} (${d.used ?? '?'}/${d.limit ?? '?'}).`;
      }
      if (err.code === 'not_included') return 'This feature is not included in your plan.';
    }
    if (err.status === 401) return 'Your session has expired. Please sign in again.';
    if (err.status === 403) return err.code === 'A403' ? 'Your role does not allow this.' : 'Not allowed on your plan.';
    if (err.status === 409) return err.message || 'That already exists.';
    if (err.status === 422) {
      const d = err.details as { fieldErrors?: Record<string, string[]> } | undefined;
      const first = d?.fieldErrors && Object.values(d.fieldErrors)[0]?.[0];
      return first ?? err.message ?? 'Some values were not accepted.';
    }
    return err.message || `Request failed (${err.status})`;
  }
  if (err instanceof CrmConfigError) return `SDK misconfigured: ${err.message}`;
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
};

export const isPlanError = (err: unknown) => err instanceof CrmApiError && err.status === 402;
export const isNotFound = (err: unknown) => err instanceof CrmApiError && err.status === 404;

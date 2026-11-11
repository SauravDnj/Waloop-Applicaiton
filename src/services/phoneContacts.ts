/**
 * Phone contacts → CRM, per account, on this device.
 *
 * - `off`: nothing is read.
 * - `manual`: the user picks contacts and syncs them.
 * - `auto`: every contact is synced when the app opens (at most every few
 *   hours) and soon after the address book changes.
 *
 * Blocked contacts are never sent, in either mode: matched by their id and by
 * every number they had when blocked, so a re-created contact stays blocked.
 * A number already sent (or already in the CRM, which answers 409) is
 * remembered and not sent again. Only names and one number per contact leave
 * the phone; the app never writes to the address book.
 */
import { Contact, ContactField, ContactsSortOrder, getPermissionsAsync, requestPermissionsAsync } from 'expo-contacts';

import { normalizePhone } from '@/lib/phone';
import { CrmApiError } from '@/services/crm/client';
import { createLead } from '@/services/crm/leads';
import { readJson, writeJson } from '@/services/storage';
import { useAccountsStore } from '@/stores/accounts';

export type SyncMode = 'off' | 'auto' | 'manual';
export type BlockedContact = { id: string; name: string; phones: string[] };
export type PhoneSyncSettings = { mode: SyncMode; blocked: BlockedContact[]; lastRunAt: number; lastAdded: number };
export type DeviceContact = { id: string; name: string; firstName: string; lastName: string; phones: string[] };

const SETTINGS = 'phoneContacts.settings';
const SYNCED = 'phoneContacts.synced';
/** Automatic sync runs at most this often (the address-book listener aside). */
export const AUTO_EVERY_MS = 6 * 3600_000;

const DEFAULTS: PhoneSyncSettings = { mode: 'off', blocked: [], lastRunAt: 0, lastAdded: 0 };

export const readSyncSettings = (acct: string): PhoneSyncSettings => ({ ...DEFAULTS, ...(readJson<Partial<PhoneSyncSettings>>(SETTINGS, acct) ?? {}) });
export const writeSyncSettings = (acct: string, patch: Partial<PhoneSyncSettings>) => {
  const next = { ...readSyncSettings(acct), ...patch };
  writeJson(SETTINGS, next, acct);
  return next;
};

/** Numbers (digits, international) already in this account's CRM from this phone. */
export const syncedNumbers = (acct: string) => new Set(readJson<string[]>(SYNCED, acct) ?? []);
const saveSynced = (acct: string, set: Set<string>) => writeJson(SYNCED, [...set], acct);

export const hasContactsPermission = async () => (await getPermissionsAsync()).granted;
export const askContactsPermission = async () => (await requestPermissionsAsync()).granted;

/** A number as the CRM stores it, or '' when it can't be one (short codes, text). */
export const crmNumber = (raw: string) => {
  const n = normalizePhone(raw);
  return n.length >= 8 ? n : '';
};

const FIELDS = [ContactField.FULL_NAME, ContactField.GIVEN_NAME, ContactField.FAMILY_NAME, ContactField.PHONES] as const;

/** Every address-book contact with at least one usable number, by name. */
export const readDeviceContacts = async (): Promise<DeviceContact[]> => {
  const out: DeviceContact[] = [];
  const PAGE = 500;
  for (let offset = 0; ; offset += PAGE) {
    const batch = await Contact.getAllDetails(FIELDS, { limit: PAGE, offset, sortOrder: ContactsSortOrder.GivenName });
    for (const c of batch) {
      const phones = [...new Set((c.phones ?? []).map((p) => crmNumber(p.number ?? '')).filter(Boolean))];
      if (!phones.length) continue;
      const name = (c.fullName || [c.givenName, c.familyName].filter(Boolean).join(' ')).trim();
      out.push({ id: c.id, name: name || `+${phones[0]}`, firstName: c.givenName ?? name, lastName: c.familyName ?? '', phones });
    }
    if (batch.length < PAGE) break;
  }
  return out;
};

export const isBlocked = (c: DeviceContact, blocked: BlockedContact[]) => blocked.some((b) => b.id === c.id || b.phones.some((p) => c.phones.includes(p)));
/** Any of its numbers: the address book doesn't keep a contact's numbers in a fixed order. */
export const isSynced = (c: DeviceContact, synced: Set<string>) => c.phones.some((p) => synced.has(p));

export type SyncResult = { added: number; existing: number; failed: number; skipped: number; error?: unknown; busy?: boolean };

/** One sync at a time (automatic and manual share it), so two never send the same numbers. */
let running = false;
export const isSyncRunning = () => running;

/**
 * Sends contacts to the account's CRM, skipping blocked and already-synced ones.
 * Stops early on an auth / plan / permission error (every next call would fail too).
 */
export const syncContacts = async (acct: string, contacts: DeviceContact[], onProgress?: (done: number, total: number) => void): Promise<SyncResult> => {
  if (running) return { added: 0, existing: 0, failed: 0, skipped: contacts.length, busy: true };
  running = true;
  try {
    return await syncNow(acct, contacts, onProgress);
  } finally {
    running = false;
  }
};

const syncNow = async (acct: string, contacts: DeviceContact[], onProgress?: (done: number, total: number) => void): Promise<SyncResult> => {
  const { blocked } = readSyncSettings(acct);
  const synced = syncedNumbers(acct);
  const todo = contacts.filter((c) => !isBlocked(c, blocked) && !isSynced(c, synced));
  const result: SyncResult = { added: 0, existing: 0, failed: 0, skipped: contacts.length - todo.length };
  for (const [i, c] of todo.entries()) {
    // Signed out meanwhile: stop (its token is gone, every call would fail).
    if (!useAccountsStore.getState().sessions.some((x) => x.id === acct)) break;
    const phone = c.phones[0];
    try {
      // Into this account's CRM, even if another account is put on screen meanwhile.
      await createLead({ firstName: c.firstName || c.name, lastName: c.lastName, phone, source: 'phone_contacts', accountId: acct });
      result.added += 1;
      synced.add(phone);
    } catch (e) {
      if (e instanceof CrmApiError && e.status === 409) {
        result.existing += 1;
        synced.add(phone);
      } else {
        result.failed += 1;
        if (e instanceof CrmApiError && [401, 402, 403].includes(e.status)) {
          result.error = e;
          break;
        }
      }
    }
    // Saved as it goes, so an interrupted run never sends the same number twice.
    if (i % 20 === 19) saveSynced(acct, synced);
    onProgress?.(i + 1, todo.length);
  }
  saveSynced(acct, synced);
  writeSyncSettings(acct, { lastRunAt: Date.now(), lastAdded: result.added });
  return result;
};

/** Blocks contacts (and their numbers) from ever being synced. */
export const blockContacts = (acct: string, contacts: DeviceContact[]) => {
  const { blocked } = readSyncSettings(acct);
  const ids = new Set(blocked.map((b) => b.id));
  return writeSyncSettings(acct, { blocked: [...blocked, ...contacts.filter((c) => !ids.has(c.id)).map((c) => ({ id: c.id, name: c.name, phones: c.phones }))] });
};

export const unblockContacts = (acct: string, ids: string[]) => {
  const drop = new Set(ids);
  return writeSyncSettings(acct, { blocked: readSyncSettings(acct).blocked.filter((b) => !drop.has(b.id)) });
};

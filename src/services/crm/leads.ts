/**
 * A contact = a CPaaS contact, read through a flat view the UI can render.
 * Custom field values are kept as they are, keyed by slug, and described by
 * the workspace's own field list (`useFields`).
 */
import type { Contact, ContactFilterEntry, ContactTag, CreateContactInput, UpdateContactInput } from '@ab-ecosystem/cpaas';

import { FILTER_TAG } from '@/lib/filters';
import { normalizePhone } from '@/lib/phone';
import { crm, crmFor } from './client';

export type Lead = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  /** Digits-only E.164 without `+`, as the platform stores it. '' when the contact has no WhatsApp identity. */
  phone: string;
  avatarUrl: string;
  agentId: string | null;
  tags: ContactTag[];
  /** Custom field values by slug (`custom_field_hash`). */
  fields: Record<string, unknown>;
  unread: number;
  createdAt: Date;
  updatedAt: Date;
  /** The raw contact, for anything the view does not surface. */
  raw: Contact;
};

export const toLead = (c: Contact): Lead => {
  const first = c.name?.first_name ?? '';
  const last = c.name?.last_name ?? '';
  const wa = c.profile?.whatsapp;
  const phone = wa?.identifier ?? '';
  const name = [first, last].filter(Boolean).join(' ').trim() || wa?.name || (phone ? `+${phone}` : 'Unnamed contact');
  return {
    id: c.id,
    name,
    firstName: first,
    lastName: last,
    phone,
    avatarUrl: wa?.profile_pic ?? '',
    agentId: c.agent ?? null,
    tags: c.tags ?? [],
    fields: (c.custom_field_hash ?? {}) as Record<string, unknown>,
    unread: c.chat_metadata?.unread ?? 0,
    createdAt: new Date(c.createdAt),
    updatedAt: new Date(c.updatedAt),
    raw: c,
  };
};

export type LeadInput = {
  firstName?: string;
  lastName?: string;
  phone?: string;
  /** Tag ids or names. */
  tags?: string[];
  /** Custom field values by slug; `''` clears one. Merged onto what the contact has. */
  fields?: Record<string, unknown>;
  /** Where a new contact came from (`lead_source.type`); `manual` when not given. */
  source?: string;
  /** The account to create it in (default: the one on screen). */
  accountId?: string;
};

export const createLead = async (input: LeadInput): Promise<Lead> => {
  const body: CreateContactInput = {
    name: { first_name: input.firstName ?? '', last_name: input.lastName ?? '' },
    lead_source: { type: input.source ?? 'manual', module: 'app' },
  };
  const fields = Object.fromEntries(Object.entries(input.fields ?? {}).filter(([, v]) => v !== '' && v != null && !(Array.isArray(v) && !v.length)));
  if (Object.keys(fields).length) body.custom_field_hash = fields;
  const phone = input.phone ? normalizePhone(input.phone) : '';
  if (phone) body.whatsapp = phone;
  if (input.tags) body.tags = input.tags;
  return toLead(await (input.accountId ? crmFor(input.accountId) : crm()).contacts.create(body));
};

/**
 * Partial update. `custom_field_hash` replaces wholesale on the server, so the
 * server's current hash is merged with the patch before sending.
 */
export const updateLead = async (lead: Lead, input: LeadInput): Promise<Lead> => {
  const body: UpdateContactInput = {};
  if (input.firstName !== undefined || input.lastName !== undefined) {
    body.name = { first_name: input.firstName ?? lead.firstName, last_name: input.lastName ?? lead.lastName };
  }
  if (input.fields && Object.keys(input.fields).length) {
    // Not the cached copy: a list row can be older than a change made elsewhere since.
    const current = (await crm().contacts.get(lead.id)).custom_field_hash;
    const merged: Record<string, unknown> = { ...(current ?? {}), ...input.fields };
    // A cleared value removes the key rather than storing '' (which a number or date field may refuse).
    for (const [k, v] of Object.entries(merged)) if (v === '' || v == null || (Array.isArray(v) && !v.length)) delete merged[k];
    body.custom_field_hash = merged;
  }
  if (input.tags) body.tags = input.tags;
  return toLead(await crm().contacts.update(lead.id, body));
};

export const getLead = async (id: string): Promise<Lead> => toLead(await crm().contacts.get(id));

/** Moves a contact to the trash (restorable). */
export const trashLead = (id: string) => crm().contacts.delete(id);

/** Contacts in the trash, newest first. The same contacts back the inbox, so its trash is this list too. */
export const listTrashed = async (page = 1, search?: string) => {
  const res = await crm().contacts.list({ status: 'trashed', page, rows: 30, search: search?.trim() || undefined });
  return { leads: res.data.map(toLead), page: res.pagination.page, pages: res.pagination.pages, total: res.pagination.total };
};

/** Takes a contact out of the trash. */
export const restoreLead = (id: string) => crm().contacts.update(id, { status: 'live' });

/** Deletes a trashed contact for good, with its notes and WhatsApp identity. Cannot be undone. */
export const deleteLeadForever = (id: string) => crm().contacts.delete(id);

/** Looks a contact up by phone through the identifier filter (one request). */
export const findLeadByPhone = async (phone: string, accountId?: string | null): Promise<Lead | null> => {
  const digits = normalizePhone(phone);
  if (!digits) return null;
  const res = await crmFor(accountId).contacts.list({
    rows: 5,
    filter: {
      type: FILTER_TAG,
      conditions: [{ operator: null, field_id: 'SYSTEM_IDENTIFIER', field_type: 'phone', condition: 'end with', value: digits.slice(-10) }],
    },
  });
  // Same full number; or the same last 10 digits when one side was saved without a
  // country code. Never just "any number ending the same" (a foreign number could match).
  const idOf = (c: (typeof res.data)[number]) => (c.profile?.whatsapp?.identifier ?? '').replace(/\D/g, '');
  const match =
    res.data.find((c) => idOf(c) === digits) ??
    res.data.find((c) => {
      const id = idOf(c);
      return (id.length <= 10 || digits.length <= 10) && id.slice(-10) === digits.slice(-10);
    });
  return match ? toLead(match) : null;
};

/** A board column: one of the field's options, not set at all, or a value that is no longer an option. */
export type BoardColumn = { kind: 'option'; value: string } | { kind: 'unset' } | { kind: 'other'; options: string[] };

const columnConditions = (slug: string, col: BoardColumn): ContactFilterEntry[] => {
  const base = { field_id: slug, field_type: 'dropdown' as const };
  if (col.kind === 'option') return [{ operator: null, ...base, condition: 'equal to', value: col.value }];
  // Never written, written empty and written null are all "not set".
  if (col.kind === 'unset')
    return [
      { operator: null, ...base, condition: 'is empty' },
      { operator: 'or', ...base, condition: 'does not exist' },
      { operator: 'or', ...base, condition: 'is null' },
    ];
  return [
    { operator: null, ...base, condition: 'is not empty' },
    ...col.options.map((value): ContactFilterEntry => ({ operator: 'and', ...base, condition: 'not equal to', value })),
  ];
};

/** Contacts in one board column, newest first. One call per column. */
export const listLeadsByField = async (slug: string, col: BoardColumn, rows = 50): Promise<{ leads: Lead[]; total: number }> => {
  const res = await crm().contacts.list({ rows, filter: { type: FILTER_TAG, conditions: columnConditions(slug, col) } });
  return { leads: res.data.map(toLead), total: res.pagination.total };
};

/** A contact's value for a field, as text ('' when unset). */
export const fieldText = (lead: Lead, slug: string): string => {
  const v = lead.fields[slug];
  return v == null ? '' : Array.isArray(v) ? v.map(String).join(', ') : String(v);
};

/**
 * A field's value as text for a message: dates and times readable, yes/no for
 * booleans, lists joined, and '' for structured values (addresses, files…).
 */
export const fieldDisplay = (lead: Lead, slug: string): string => {
  const v = lead.fields[slug];
  if (v == null) return '';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.filter((x) => x != null && typeof x !== 'object').map(String).join(', ');
  if (typeof v === 'object') return '';
  const text = String(v);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) {
    const d = new Date(text);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString();
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [y, m, day] = text.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString();
  }
  return text;
};

/** A number typed in the Inbox that matched no chat: the existing contact if it is saved after all, otherwise a new one. */
export const quickContact = async (phone: string, name: string): Promise<Lead> => {
  const existing = await findLeadByPhone(phone).catch(() => null);
  if (existing) return existing;
  const [firstName, ...rest] = name.trim().split(/\s+/);
  return createLead({ phone, firstName: firstName ?? '', lastName: rest.join(' ') });
};

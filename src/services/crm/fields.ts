/**
 * The workspace's contact fields, exactly as CPaaS has them.
 *
 * The app provisions nothing: every custom field shown, edited, filtered or
 * used as a board is one the workspace already has (or one the user adds from
 * Settings → Fields). Values live in `contact.custom_field_hash`, keyed by slug.
 */
import type { CustomField, CustomFieldType, JsonObject, UpdateCustomFieldInput } from '@ab-ecosystem/cpaas';

import { crm, crmFor } from './client';

/** Field types a user can add from the app. */
export const USER_FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'amount',
  'date',
  'timestamp',
  'email',
  'phone',
  'url',
  'checkbox',
  'dropdown',
  'multi_select',
] as const satisfies readonly CustomFieldType[];
export type UserFieldType = (typeof USER_FIELD_TYPES)[number];

/** Types that hold a list of choices in `props.options`. */
export const hasOptions = (t: CustomFieldType | undefined) => t === 'dropdown' || t === 'multi_select';

export const fieldLabel = (f: CustomField) => f.name || f.slug;

export const listAllCustomFields = async (accountId?: string | null): Promise<CustomField[]> => {
  const out: CustomField[] = [];
  let page = 1;
  for (;;) {
    const res = await crmFor(accountId).customFields.list({ page, rows: 100 });
    out.push(...res.data);
    if (page >= res.pagination.pages) break;
    page += 1;
  }
  return out;
};

/** Dropdown options as plain strings, however the field stored them. */
export const dropdownOptions = (field: CustomField | undefined): string[] => {
  const raw = (field?.props as { options?: unknown } | undefined)?.options;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((o) => (typeof o === 'string' ? o : typeof o === 'object' && o && 'value' in o ? String((o as { value: unknown }).value) : ''))
    .filter(Boolean);
};

/**
 * `props` with the options set to `values`, keeping the field's other props and,
 * for values it already had, the original option objects (their labels, colours…).
 */
export const propsWithOptions = (field: CustomField, values: string[]): JsonObject => {
  const raw = (field.props as { options?: unknown }).options;
  const existing = new Map<string, unknown>();
  if (Array.isArray(raw))
    for (const o of raw) {
      const v = typeof o === 'string' ? o : typeof o === 'object' && o && 'value' in o ? String((o as { value: unknown }).value) : '';
      if (v) existing.set(v, o);
    }
  return { ...field.props, options: values.map((value) => (existing.get(value) ?? { label: value, value }) as JsonObject) };
};

/** Boards: every dropdown field the workspace has, each option a column. */
export const boardFields = (fields: CustomField[] | undefined) => (fields ?? []).filter((f) => f.dataType === 'dropdown');

/** Slugs CPaaS refuses (contact paths, channel keys, built-in filter fields). */
const RESERVED = new Set(
  (
    'id _id __v user business name profile custom_field_hash custom_fields chat_metadata bot order last_seen last_icm_timestamp ' +
    'last_interaction_props agent team lead_source status privacy_status tags createdat updatedat waba whatsapp facebook instagram ' +
    'telegram email rcs webchat referral_id system_last_seen system_created_on system_identifier system_profile_name'
  ).split(' '),
);

/** Turns a label into a free, valid slug (`^[a-z][a-z0-9_]{0,63}$`, not reserved). */
export const fieldSlug = (name: string, taken: Iterable<string>): string => {
  let base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^[_0-9]+|_+$/g, '')
    .slice(0, 56);
  if (!base) base = 'field';
  if (RESERVED.has(base)) base = `${base}_field`;
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let i = 2; ; i += 1) if (!used.has(`${base}_${i}`)) return `${base}_${i}`;
};

export const createField = (input: { name: string; type: UserFieldType; options?: string[]; taken: Iterable<string> }) =>
  crm().customFields.create({
    slug: fieldSlug(input.name, input.taken),
    name: input.name.trim(),
    dataType: input.type,
    showInSidebar: true,
    ...(hasOptions(input.type) ? { props: { options: (input.options ?? []).map((value) => ({ label: value, value })) } } : {}),
  });

export const updateField = (slug: string, input: UpdateCustomFieldInput) => crm().customFields.update(slug, input);

/** Only the workspace's own fields can be deleted; platform (`system`) ones cannot. */
export const deleteField = (field: CustomField) => {
  if (field.type === 'system') throw new Error('Built-in fields cannot be deleted');
  return crm().customFields.delete(field.slug);
};

/** A local date/time built from its parts, or null when the parts don't make a real date (e.g. 31/02). */
const localDate = (y: number, m: number, d: number, hh = 0, mm = 0, ss = 0): Date | null => {
  const out = new Date(y, m - 1, d, hh, mm, ss);
  return out.getFullYear() === y && out.getMonth() === m - 1 && out.getDate() === d && hh < 24 && mm < 60 && ss < 60 ? out : null;
};

/**
 * A stored or typed value as a Date. Date-only and zone-less text is read as
 * local time (`new Date('2026-10-30')` would be UTC midnight, the 29th west of
 * UTC); `DD/MM/YYYY` is read day first unless only month first makes sense.
 */
const asDate = (v: unknown): Date | null => {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number') return new Date(v < 1e12 ? v * 1000 : v);
  const text = String(v).trim();
  let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) return localDate(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  m = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const [a, b] = [+m[1], +m[2]];
    const [day, month] = a > 12 || b <= 12 ? [a, b] : [b, a];
    return localDate(+m[3], month, day, +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  }
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** A stored value as display text ('' when empty). */
export const formatFieldValue = (field: CustomField | undefined, value: unknown): string => {
  if (value == null || value === '') return '';
  if (Array.isArray(value)) return value.map(String).join(', ');
  switch (field?.dataType) {
    case 'checkbox':
      return value === true || value === 'true' ? '✓' : '✗';
    case 'date': {
      const d = asDate(value);
      return d ? d.toLocaleDateString() : String(value);
    }
    case 'timestamp': {
      const d = asDate(value);
      return d ? d.toLocaleString() : String(value);
    }
    default:
      // An address or location: its parts, readable ("12 Main St, Pune").
      return typeof value === 'object'
        ? Object.values(value as Record<string, unknown>)
            .filter((x) => x != null && x !== '' && typeof x !== 'object')
            .map(String)
            .join(', ')
        : String(value);
  }
};

export { asDate as fieldDate };

const NUMERIC = new Set<CustomFieldType>(['number', 'decimal', 'amount', 'percent']);
export const isNumericField = (t: CustomFieldType | undefined) => !!t && NUMERIC.has(t);

const pad = (n: number) => String(n).padStart(2, '0');
/** `YYYY-MM-DD` in local time: what a date field holds. */
export const toDateValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * Typed or imported text as a number: currency signs, spaces and thousands
 * separators (1,250.50 · 1,00,000 · 1.234,56) are fine; anything else
 * (letters, `1.5e3`, two decimal points) is not a number.
 */
const readNumber = (text: string): number | undefined => {
  let s = text
    .trim()
    .replace(/^(rs\.?|inr|usd|eur|gbp)\s*/i, '')
    .replace(/\s*(rs\.?|inr|usd|eur|gbp)$/i, '')
    .replace(/[\s₹$€£%]/g, '');
  if (!/^-?[\d.,]+$/.test(s) || !/\d/.test(s)) return undefined;
  const comma = s.includes(',');
  const dot = s.includes('.');
  if (comma && dot) {
    // The later one is the decimal mark.
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (comma) {
    if (/^-?\d{1,3}(,\d{3})+$/.test(s) || /^-?\d{1,2}(,\d{2})*,\d{3}$/.test(s)) s = s.replace(/,/g, '');
    else if ((s.match(/,/g) ?? []).length === 1) s = s.replace(',', '.');
    else return undefined;
  } else if (dot && (s.match(/\./g) ?? []).length > 1) {
    if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    else return undefined;
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};

/** A cell from a spreadsheet as a date: text, or an Excel day serial (e.g. 45123). */
const readDate = (v: unknown): Date | null => {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const text = String(v).trim();
  if (/^\d{5}(\.\d+)?$/.test(text)) {
    const serial = Number(text);
    if (serial > 20000 && serial < 80000) {
      // Excel counts days in the sheet's own calendar: read the UTC parts back as a local date and time.
      const u = new Date(Math.round((serial - 25569) * 86400_000));
      return localDate(u.getUTCFullYear(), u.getUTCMonth() + 1, u.getUTCDate(), u.getUTCHours(), u.getUTCMinutes());
    }
  }
  return asDate(text);
};

/**
 * A typed or imported value in the shape the field's data type holds:
 * numbers as numbers, checkboxes as booleans, multi-selects as lists, dates as
 * `YYYY-MM-DD`, timestamps as ISO. `''` clears; `undefined` means unreadable.
 */
export const coerceFieldValue = (field: CustomField, raw: unknown): unknown => {
  if (raw == null || (typeof raw === 'string' && raw.trim() === '') || (Array.isArray(raw) && !raw.length)) return '';
  const type = field.dataType;
  if (isNumericField(type)) {
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined;
    return readNumber(String(raw));
  }
  if (type === 'checkbox') {
    if (typeof raw === 'boolean') return raw;
    const t = String(raw).trim().toLowerCase();
    if (['true', 'yes', 'y', '1', '✓', 'x'].includes(t)) return true;
    if (['false', 'no', 'n', '0', '✗'].includes(t)) return false;
    return undefined;
  }
  if (type === 'multi_select')
    return Array.isArray(raw)
      ? raw.map(String)
      : String(raw)
          .split(/[,;]/)
          .map((x) => x.trim())
          .filter(Boolean);
  if (type === 'date') {
    const d = readDate(raw);
    return d ? toDateValue(d) : undefined;
  }
  if (type === 'timestamp') {
    const d = readDate(raw);
    return d ? d.toISOString() : undefined;
  }
  return typeof raw === 'string' ? raw.trim() : raw;
};

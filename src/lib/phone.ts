import { AsYouType, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

/** Default region for numbers typed without a country code. Users can change it in Settings. */
let defaultCountry: CountryCode = 'IN';
export const setDefaultCountry = (code: CountryCode) => {
  defaultCountry = code;
};
export const getDefaultCountry = () => defaultCountry;

/**
 * Digits-only E.164 (no `+`), the shape the CRM stores a WhatsApp identity in.
 * Returns '' when nothing usable is left.
 *
 * Safe to run on its own output: digits that are already a full international
 * number (`14155552671`) stay as they are instead of getting the default
 * country's code in front, while a local `9876543210` still becomes
 * `919876543210`.
 */
// Parsing is slow and lists normalise the same numbers on every render: remember results.
const normalized = new Map<string, string>();
export const normalizePhone = (input: string, country: CountryCode = defaultCountry): string => {
  const cacheKey = `${country}|${input ?? ''}`;
  const hit = normalized.get(cacheKey);
  if (hit !== undefined) return hit;
  const out = normalizeUncached(input, country);
  if (normalized.size > 20_000) normalized.clear();
  normalized.set(cacheKey, out);
  return out;
};

const normalizeUncached = (input: string, country: CountryCode): string => {
  const trimmed = (input ?? '').trim();
  if (!trimmed) return '';
  const digits = trimmed.replace(/\D/g, '');
  const e164 = (n: { number: string }) => n.number.replace(/^\+/, '');
  // Written with + or 00: already international.
  if (/^(\+|00)/.test(trimmed)) {
    const intl = parsePhoneNumberFromString(`+${digits.replace(/^00/, '')}`);
    if (intl?.isPossible()) return e164(intl);
  } else {
    const local = parsePhoneNumberFromString(trimmed, country);
    const intl = parsePhoneNumberFromString(`+${digits}`);
    // 11+ digits that form a real international number already carry their
    // country code (local trunk forms start with 0 and never parse this way).
    if (digits.length >= 11 && intl?.isValid()) return e164(intl);
    if (local?.isValid()) return e164(local);
    if (intl?.isValid()) return e164(intl);
    if (local?.isPossible()) return e164(local);
  }
  if (digits.length >= 8 && digits.length <= 15) return digits;
  return '';
};

/** `+91 98765 43210` style for display. Falls back to the input. */
export const formatPhone = (input: string, country: CountryCode = defaultCountry): string => {
  if (!input) return '';
  const withPlus = /^\d{8,15}$/.test(input) ? `+${input}` : input;
  const parsed = parsePhoneNumberFromString(withPlus, country);
  return parsed ? parsed.formatInternational() : input;
};

/** Live formatting for the keypad. */
export const formatAsYouType = (input: string, country: CountryCode = defaultCountry): string => new AsYouType(country).input(input);

/** `tel:` URI for the OS dialer. */
export const telUri = (phone: string) => `tel:${/^\d+$/.test(phone) ? `+${phone}` : phone}`;

/** WhatsApp deep link, with an optional prefilled message. */
export const whatsappUri = (phone: string, text?: string) => {
  const digits = normalizePhone(phone);
  const q = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${digits}${q}`;
};

export const smsUri = (phone: string, body?: string) => `sms:${/^\d+$/.test(phone) ? `+${phone}` : phone}${body ? `?body=${encodeURIComponent(body)}` : ''}`;

/** Last ten digits — a tolerant match key for call-log ↔ lead matching. */
export const phoneKey = (phone: string) => phone.replace(/\D/g, '').slice(-10);

export const samePhone = (a: string, b: string) => {
  const ka = phoneKey(a);
  const kb = phoneKey(b);
  return !!ka && ka === kb;
};

/**
 * The number to hand to the phone app: international with a leading `+`
 * (`+919876543210`). Stored numbers have the country code but no `+`, and a
 * dialer reads `919876543210` as a local number. Numbers typed without a
 * code get the default country's. Short codes and USSD (`121`, `*123#`) are
 * passed through untouched.
 */
export const toDialable = (input: string, country: CountryCode = defaultCountry): string => {
  const raw = (input ?? '').trim();
  if (!raw || /[*#]/.test(raw)) return raw;
  const digits = normalizePhone(raw, country);
  return digits ? `+${digits}` : raw;
};

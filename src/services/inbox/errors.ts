/**
 * WhatsApp delivery errors in plain words. The provider's error arrives as
 * text, often a JSON object (`{"code":131026,"title":"Message undeliverable",…}`).
 */
export type DeliveryError = { code: number | null; title: string; details: string; raw: string };

export const parseDeliveryError = (raw: string | undefined | null): DeliveryError | null => {
  const text = (raw ?? '').trim();
  if (!text) return null;
  try {
    const j = JSON.parse(text) as { code?: number | string; title?: string; message?: string; error_data?: { details?: string } };
    const code = j.code != null && !Number.isNaN(Number(j.code)) ? Number(j.code) : null;
    return { code, title: j.title || j.message || '', details: j.error_data?.details || j.message || '', raw: text };
  } catch {
    const code = /\b(1[0-9]{5})\b/.exec(text)?.[1];
    return { code: code ? Number(code) : null, title: text, details: '', raw: text };
  }
};

/** Codes with an explanation in the locale files (`inbox.err.<code>`). */
export const KNOWN_CODES = [131026, 131047, 131049, 131050, 131051, 131052, 131053, 131056, 132000, 132001, 132005, 132007, 132012, 130472, 131031, 131042];

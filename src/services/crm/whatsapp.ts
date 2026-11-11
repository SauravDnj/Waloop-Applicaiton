/**
 * WhatsApp Business API through CPaaS: channels, templates, media and sends.
 *
 * Templates are Meta's component arrays (HEADER / BODY / FOOTER / BUTTONS).
 * This module turns them into something a form can edit and a preview can
 * draw, works out every variable slot, fills the slots from a lead, and
 * builds the send payload.
 *
 * Sends use scheduled messages: create one a minute out, then `sendNow`. That
 * is plain REST (no socket), and the same call schedules a send for later.
 */
import type { Channel, CreateTemplateInput, Template, TemplateCategory } from '@ab-ecosystem/cpaas';

import { formatPhone } from '@/lib/phone';
import { readJson, writeJson } from '@/services/storage';
import { activeAccountId, activeSession } from '@/stores/accounts';
import { useAuthStore } from '@/stores/auth';
import { uploadMedia } from '@/services/inbox/upload';
import { crm, crmFor } from './client';
import { fieldDisplay, type Lead } from './leads';

// ---------- channels ----------

export type WaChannel = { id: string; name: string; number: string; active: boolean; color: string };

const toChannel = (c: Channel): WaChannel => ({
  id: c.id,
  name: c.basic_details?.name || c.basic_details?.channel_identity || 'WhatsApp',
  number: c.basic_details?.channel_identity ?? '',
  active: c.active,
  color: c.basic_details?.color_code || '#25D366',
});

export const listWhatsAppChannels = async (): Promise<WaChannel[]> => {
  const out: WaChannel[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const res = await crm().channels.list({ type: 'whatsapp', rows: 100, page });
    out.push(...res.data.map(toChannel));
    if (page >= res.pagination.pages) break;
  }
  return out;
};

/**
 * The channel to send from: the preferred one if it still exists and is active,
 * else the first active WhatsApp channel. `null` when there is none to use.
 */
export const pickChannel = (channels: WaChannel[] | undefined, preferred: string | null | undefined): string | null => {
  const list = channels ?? [];
  const usable = (c: WaChannel) => c.active;
  if (preferred && list.some((c) => c.id === preferred && usable(c))) return preferred;
  return list.find(usable)?.id ?? null;
};

// ---------- templates: parsing ----------

export type HeaderFormat = 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
export type MediaFormat = Exclude<HeaderFormat, 'NONE' | 'TEXT'>;

export type TemplateButton =
  { type: 'QUICK_REPLY'; text: string } | { type: 'URL'; text: string; url: string; example?: string } | { type: 'PHONE_NUMBER'; text: string; phone: string };

export type ParsedTemplate = {
  header: { format: HeaderFormat; text: string; mediaUrl?: string };
  body: string;
  footer: string;
  buttons: TemplateButton[];
};

type Comp = Record<string, unknown>;
const up = (v: unknown) => String(v ?? '').toUpperCase();

export const parseTemplate = (components: Comp[] | undefined): ParsedTemplate => {
  const out: ParsedTemplate = { header: { format: 'NONE', text: '' }, body: '', footer: '', buttons: [] };
  for (const c of components ?? []) {
    const type = up(c.type);
    if (type === 'HEADER') {
      const format = up(c.format) as HeaderFormat;
      const example = c.example as { header_handle?: string[]; header_url?: string[] } | undefined;
      out.header = {
        format: ['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'].includes(format) ? format : 'NONE',
        text: String(c.text ?? ''),
        mediaUrl: example?.header_url?.[0] ?? example?.header_handle?.[0],
      };
    } else if (type === 'BODY') out.body = String(c.text ?? '');
    else if (type === 'FOOTER') out.footer = String(c.text ?? '');
    else if (type === 'BUTTONS') {
      for (const b of (c.buttons as Comp[] | undefined) ?? []) {
        const bt = up(b.type);
        if (bt === 'URL')
          out.buttons.push({ type: 'URL', text: String(b.text ?? ''), url: String(b.url ?? ''), example: (b.example as string[] | undefined)?.[0] });
        else if (bt === 'PHONE_NUMBER') out.buttons.push({ type: 'PHONE_NUMBER', text: String(b.text ?? ''), phone: String(b.phone_number ?? '') });
        else out.buttons.push({ type: 'QUICK_REPLY', text: String(b.text ?? '') });
      }
    }
  }
  return out;
};

/**
 * `{{1}}` / `{{name}}` tokens. Named ones in order of first appearance;
 * positional ones by number, because WhatsApp binds the sent parameters to
 * {{1}}, {{2}}, … in that order ("Order {{2}} for {{1}}" sends 1 first).
 */
export const variablesIn = (text: string): string[] => {
  const seen: string[] = [];
  for (const m of text.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)) if (!seen.includes(m[1])) seen.push(m[1]);
  return seen.every((n) => /^\d+$/.test(n)) ? seen.sort((a, b) => Number(a) - Number(b)) : seen;
};

/** One fillable place in a template. `key` is stable: `header:1`, `body:name`, `button:0:1`. */
export type Slot = { key: string; part: 'header' | 'body' | 'button'; name: string; buttonIndex?: number };

export const slotsOf = (t: ParsedTemplate): Slot[] => [
  ...(t.header.format === 'TEXT' ? variablesIn(t.header.text).map((name) => ({ key: `header:${name}`, part: 'header' as const, name })) : []),
  ...variablesIn(t.body).map((name) => ({ key: `body:${name}`, part: 'body' as const, name })),
  ...t.buttons.flatMap((b, i) =>
    b.type === 'URL' ? variablesIn(b.url).map((name) => ({ key: `button:${i}:${name}`, part: 'button' as const, name, buttonIndex: i })) : [],
  ),
];

export const fill = (text: string, values: (name: string) => string | undefined) =>
  text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (whole, name: string) => values(name) || whole);

// ---------- custom fields for variables ----------

export type FieldOption = { key: string; label: string };

/** Contact values a variable can take. The workspace's custom fields are appended by the caller (keyed by slug). */
export const BASE_FIELDS: FieldOption[] = [
  { key: 'name', label: 'Full name' },
  { key: 'first_name', label: 'First name' },
  { key: 'last_name', label: 'Last name' },
  { key: 'phone', label: 'Phone' },
  { key: 'my_name', label: 'My name' },
  { key: 'workspace', label: 'Workspace name' },
];

export const leadValue = (lead: Lead | null, key: string, ctx: { myName: string; workspace: string }): string => {
  if (key === 'my_name') return ctx.myName;
  if (key === 'workspace') return ctx.workspace;
  if (!lead) return '';
  switch (key) {
    case 'name':
      return lead.name;
    case 'first_name':
      return lead.firstName || lead.name.split(' ')[0] || '';
    case 'last_name':
      return lead.lastName;
    case 'phone':
      return lead.phone ? formatPhone(lead.phone) : '';
    default:
      return fieldDisplay(lead, key);
  }
};

/** Best first guess for a variable from its name (`{{name}}`, `{{city}}`, …). */
export const guessField = (name: string, fields: FieldOption[]): string | null => {
  const n = name.toLowerCase();
  const hit = fields.find((f) => f.key === n || f.label.toLowerCase() === n);
  if (hit) return hit.key;
  if (n === '1' || n.includes('name')) return n.includes('first') ? 'first_name' : 'name';
  return null;
};

// ---------- templates: API ----------

export const listTemplates = async (channelId: string, opts: { status?: Template['status']; search?: string } = {}): Promise<Template[]> => {
  const out: Template[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const res = await crm().templates.list(channelId, { page, rows: 100, ...opts });
    out.push(...res.data);
    if (page >= res.pagination.pages) break;
  }
  return out;
};

export const syncTemplates = (channelId: string) => crm().templates.sync(channelId);

// ---------- templates: on-device cache ----------

const tplKey = (channelId: string) => `wa.templates.${channelId}`;
type TemplateCache = { at: number; templates: Template[] };

/** Templates saved on this phone for a channel (active account), if any. */
export const cachedTemplates = (channelId: string): TemplateCache | null => readJson<TemplateCache>(tplKey(channelId));

const FIRST_BATCH = 300;

/**
 * Downloads a channel's templates (all statuses) and saves them on the phone,
 * for the account active when it starts (kept even if the user switches).
 * The first 300 come back at once; the rest follow page by page in the
 * background, saved and passed to `onMore` as they arrive.
 */
export const fetchAndCacheTemplates = async (channelId: string, onMore?: (all: Template[]) => void): Promise<Template[]> => {
  const acct = activeAccountId();
  const api = crmFor(acct);
  const save = (templates: Template[]) => writeJson(tplKey(channelId), { at: Date.now(), templates } satisfies TemplateCache, acct);
  const out: Template[] = [];
  let page = 1;
  let pages = 1;
  while (page <= pages && out.length < FIRST_BATCH) {
    const res = await api.templates.list(channelId, { page, rows: 100 });
    out.push(...res.data);
    pages = res.pagination.pages;
    page += 1;
  }
  save(out);
  if (page <= pages) {
    void (async () => {
      const all = [...out];
      for (; page <= pages; page += 1) {
        const res = await api.templates.list(channelId, { page, rows: 100 }).catch(() => null);
        if (!res) break;
        all.push(...res.data);
        save(all);
        onMore?.([...all]);
      }
    })();
  }
  return out;
};
export const deleteTemplate = (channelId: string, id: string) => crm().templates.delete(channelId, id);

export type TemplateDraft = {
  name: string;
  category: TemplateCategory;
  language: string;
  header: { format: HeaderFormat; text: string; sample?: string; handle?: string };
  body: string;
  /** Example value per body variable, required by Meta for review. */
  bodySamples: Record<string, string>;
  footer: string;
  buttons: TemplateButton[];
  submit: boolean;
};

/** Meta's rule: lowercase letters, digits and underscores. */
export const templateName = (label: string) =>
  label
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 512);

export const isNamedFormat = (text: string) => variablesIn(text).some((v) => !/^\d+$/.test(v));

export const buildComponents = (d: TemplateDraft): Comp[] => {
  const comps: Comp[] = [];
  const named = isNamedFormat(d.body) || isNamedFormat(d.header.text);
  if (d.header.format === 'TEXT' && d.header.text.trim()) {
    const vars = variablesIn(d.header.text);
    comps.push({
      type: 'HEADER',
      format: 'TEXT',
      text: d.header.text.trim(),
      ...(vars.length
        ? named
          ? { example: { header_text_named_params: vars.map((v) => ({ param_name: v, example: d.header.sample || v })) } }
          : { example: { header_text: [d.header.sample || 'Sample'] } }
        : {}),
    });
  } else if (d.header.format !== 'NONE' && d.header.format !== 'TEXT') {
    comps.push({ type: 'HEADER', format: d.header.format, ...(d.header.handle ? { example: { header_handle: [d.header.handle] } } : {}) });
  }
  const vars = variablesIn(d.body);
  comps.push({
    type: 'BODY',
    text: d.body.trim(),
    ...(vars.length
      ? named
        ? { example: { body_text_named_params: vars.map((v) => ({ param_name: v, example: d.bodySamples[v] || v })) } }
        : { example: { body_text: [vars.map((v) => d.bodySamples[v] || `Sample ${v}`)] } }
      : {}),
  });
  if (d.footer.trim()) comps.push({ type: 'FOOTER', text: d.footer.trim() });
  if (d.buttons.length) {
    comps.push({
      type: 'BUTTONS',
      buttons: d.buttons.map((b) =>
        b.type === 'URL'
          ? { type: 'URL', text: b.text, url: b.url, ...(variablesIn(b.url).length ? { example: [b.example || b.url.replace(/\{\{.*?\}\}/g, 'sample')] } : {}) }
          : b.type === 'PHONE_NUMBER'
            ? { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phone }
            : { type: 'QUICK_REPLY', text: b.text },
      ),
    });
  }
  return comps;
};

export const createTemplate = (channelId: string, d: TemplateDraft) => {
  const input: CreateTemplateInput = {
    name: templateName(d.name),
    category: d.category,
    language: d.language,
    components: buildComponents(d),
    parameterFormat: isNamedFormat(d.body) || isNamedFormat(d.header.text) ? 'NAMED' : 'POSITIONAL',
    applyForApproval: d.submit,
  };
  return crm().templates.create(channelId, input);
};

// ---------- media ----------

/** A file picked from the gallery or the document library. */
export type PickedFile = { uri: string; name: string; mimeType: string; size: number; file?: Blob };

const bytesOf = async (f: PickedFile): Promise<Blob> => f.file ?? (await (await fetch(f.uri)).blob());

/** Uploads a header sample to Meta for template review; returns the handle. */
export const uploadHeaderSample = async (channelId: string, f: PickedFile): Promise<string> => {
  const { data } = await crm().channels.setProp<{ h?: string }>(channelId, 'resumable_upload', { raw: await bytesOf(f), contentType: f.mimeType });
  if (!data?.h) throw new Error('Upload did not return a handle');
  return data.h;
};

const kindOf = (format: MediaFormat) => (format === 'IMAGE' ? 'image' : format === 'VIDEO' ? 'video' : 'document');

/** Uploads media for a send; returns a permanent public link. */
export const uploadSendMedia = (format: MediaFormat, f: PickedFile): Promise<string> => uploadMedia(activeAccountId(), kindOf(format), f);

// ---------- send ----------

export type SendInput = {
  channelId: string;
  contactId: string;
  template: Template;
  /** slot key → value */
  values: Record<string, string>;
  headerMedia?: { format: MediaFormat; link: string; filename?: string };
  /** Omit to send now. */
  at?: Date;
};

export const buildSendComponents = (template: Template, values: Record<string, string>, media?: SendInput['headerMedia']): Comp[] => {
  const parsed = parseTemplate(template.components);
  const named = template.parameterFormat === 'NAMED';
  const param = (slot: Slot) => ({ type: 'text', text: values[slot.key] ?? '', ...(named ? { parameter_name: slot.name } : {}) });
  const slots = slotsOf(parsed);
  const out: Comp[] = [];
  const headerSlots = slots.filter((s) => s.part === 'header');
  if (headerSlots.length) out.push({ type: 'header', parameters: headerSlots.map(param) });
  else if (media) {
    const kind = kindOf(media.format);
    out.push({
      type: 'header',
      parameters: [{ type: kind, [kind]: { link: media.link, ...(kind === 'document' && media.filename ? { filename: media.filename } : {}) } }],
    });
  }
  const bodySlots = slots.filter((s) => s.part === 'body');
  if (bodySlots.length) out.push({ type: 'body', parameters: bodySlots.map(param) });
  const byButton = new Map<number, Slot[]>();
  for (const s of slots.filter((x) => x.part === 'button')) byButton.set(s.buttonIndex!, [...(byButton.get(s.buttonIndex!) ?? []), s]);
  // URL-button variables are positional ({{1}}) even in named templates: no parameter_name there.
  for (const [index, list] of byButton)
    out.push({ type: 'button', sub_type: 'url', index: String(index), parameters: list.map((slot) => ({ type: 'text', text: values[slot.key] ?? '' })) });
  return out;
};

const timezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

/** The message body for a template send (also used for each step of a series). */
export const templateContent = (template: Template, values: Record<string, string>, media?: SendInput['headerMedia']) => ({
  type: 'template',
  template: {
    name: template.name,
    language: { code: template.language },
    components: buildSendComponents(template, values, media),
  },
  json: template,
});

/** `[[field_key]]` tokens inside a typed value: fixed text and custom fields mixed. */
export const FIELD_TOKEN = /\[\[\s*([a-zA-Z0-9_]+)\s*\]\]/g;
export const fieldToken = (key: string) => `[[${key}]]`;
export const fillTokens = (text: string, lead: Lead | null, ctx: { myName: string; workspace: string }) =>
  text.replace(FIELD_TOKEN, (_, key: string) => leadValue(lead, key, ctx));

/**
 * Typed text with its `[[field]]` tokens filled, or '' if any token has no value,
 * so "Dear [[city]] customer" never goes out as "Dear  customer": the slot counts
 * as missing instead.
 */
export const fillTokensStrict = (text: string, get: (key: string) => string): string => {
  let blank = false;
  const out = text.replace(FIELD_TOKEN, (_, key: string) => {
    const v = get(key).trim();
    if (!v) blank = true;
    return v;
  });
  return blank ? '' : out;
};

/** Slot values for a lead from a saved mapping (fields resolved now, typed text with its field tokens filled). */
export const resolveValues = (
  slots: Slot[],
  mapping: Record<string, { kind: 'field'; key: string } | { kind: 'text'; value: string }>,
  lead: Lead | null,
  ctx: { myName: string; workspace: string },
): Record<string, string> =>
  Object.fromEntries(
    slots.map((s) => {
      const m = mapping[s.key];
      return [s.key, !m ? '' : m.kind === 'text' ? fillTokensStrict(m.value, (k) => leadValue(lead, k, ctx)) : leadValue(lead, m.key, ctx)];
    }),
  );

export const timezoneName = () => timezone();

// ---------- session (non-template) messages ----------

export type SessionType = 'text' | 'image' | 'video' | 'document';
export const SESSION_TYPES: SessionType[] = ['text', 'image', 'video', 'document'];
export const sessionFormat = (t: Exclude<SessionType, 'text'>): MediaFormat => (t === 'image' ? 'IMAGE' : t === 'video' ? 'VIDEO' : 'DOCUMENT');

export type SessionMessage = {
  type: SessionType;
  /** Text body, or the caption under media. May contain `[[field]]` tokens. */
  text: string;
  media?: { link: string; filename?: string; mimeType?: string };
};

/** Values for the "my name" and "workspace" variables. */
export const senderContext = () => {
  const { profile } = useAuthStore.getState();
  return {
    myName: [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || profile?.email || '',
    workspace: activeSession()?.workspaceName ?? '',
  };
};

/**
 * The message body for a free-form send. WhatsApp only delivers these within
 * 24 hours of the lead's last message to you; CPaaS refuses to schedule one
 * outside that window.
 */
/** The `[[field]]` tokens in a text that have no value for this lead (keys, in order, once each). */
export const blankTokens = (text: string, lead: Lead | null, ctx: { myName: string; workspace: string }): string[] => [
  ...new Set([...text.matchAll(FIELD_TOKEN)].map((m) => m[1]).filter((k) => !leadValue(lead, k, ctx).trim())),
];

export const sessionContent = (
  m: { type: SessionType; text: string; media?: { link: string; filename?: string } },
  lead: Lead | null,
  ctx: { myName: string; workspace: string },
): Record<string, unknown> => {
  // Never send "Hi , your  order": a token with no value stops the send (callers check first, with labels).
  const blank = blankTokens(m.text, lead, ctx);
  if (blank.length) throw new Error(`No value for: ${blank.join(', ')}`);
  const text = fillTokens(m.text, lead, ctx).trim();
  if (m.type === 'text') return { type: 'text', text: { body: text } };
  const body: Record<string, unknown> = { link: m.media?.link ?? '' };
  if (text) body.caption = text;
  if (m.type === 'document' && m.media?.filename) body.filename = m.media.filename;
  return { type: m.type, [m.type]: body };
};

export const sendSession = async (input: {
  channelId: string;
  contactId: string;
  message: { type: SessionType; text: string; media?: { link: string; filename?: string } };
  lead: Lead | null;
  ctx: { myName: string; workspace: string };
  at?: Date;
}) => {
  const when = input.at ?? new Date(Date.now() + 2 * 60_000);
  const scheduled = await crm().scheduledMessages.create({
    title: `WhatsApp · ${input.message.type}`,
    channel: input.channelId,
    contact: { id: input.contactId },
    timezone: timezone(),
    scheduled_at: when.toISOString(),
    content: sessionContent(input.message, input.lead, input.ctx) as never,
  });
  return input.at ? scheduled : sendNowOrCancel(scheduled.id);
};

/**
 * A template's own header media link, when it can be sent again. Meta's sample
 * links (from the approval, on its CDN) are signed and expire, so those don't
 * count: the user picks a file instead.
 */
export const reusableHeaderUrl = (t: ParsedTemplate): string => {
  const url = t.header.mediaUrl ?? '';
  return /^https?:/.test(url) && !/fbcdn|fbsbx|whatsapp\.net|lookaside/i.test(url) ? url : '';
};

/**
 * Sends a just-created scheduled message now. If that fails, the row is
 * cancelled so it can't still go out at its fallback time after the user saw
 * "failed" (and maybe sent it again).
 */
const sendNowOrCancel = async (id: string) => {
  try {
    return await crm().scheduledMessages.sendNow(id);
  } catch (err) {
    await crm()
      .scheduledMessages.cancel(id)
      .catch(() => undefined);
    throw err;
  }
};

export const sendTemplate = async (input: SendInput) => {
  const content = templateContent(input.template, input.values, input.headerMedia);
  const sendNow = !input.at;
  const when = input.at ?? new Date(Date.now() + 2 * 60_000);
  const scheduled = await crm().scheduledMessages.create({
    title: `WhatsApp · ${input.template.name}`,
    channel: input.channelId,
    contact: { id: input.contactId },
    timezone: timezone(),
    scheduled_at: when.toISOString(),
    content,
  });
  return sendNow ? sendNowOrCancel(scheduled.id) : scheduled;
};

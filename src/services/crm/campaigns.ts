/**
 * WhatsApp bulk campaigns through CPaaS (API mode only).
 *
 * Creating never sends: a campaign is a draft until `trigger` (now, about a
 * minute out, cancellable) or a scheduled time. Audiences:
 *   - CRM leads (all, by filter / segment, or picked on the leads list),
 *     resolved here so each recipient gets their own variable values;
 *   - pasted numbers; - a CSV / Excel file (every column usable as a variable);
 *   - a re-target of an earlier campaign by what happened to its messages
 *     (its report rows, rebuilt as a receiver file so variables still work).
 *
 * Per-recipient values travel in the encrypted receiver file as
 * `custom_fields` (`v1`, `v2`, …) and the template parameters reference them as
 * `{{v1}}`; fixed text stays literal. `sendTest` sends the fully rendered
 * message to one lead first, so the template can be checked before launch.
 */
import type { Campaign, CampaignMessageRecord, CampaignMessageStats, CampaignRepeat, CampaignReplyBreakdown, Template } from '@ab-ecosystem/cpaas';

import { buildContactFilter, type LeadFilter } from '@/lib/filters';
import { normalizePhone } from '@/lib/phone';
import type { VariableSource } from '@/stores/whatsapp';
import { crm } from './client';
import { getLead, toLead, type Lead } from './leads';
import { buildSendComponents, FIELD_TOKEN, fillTokensStrict, leadValue, parseTemplate, sendTemplate, slotsOf, type MediaFormat, type Slot } from './whatsapp';

export type RetargetGroup = 'failed' | 'unread' | 'noReply' | 'replied' | 'all';

export type CampaignAudience =
  | { kind: 'leads'; filter: LeadFilter }
  | { kind: 'selected'; ids: string[] }
  | { kind: 'numbers'; text: string }
  | { kind: 'file'; fileName: string; headers: string[]; rows: Record<string, string>[]; column: string }
  | { kind: 'retarget'; campaignId: string; group: RetargetGroup };

export type CampaignDraft = {
  name: string;
  channelId: string;
  template: Template;
  mapping: Record<string, VariableSource>;
  headerMedia?: { format: MediaFormat; link: string; filename?: string };
  audience: CampaignAudience;
  repeat?: CampaignRepeat;
};

type Ctx = { myName: string; workspace: string };
/** A CSV row keyed by column (`col_0`, `col_1`, …). */
type Row = Record<string, string>;

/** CSV columns are offered as variable sources under `col_<index>` (token-safe). */
export const columnKey = (i: number) => `col_${i}`;
const isColumn = (k: string) => /^col_\d+$/.test(k);

const MAX_LEADS = 50_000;

/** A slot's value for one recipient (a lead and/or a CSV row). */
const valueFor = (src: VariableSource | undefined, lead: Lead | null, row: Row | null, ctx: Ctx): string => {
  if (!src) return '';
  const fromKey = (k: string) => (isColumn(k) ? (row?.[k] ?? '') : leadValue(lead, k, ctx));
  if (src.kind === 'field') return fromKey(src.key);
  // A token with no value for this recipient makes the whole slot empty (counted as incomplete), never half-filled text.
  return fillTokensStrict(src.value, fromKey);
};
/** Values that are the same for every recipient: the sender's name and the workspace name. */
const SENDER_KEYS = new Set(['my_name', 'workspace']);
/** Whether a slot's value depends on the recipient (a contact field, a file column, or text with such a token). */
const isPerRecipient = (src: VariableSource | undefined) => {
  if (!src) return false;
  if (src.kind === 'field') return !SENDER_KEYS.has(src.key);
  return [...src.value.matchAll(FIELD_TOKEN)].some((m) => !SENDER_KEYS.has(m[1]));
};

/** Slots that differ per recipient get a variable id; fixed ones stay literal. */
const planVariables = (slots: Slot[], mapping: Record<string, VariableSource>) => {
  let n = 0;
  return slots.map((s) => ({ slot: s, varId: isPerRecipient(mapping[s.key]) ? `v${(n += 1)}` : null }));
};

const templateMessage = (d: CampaignDraft, values: Record<string, string>) => ({
  type: 'template',
  template: { name: d.template.name, language: { code: d.template.language }, components: buildSendComponents(d.template, values, d.headerMedia) },
});

/** Every slot has a source (or the template has none). */
export const mappingComplete = (template: Template, mapping: Record<string, VariableSource>) => slotsOf(parseTemplate(template.components)).every((s) => !!mapping[s.key]);

/** The contacts query for a lead filter, as the leads list builds it. */
const contactQuery = (filter: LeadFilter) => {
  const { filter: f } = buildContactFilter(filter);
  return {
    search: filter.search?.trim() || undefined,
    segment: filter.segment || undefined,
    filter: f.conditions?.length ? f : undefined,
  };
};

/** Leads matching a filter or segment, up to 50,000. */
export const leadsFor = async (filter: LeadFilter, onProgress?: (n: number) => void): Promise<Lead[]> => {
  const out: Lead[] = [];
  for await (const c of crm().contacts.iterate({ rows: 100, ...contactQuery(filter) })) {
    const lead = toLead(c);
    if (lead.phone) out.push(lead);
    if (out.length % 200 === 0) onProgress?.(out.length);
    if (out.length >= MAX_LEADS) break;
  }
  return out;
};

export const countLeads = async (filter: LeadFilter): Promise<number> => {
  const res = await crm().contacts.list({ rows: 1, ...contactQuery(filter) });
  return res.pagination.total;
};

/** Leads picked on the leads list. */
const leadsByIds = async (ids: string[], onProgress?: (n: number) => void): Promise<Lead[]> => {
  const out: Lead[] = [];
  for (let i = 0; i < ids.length; i += 10) {
    const batch = await Promise.all(ids.slice(i, i + 10).map((id) => getLead(id).catch(() => null)));
    out.push(...batch.filter((l): l is Lead => !!l?.phone));
    onProgress?.(out.length);
  }
  return out;
};

/** Every slot's value for one recipient: custom fields, file columns and fixed text, mixed as mapped. */
export const valuesFor = (template: Template, mapping: Record<string, VariableSource>, lead: Lead | null, row: Row | null, ctx: Ctx) =>
  Object.fromEntries(slotsOf(parseTemplate(template.components)).map((s) => [s.key, valueFor(mapping[s.key], lead, row, ctx)]));

/** A file row keyed by column (`col_<i>`), the keys variables use. */
export const fileRow = (headers: string[], r: Record<string, string>): Row => Object.fromEntries(headers.map((h, i) => [columnKey(i), String(r[h] ?? '')]));

/**
 * Pasted numbers, one per line or separated by commas, semicolons or tabs.
 * Spaces split too, except inside one number (`+91 98765 43210`). Done here
 * rather than by the SDK so a typed `+` survives for normalizePhone.
 */
const splitNumbers = (text: string): string[] =>
  text
    .split(/[\n\r,;\t]+/)
    .flatMap((part) => (part.replace(/\D/g, '').length > 15 ? part.split(/\s+/) : [part]))
    .map((p) => p.trim())
    .filter(Boolean);

/** Recipient count for numbers and file audiences, before anything is uploaded; counted the way the send counts. */
export const previewAudience = (a: CampaignAudience): { receivers: number; skipped: number; duplicates: number } | null => {
  const raws = a.kind === 'numbers' ? splitNumbers(a.text) : a.kind === 'file' && a.column ? a.rows.map((r) => String(r[a.column] ?? '')) : null;
  if (!raws) return null;
  const seen = new Set<string>();
  let skipped = 0;
  let duplicates = 0;
  for (const raw of raws) {
    const n = normalizePhone(raw);
    if (!n) skipped += 1;
    else if (seen.has(n)) duplicates += 1;
    else seen.add(n);
  }
  return { receivers: seen.size, skipped, duplicates };
};

/** Which report rows a re-target picks: `exact` means "at that stage now" (delivered but not read, …). */
const RETARGET_QUERY: Record<RetargetGroup, { status?: CampaignMessageRecord['status']; exact?: boolean }> = {
  failed: { status: 'failed' },
  unread: { status: 'delivered', exact: true },
  noReply: { status: 'read', exact: true },
  replied: { status: 'replied' },
  all: {},
};

/** The people of an earlier campaign in one result group, with their leads (for variables). */
const retargetRecipients = async (campaignId: string, group: RetargetGroup, onProgress?: (n: number) => void) => {
  const rows: CampaignMessageRecord[] = [];
  for await (const r of crm().campaignMessages.iterate(campaignId, { rows: 100, ...RETARGET_QUERY[group] })) {
    rows.push(r);
    if (rows.length >= MAX_LEADS) break;
  }
  const ids = [...new Set(rows.map((r) => r.contactId).filter(Boolean))];
  const leads = new Map((await leadsByIds(ids, onProgress)).map((l) => [l.id, l]));
  return rows.map((r) => ({ identifier: r.identifier, lead: leads.get(r.contactId) ?? null }));
};

/** Every slot needs a fixed value when recipients carry no details (pasted numbers). */
export const needsFixedValues = (d: Pick<CampaignDraft, 'template' | 'mapping' | 'audience'>) =>
  d.audience.kind === 'numbers' && slotsOf(parseTemplate(d.template.components)).some((s) => isPerRecipient(d.mapping[s.key]));

export type CreateResult = { campaign: Campaign; receivers: number; skipped: number; duplicates: number; incomplete: number };

/**
 * Builds the audience and creates the campaign as a draft (nothing is sent).
 * Every audience, re-targets included, becomes a receiver file so each person
 * gets their own values. Someone whose value for a variable is empty is left
 * out (WhatsApp refuses empty parameters) and counted in `incomplete`.
 */
export const createCampaignDraft = async (d: CampaignDraft, ctx: Ctx, onProgress?: (n: number) => void): Promise<CreateResult> => {
  const plan = planVariables(slotsOf(parseTemplate(d.template.components)), d.mapping);
  const values: Record<string, string> = {};
  for (const { slot, varId } of plan) {
    if (varId) {
      values[slot.key] = `{{${varId}}}`;
      continue;
    }
    // Fixed for everyone (typed text, my name, workspace): WhatsApp refuses an empty parameter.
    const v = valueFor(d.mapping[slot.key], null, null, ctx).trim();
    if (!v) throw new Error('fixedEmpty');
    values[slot.key] = v;
  }
  const messages = [{ channel: { id: d.channelId }, message: templateMessage(d, values) }];
  const extra = d.repeat ? { isRepeating: true, repeat: d.repeat } : {};
  const fields = (lead: Lead | null, row: Row | null) => plan.filter((p) => p.varId).map((p) => ({ id: p.varId!, value: valueFor(d.mapping[p.slot.key], lead, row, ctx).trim() }));

  const receivers: { waba: string; custom_fields: { id: string; value: string }[] }[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  let duplicates = 0;
  let incomplete = 0;
  // Lead numbers are stored with their country code; mark them international.
  const stored = (p: string) => (/^\d{8,15}$/.test(p) ? `+${p}` : p);
  // Numbers without a country code get the default country's.
  const add = (raw: string, lead: Lead | null, row: Row | null) => {
    const waba = normalizePhone(raw);
    if (!waba) return void (skipped += 1);
    if (seen.has(waba)) return void (duplicates += 1);
    const custom = fields(lead, row);
    if (custom.some((f) => !f.value)) return void (incomplete += 1);
    seen.add(waba);
    receivers.push({ waba, custom_fields: custom });
  };

  if (d.audience.kind === 'leads') {
    for (const l of await leadsFor(d.audience.filter, onProgress)) add(stored(l.phone), l, null);
  } else if (d.audience.kind === 'selected') {
    for (const l of await leadsByIds(d.audience.ids, onProgress)) add(stored(l.phone), l, null);
  } else if (d.audience.kind === 'retarget') {
    for (const r of await retargetRecipients(d.audience.campaignId, d.audience.group, onProgress)) add(stored(r.identifier), r.lead, null);
  } else if (d.audience.kind === 'numbers') {
    if (needsFixedValues(d)) throw new Error('numbersNeedFixed');
    for (const raw of splitNumbers(d.audience.text)) add(raw, null, null);
  } else {
    const { headers, rows, column } = d.audience;
    for (const r of rows) add(String(r[column] ?? ''), null, fileRow(headers, r));
  }
  if (!receivers.length) throw new Error(incomplete ? 'allIncomplete' : 'noRecipients');
  const res = await crm().campaigns.createBulk({ name: d.name, audience: { receivers }, messages, ...extra });
  return { campaign: res.campaign, receivers: res.receivers, skipped, duplicates, incomplete };
};

/**
 * Sends the fully rendered message to one lead, through the normal
 * scheduled-message path, with that lead's own values (and the first file row
 * for column variables).
 */
export const sendTest = (d: CampaignDraft, lead: Lead, ctx: Ctx, sampleRow?: Row | null) =>
  sendTemplate({ channelId: d.channelId, contactId: lead.id, template: d.template, values: valuesFor(d.template, d.mapping, lead, sampleRow ?? null, ctx), headerMedia: d.headerMedia });

export const listCampaigns = (q: { status?: Campaign['status']; cursor?: string } = {}) => crm().campaigns.list({ limit: 30, hidden: false, ...q });
export const getCampaign = (id: string) => crm().campaigns.get(id);
export const renameCampaign = (id: string, name: string) => crm().campaigns.update(id, { name });
export const triggerCampaign = (id: string, at?: Date) => crm().campaigns.trigger(id, at ? { scheduledAt: at.toISOString() } : undefined);
export const cancelCampaign = (id: string) => crm().campaigns.cancel(id);
export const deleteCampaign = (id: string) => crm().campaigns.delete(id);
export const campaignStats = (id: string): Promise<CampaignMessageStats> => crm().campaignMessages.stats(id);
export const campaignReplies = (id: string): Promise<CampaignReplyBreakdown> => crm().campaignMessages.replies(id, { limit: 20 });
export const campaignRows = (id: string, q: { status?: CampaignMessageRecord['status']; exact?: boolean; page?: number }) => crm().campaignMessages.list(id, { rows: 50, ...q });

/** What a campaign is doing, for the UI. */
export type CampaignState = 'draft' | 'scheduled' | 'sending' | 'completed' | 'failed' | 'cancelled';
export const campaignState = (c: Campaign): CampaignState =>
  c.status === 'pending' ? (c.scheduledAt ? 'scheduled' : 'draft') : c.status === 'processing' ? 'sending' : c.status;

/** Whether a campaign has gone out (so it has a report): sending, done, or stopped/failed after starting. */
export const campaignRan = (c: Campaign): boolean => {
  const state = campaignState(c);
  return state === 'sending' || state === 'completed' || ((state === 'failed' || state === 'cancelled') && !!c.processedAt);
};

/** The 409 `channel_webhook_unset` from `trigger`. */
export const isWebhookUnset = (e: unknown) => /channel_webhook_unset/.test(String((e as { code?: string })?.code ?? (e as Error)?.message ?? ''));

/**
 * Quick replies (CPaaS "canned replies"), shared by the whole account.
 *
 * - QUICK: one text that drops into the composer or a note to edit first.
 * - CANNED: 1-10 messages (text, image, video, document with captions) sent
 *   as stored, in order, when picked in the inbox.
 *
 * Custom fields are stored as `{{first_name}}`-style placeholders, the CPaaS
 * convention, and filled in for the lead in front of the user when a reply is
 * used. The editor works with the app's `[[field]]` tokens and converts.
 */
import type { CannedReply, MessageContent } from '@ab-ecosystem/cpaas';

import type { Lead } from './leads';
import { crm } from './client';
import { leadValue } from './whatsapp';

export type QuickKind = 'QUICK' | 'CANNED';
export type QuickPart = { type: 'text' | 'image' | 'video' | 'document'; text: string; link?: string; filename?: string };
export type QuickReply = { id: string; name: string; kind: QuickKind; parts: QuickPart[]; legacy: boolean };

/** `[[first_name]]` (editor) → `{{first_name}}` (stored), and back. */
export const toStored = (text: string) => text.replace(/\[\[\s*([a-zA-Z0-9_]+)\s*\]\]/g, '{{$1}}');
export const toEditor = (text: string) => text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, '[[$1]]');

/** Fills `{{field}}` placeholders for a lead (unknown fields become empty). */
export const fillReply = (text: string, lead: Lead | null, ctx: { myName: string; workspace: string }) =>
  text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k: string) => leadValue(lead, k, ctx));

const partFrom = (content: MessageContent): QuickPart => {
  const c = content as Record<string, Record<string, string> | string>;
  const type = String(c.type);
  if (type === 'text') return { type: 'text', text: String((c.text as Record<string, string>)?.body ?? '') };
  const body = (c[type] ?? {}) as Record<string, string>;
  const kind = (['image', 'video', 'document'].includes(type) ? type : 'document') as QuickPart['type'];
  return { type: kind, text: body.caption ?? '', link: body.link ?? '', filename: body.filename };
};

const contentFrom = (p: QuickPart): MessageContent => {
  if (p.type === 'text') return { type: 'text', text: { body: p.text, preview_url: true } } as MessageContent;
  const body: Record<string, string> = { link: p.link ?? '' };
  if (p.text) body.caption = p.text;
  if (p.type === 'document' && p.filename) body.filename = p.filename;
  return { type: p.type, [p.type]: body } as MessageContent;
};

export const toQuickReply = (r: CannedReply): QuickReply => {
  const v2 = r.messages.filter((m): m is Extract<typeof m, { version: '2' }> => (m as { version?: string }).version === '2');
  return { id: r.id, name: r.name, kind: r.type as QuickKind, parts: v2.map((m) => partFrom(m.whatsapp_api)), legacy: v2.length !== r.messages.length };
};

export const listQuickReplies = async (): Promise<QuickReply[]> => {
  const out: QuickReply[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const res = await crm().cannedReplies.list({ channel: 'whatsapp', rows: 100, page });
    out.push(...res.data.map(toQuickReply));
    if (page >= res.pagination.pages) break;
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
};

export const saveQuickReply = (input: { id?: string; name: string; kind: QuickKind; parts: QuickPart[] }) => {
  const parts = input.kind === 'QUICK' ? [{ type: 'text' as const, text: input.parts[0]?.text ?? '' }] : input.parts;
  const messages = parts.map((p) => ({ version: '2' as const, whatsapp_api: contentFrom({ ...p, text: toStored(p.text) }) }));
  const body = { name: input.name.trim().replace(/^\//, ''), type: input.kind, channel: 'whatsapp' as const, messages };
  return input.id ? crm().cannedReplies.update(input.id, body) : crm().cannedReplies.create(body);
};

export const deleteQuickReply = (id: string) => crm().cannedReplies.delete(id);

/** Plain text of a reply (all text and captions), filled for a lead: what lands in a note or the composer. */
export const replyText = (r: QuickReply, lead: Lead | null, ctx: { myName: string; workspace: string }) =>
  r.parts
    .map((p) => fillReply(p.text, lead, ctx))
    .filter(Boolean)
    .join('\n');

/** The message bodies a CANNED reply sends, filled for a lead. */
export const replyContents = (r: QuickReply, lead: Lead | null, ctx: { myName: string; workspace: string }): MessageContent[] =>
  r.parts.map((p) => contentFrom({ ...p, text: fillReply(p.text, lead, ctx) }));

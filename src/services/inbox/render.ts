/**
 * Turns a message's open `content` into something a bubble can draw. Covers
 * every WhatsApp kind the provider sends (text, media, location, contacts,
 * templates, interactive buttons/lists and the replies to them, reactions);
 * anything unrecognised becomes `unknown` rather than an error.
 */
import type { Template } from '@ab-ecosystem/cpaas';

import { parseTemplate, type ParsedTemplate } from '@/services/crm/whatsapp';

type Obj = Record<string, unknown>;
const o = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});
const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

export type MediaKind = 'image' | 'video' | 'audio' | 'voice' | 'document' | 'sticker';

export type Rendered =
  | { kind: 'text'; text: string }
  | { kind: 'media'; media: MediaKind; link: string; caption: string; filename: string; mime: string }
  | { kind: 'location'; lat: number; lng: number; name: string; address: string }
  | { kind: 'contacts'; names: string[] }
  | {
      kind: 'template';
      name: string;
      parsed: ParsedTemplate | null;
      values: Record<string, string>;
      headerValues: Record<string, string>;
      /** Button index → the value sent for its URL's `{{1}}`. */
      buttonValues: Record<number, string>;
      mediaLink: string;
      /** The media header's kind and (for documents) file name, when it has one. */
      media: MediaKind | '';
      filename: string;
      fallback: string;
    }
  | { kind: 'interactive'; header: string; body: string; footer: string; buttons: string[] }
  | { kind: 'reply'; title: string; description: string; via: 'button' | 'list' | 'template' }
  | { kind: 'reaction'; emoji: string }
  | { kind: 'unknown'; type: string };

const MEDIA: MediaKind[] = ['image', 'video', 'audio', 'voice', 'document', 'sticker'];

/** Depth-first search for the first object `test` accepts (bounded; content is small). */
const findObject = (root: unknown, test: (x: Obj) => boolean, depth = 0): Obj | null => {
  if (!root || typeof root !== 'object' || depth > 5) return null;
  if (!Array.isArray(root) && test(root as Obj)) return root as Obj;
  for (const v of Object.values(root as Obj)) {
    const hit = findObject(v, test, depth + 1);
    if (hit) return hit;
  }
  return null;
};
/** The approved definition: components with text (BODY carries `text`). */
const isDefinition = (x: Obj) =>
  Array.isArray(x.components) && (x.components as Obj[]).some((k) => str(k.type).toUpperCase() === 'BODY' && typeof k.text === 'string');
/** The sent template: a name plus parameter components (or a language). */
const isSentTemplate = (x: Obj) =>
  typeof x.name === 'string' &&
  !!x.name &&
  !isDefinition(x) &&
  (x.language !== undefined || (Array.isArray(x.components) && (x.components as Obj[]).some((k) => Array.isArray(k.parameters))));

/** Parameter values by variable name: `{{1}}`, `{{2}}` positionally or `{{name}}` when named. */
const paramValues = (component: Obj | undefined): Record<string, string> => {
  const params = Array.isArray(component?.parameters) ? (component!.parameters as Obj[]) : [];
  const out: Record<string, string> = {};
  params.forEach((p, i) => {
    const value = str(p.text ?? o(p.currency).fallback_value ?? o(p.date_time).fallback_value ?? p.payload);
    out[str(p.parameter_name) || String(i + 1)] = value;
  });
  return out;
};

export const renderContent = (content: unknown, lookupTemplate?: (name: string, language: string) => Template | undefined): Rendered => {
  const c = o(content);
  const type = str(c.type);

  if (type === 'text') return { kind: 'text', text: str(o(c.text).body ?? c.text) };

  if ((MEDIA as string[]).includes(type)) {
    const m = o(c[type]);
    return { kind: 'media', media: type as MediaKind, link: str(m.link ?? m.url), caption: str(m.caption), filename: str(m.filename), mime: str(m.mime_type) };
  }

  if (type === 'location') {
    const l = o(c.location);
    return { kind: 'location', lat: Number(l.latitude), lng: Number(l.longitude), name: str(l.name), address: str(l.address) };
  }

  if (type === 'contacts') {
    const list = Array.isArray(c.contacts) ? (c.contacts as Obj[]) : [];
    return { kind: 'contacts', names: list.map((x) => str(o(x.name).formatted_name) || str(o(x.name).first_name) || '—') };
  }

  if (type === 'reaction') return { kind: 'reaction', emoji: str(o(c.reaction).emoji) };

  // A tap on a template's quick-reply button arrives as `button`.
  if (type === 'button') return { kind: 'reply', title: str(o(c.button).text ?? o(c.button).payload), description: '', via: 'template' };

  if (type === 'interactive') {
    const i = o(c.interactive);
    const it = str(i.type);
    if (it === 'button_reply') return { kind: 'reply', title: str(o(i.button_reply).title), description: '', via: 'button' };
    if (it === 'list_reply') return { kind: 'reply', title: str(o(i.list_reply).title), description: str(o(i.list_reply).description), via: 'list' };
    // Outgoing interactive message (sent by a bot or agent).
    const action = o(i.action);
    const buttons = Array.isArray(action.buttons)
      ? (action.buttons as Obj[]).map((b) => str(o(b.reply).title ?? b.title))
      : action.button
        ? [str(action.button)]
        : [];
    return { kind: 'interactive', header: str(o(i.header).text), body: str(o(i.body).text), footer: str(o(i.footer).text), buttons };
  }

  if (type === 'template') {
    // Stored rows don't all keep the template in one place (a direct send, a
    // scheduled message and a campaign differ), so look for its parts anywhere.
    const sent = findObject(c, isSentTemplate) ?? o(c.template);
    const def = findObject(c, isDefinition) ?? {};
    const tpl = sent;
    const name = str(tpl.name ?? def.name ?? (typeof c.template === 'string' ? c.template : '') ?? c.name);
    const language = str(o(tpl.language).code ?? tpl.language ?? o(def.language).code ?? def.language);
    const comps = Array.isArray(tpl.components) ? (tpl.components as Obj[]) : [];
    const find = (t: string) => comps.find((x) => str(x.type).toLowerCase() === t);
    // The approved definition travels with the message, else we look it up by name.
    const definition = Array.isArray(def.components) ? (def.components as Obj[]) : (lookupTemplate?.(name, language)?.components as Obj[] | undefined);
    const header = find('header');
    const headerParam = Array.isArray(header?.parameters) ? o((header!.parameters as Obj[])[0]) : {};
    const mediaType = str(headerParam.type);
    // Body values only: a URL button's positional {{1}} would overwrite the body's {{1}}.
    const values = paramValues(find('body'));
    const buttonValues: Record<number, string> = {};
    for (const b of comps.filter((x) => str(x.type).toLowerCase() === 'button')) {
      const v = Object.values(paramValues(b))[0];
      if (v) buttonValues[Number(b.index) || 0] = v;
    }
    return {
      kind: 'template',
      name,
      parsed: definition ? parseTemplate(definition) : null,
      values,
      headerValues: mediaType && mediaType !== 'text' ? {} : paramValues(header),
      buttonValues,
      mediaLink: mediaType && mediaType !== 'text' ? str(o(headerParam[mediaType]).link) : '',
      media: MEDIA.includes(mediaType as MediaKind) ? (mediaType as MediaKind) : '',
      filename: str(o(headerParam[mediaType]).filename),
      fallback: str(o(c.text).body ?? c.body ?? tpl.text),
    };
  }

  return { kind: 'unknown', type: type || 'message' };
};

/** A template's media header as a media item, for the viewer. */
export const templateMedia = (r: Rendered): Rendered | null =>
  r.kind === 'template' && r.mediaLink && r.media ? { kind: 'media', media: r.media, link: r.mediaLink, caption: '', filename: r.filename, mime: '' } : null;

/** Where a template's URL button goes, its `{{1}}` filled with the value sent. */
export const templateButtonUrl = (r: Extract<Rendered, { kind: 'template' }>, url: string, index: number) =>
  url.replace(/\{\{\s*[a-zA-Z0-9_]+\s*\}\}/g, r.buttonValues[index] ?? '');

/** One line for the chat list and notifications. */
export const previewText = (content: unknown): string => {
  const r = renderContent(content);
  switch (r.kind) {
    case 'text':
      return r.text;
    case 'media':
      return `${{ image: '📷', video: '🎬', audio: '🎵', voice: '🎤', document: '📄', sticker: '💟' }[r.media]} ${r.caption || r.filename || r.media}`;
    case 'location':
      return `📍 ${r.name || r.address || 'Location'}`;
    case 'contacts':
      return `👤 ${r.names.join(', ')}`;
    case 'template':
      return r.fallback || (r.parsed ? r.parsed.body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k: string) => r.values[k] ?? '') : `📋 ${r.name}`);
    case 'interactive':
      return r.body || r.header;
    case 'reply':
      return `↩ ${r.title}`;
    case 'reaction':
      return r.emoji;
    default:
      return r.type;
  }
};

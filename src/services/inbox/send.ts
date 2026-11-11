/**
 * Sending from the inbox: text, media with captions (several in a row), voice
 * notes, stickers and reactions, optionally as a reply to a message. Each send shows a bubble at
 * once (local file preview while it uploads) that the stored row replaces.
 */
import type { Chat, Message } from '@ab-ecosystem/cpaas';

import { describeCrmError } from '@/services/crm/client';
import { senderContext, sendSession } from '@/services/crm/whatsapp';
import { whatsAppConfig } from '@/stores/whatsapp';
import { addPending, failPending, inboxFor, setPendingLink, notePendingDraft } from './manager';
import type { Prepared, SendKind } from './media';
import { rememberSticker } from './stickers';
import { uploadMedia, type UploadSource } from './upload';
import { inboxOf } from './store';

let seq = 0;
const localId = () => `local-${Date.now().toString(36)}-${(seq += 1)}`;

export const identifierOf = (chat: Chat) => chat.profile?.whatsapp?.identifier ?? Object.values(chat.profile ?? {})[0]?.identifier ?? '';

/** The channel the conversation is on: the latest message's, else the default. */
export const channelFor = (acct: string, chatId: string) => {
  const thread = inboxOf(acct).threads[chatId] ?? [];
  for (let i = thread.length - 1; i >= 0; i -= 1) if (thread[i].channel) return thread[i].channel;
  return whatsAppConfig().channelId ?? '';
};

const placeholder = (chat: Chat, channel: string, content: Message['content'], replyTo?: Message): Message =>
  ({
    id: localId(),
    contact: chat.id,
    channel,
    content,
    context: replyTo ? { message_id: replyTo.message_id } : {},
    identifier: identifierOf(chat),
    message_id: '',
    status: 'sent',
    timestamp: Math.floor(Date.now() / 1000),
    direction: 'outbound',
    source: 'agent',
  }) as unknown as Message;

const ctx = (replyTo?: Message) => (replyTo?.message_id ? { message_id: replyTo.message_id } : undefined);

export const sendText = async (acct: string, chat: Chat, channel: string, text: string, replyTo?: Message) => {
  const inbox = inboxFor(acct);
  if (!inbox) throw new Error('Inbox is not connected');
  const content = { type: 'text', text: { body: text } } as Message['content'];
  const local = placeholder(chat, channel, content, replyTo);
  addPending(acct, chat.id, local);
  try {
    // The stored row takes its bubble's place (the live echo may have done it already).
    notePendingDraft(
      acct,
      chat.id,
      local.id,
      await inbox.messages.send({ channel, contact: { id: chat.id, identifier: identifierOf(chat) }, content, context: ctx(replyTo) }),
    );
  } catch (e) {
    failPending(acct, chat.id, local.id, describeCrmError(e));
  }
};

// Exact size and native transfer on phones: see `uploadMedia`.
const upload = (acct: string, kind: SendKind | 'sticker', f: UploadSource) => uploadMedia(acct, kind, f);

export const sendFile = async (acct: string, chat: Chat, channel: string, f: Prepared, replyTo?: Message, kindOverride?: 'voice' | 'audio') => {
  const inbox = inboxFor(acct);
  if (!inbox) throw new Error('Inbox is not connected');
  const kind = kindOverride ?? f.kind;
  const body: Record<string, unknown> = { link: f.uri };
  if (f.caption && kind !== 'audio' && kind !== 'voice') body.caption = f.caption;
  if (kind === 'document') body.filename = f.name;
  const local = placeholder(chat, channel, { type: kind, [kind]: body } as Message['content'], replyTo);
  addPending(acct, chat.id, local);
  try {
    const link = await upload(acct, f.kind, f);
    // From now on only the row with this link is this bubble's (several can be in flight).
    setPendingLink(acct, chat.id, local.id, link);
    const row = await inbox.messages.sendMedia({
      channel,
      contact: { id: chat.id, identifier: identifierOf(chat) },
      kind: kind === 'voice' ? 'audio' : kind,
      link,
      caption: kind === 'audio' || kind === 'voice' ? undefined : f.caption || undefined,
      filename: kind === 'document' ? f.name : undefined,
      context: ctx(replyTo),
    });
    notePendingDraft(acct, chat.id, local.id, row);
  } catch (e) {
    failPending(acct, chat.id, local.id, describeCrmError(e));
  }
};

/**
 * A sticker (WebP, 512×512, at most 100 KB): from the phone (`file`, uploaded first) or one
 * already sent or received (`link`, sent again as is). It takes no caption and no reply.
 */
export const sendSticker = async (acct: string, chat: Chat, channel: string, from: { link: string } | { file: UploadSource }) => {
  const inbox = inboxFor(acct);
  if (!inbox) throw new Error('Inbox is not connected');
  const shown = 'link' in from ? from.link : from.file.uri;
  const local = placeholder(chat, channel, { type: 'sticker', sticker: { link: shown } } as Message['content']);
  addPending(acct, chat.id, 'link' in from ? { ...local, sentLink: from.link } : local);
  try {
    const link = 'link' in from ? from.link : await upload(acct, 'sticker', from.file);
    if (!('link' in from)) setPendingLink(acct, chat.id, local.id, link);
    rememberSticker(acct, link);
    notePendingDraft(
      acct,
      chat.id,
      local.id,
      await inbox.messages.sendMedia({ channel, contact: { id: chat.id, identifier: identifierOf(chat) }, kind: 'sticker', link }),
    );
  } catch (e) {
    failPending(acct, chat.id, local.id, describeCrmError(e));
  }
};

/**
 * Reacts to a message with an emoji, or takes the reaction back (`emoji` ''). Goes over the
 * message's own channel. Throws when it fails, since a reaction has no bubble to show that.
 */
export const sendReaction = async (acct: string, chat: Chat, channel: string, target: Message, emoji: string) => {
  const inbox = inboxFor(acct);
  if (!inbox) throw new Error('Inbox is not connected');
  const content = { type: 'reaction', reaction: { message_id: target.message_id, emoji } } as Message['content'];
  const via = target.channel || channel;
  const local = placeholder(chat, via, content);
  addPending(acct, chat.id, local);
  try {
    notePendingDraft(acct, chat.id, local.id, await inbox.messages.send({ channel: via, contact: { id: chat.id, identifier: identifierOf(chat) }, content }));
  } catch (e) {
    failPending(acct, chat.id, local.id, describeCrmError(e));
    throw e;
  }
};

/** Sends several files one after another, keeping their order in the thread. */
export const sendFiles = async (acct: string, chat: Chat, channel: string, files: Prepared[], replyTo?: Message) => {
  for (const [i, f] of files.entries()) await sendFile(acct, chat, channel, f, i === 0 ? replyTo : undefined);
};

/** A recorded voice note (AAC in MP4, which WhatsApp accepts as audio). */
export const sendVoice = (acct: string, chat: Chat, channel: string, uri: string, replyTo?: Message) =>
  sendFile(acct, chat, channel, { uri, name: `voice-${Date.now()}.m4a`, mimeType: 'audio/mp4', size: 0, kind: 'audio', caption: '' }, replyTo, 'audio');

/**
 * Schedules a session (non-template) message for later through CPaaS
 * scheduled messages. Files are uploaded now; WhatsApp still only delivers it
 * if the lead's 24-hour window is open at the scheduled time, and CPaaS
 * refuses a schedule that is sure to fall outside it.
 */
export const scheduleSession = async (acct: string, chat: Chat, channel: string, at: Date, text: string, files: Prepared[] = []) => {
  const ctxValues = senderContext();
  if (!files.length) {
    await sendSession({ channelId: channel, contactId: chat.id, message: { type: 'text', text }, lead: null, ctx: ctxValues, at });
    return 1;
  }
  for (const f of files) {
    const link = await upload(acct, f.kind, f);
    await sendSession({
      channelId: channel,
      contactId: chat.id,
      message: { type: f.kind === 'audio' ? 'document' : f.kind, text: f.caption, media: { link, filename: f.name } },
      lead: null,
      ctx: ctxValues,
      at,
    });
  }
  return files.length;
};

/** Sends several ready message bodies in order (a CANNED quick reply). */
export const sendContents = async (acct: string, chat: Chat, channel: string, contents: Message['content'][]) => {
  const inbox = inboxFor(acct);
  if (!inbox) throw new Error('Inbox is not connected');
  for (const content of contents) {
    const local = placeholder(chat, channel, content);
    addPending(acct, chat.id, local);
    try {
      notePendingDraft(acct, chat.id, local.id, await inbox.messages.send({ channel, contact: { id: chat.id, identifier: identifierOf(chat) }, content }));
    } catch (e) {
      failPending(acct, chat.id, local.id, describeCrmError(e));
    }
  }
};

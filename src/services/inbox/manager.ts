/**
 * Socket connections to the CPaaS live inbox, one per signed-in account that
 * sends WhatsApp through the API. They live outside React: switching the
 * account on screen does not touch them, so every account keeps receiving
 * messages (and a notification) while the app is running.
 *
 * Tokens are resolved per connect, so a reconnect after a token refresh uses
 * the new one. Sockets close when an account signs out or goes back to
 * phone-WhatsApp mode.
 */
import type { Chat, ChatListFilter, ContactFilterEntry, Message } from '@ab-ecosystem/cpaas';
import { Inbox } from '@ab-ecosystem/cpaas/realtime';
import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';

import { env } from '@/config/env';
import { crmFor } from '@/services/crm/client';
import { MESSAGE_CHANNEL } from '@/services/notifications';
import { isWebPreview, previewInbox } from '@/lib/webPreview';
import { activeAccountId, tokenFor, useAccountsStore } from '@/stores/accounts';
import { restoreInbox } from './cache';
import { inboxOf, useInboxStore, type ChatMessage } from './store';
import { i18next } from '@/i18n';
import { hasPin } from '@/stores/appLock';
import { findBubble, isEchoOf, keepKeys, takeOver } from './echo';
import { reactionOf } from './reactions';
import { previewText } from './render';
import { normalizePhone } from '@/lib/phone';

const sockets = new Map<string, { inbox: Inbox; offs: (() => void)[] }>();

const patch = useInboxStore.getState().patch;

const byLastSeen = (a: Chat, b: Chat) => (b.last_seen ?? 0) - (a.last_seen ?? 0);

/**
 * Puts a chat at its place in the list. `custom_field_hash` comes on list rows
 * only: a single read (`chats.get`, which opening a chat does) or a pushed
 * `chat.action` leaves it out, so the row keeps the one it had, or its field
 * pills (status, priority…) would vanish the moment the chat is opened.
 */
const upsertChat = (acct: string, chat: Chat) =>
  patch(acct, (a) => {
    const had = a.chats.find((c) => c.id === chat.id);
    const next = chat.custom_field_hash === undefined && had?.custom_field_hash ? { ...chat, custom_field_hash: had.custom_field_hash } : chat;
    return { chats: [next, ...a.chats.filter((c) => c.id !== chat.id)].sort(byLastSeen) };
  });

const removeChat = (acct: string, id: string) => patch(acct, (a) => ({ chats: a.chats.filter((c) => c.id !== id) }));

const isOutbound = (m: Message) => m.direction === 'outbound' || m.status !== 'received';

/**
 * Whether a stored row is the one an optimistic bubble stands for. The stored
 * row carries no link to the send, so: sent by an agent (not a campaign, bot or
 * API), same kind, and for text the same words.
 */
const fromAgentRow = (m: Message) => isOutbound(m) && !String(m.id).startsWith('local-');
const fromAgent = (m: Message) => isOutbound(m) && !m.sent_by_campaign && !m.sent_by_bot && !m.sent_by_api;
/** Adds a stored row; one that stands for an optimistic bubble takes its place (no flicker, no jump). */
const addMessage = (acct: string, m: Message) =>
  patch(acct, (a) => {
    const list = a.threads[m.contact] ?? [];
    if (list.some((x) => x.id === m.id || (x.message_id && x.message_id === m.message_id && !x.pending))) return {};
    if (fromAgent(m)) {
      const i = findBubble(list, m);
      if (i >= 0) return { threads: { ...a.threads, [m.contact]: list.map((x, j) => (j === i ? takeOver(x, m) : x)) } };
    }
    return { threads: { ...a.threads, [m.contact]: [...list, m] } };
  });

/** A message's line in the chat list and its alert; a reaction says what it is. */
const previewOf = (m: Message) => {
  const r = reactionOf(m);
  return r ? `${r.emoji} ${i18next.t('inbox.reactedToMessage')}` : previewText(m.content);
};
/** A reaction taken back: nothing new to show or count. */
const isUnreaction = (m: Message) => reactionOf(m)?.emoji === '';

const notifyIncoming = async (acct: string, m: Message) => {
  if (isOutbound(m) || isUnreaction(m)) return;
  const a = inboxOf(acct);
  const viewing = AppState.currentState === 'active' && activeAccountId() === acct && a.openChat === m.contact;
  if (viewing || Platform.OS === 'web') return;
  const chat = a.chats.find((c) => c.id === m.contact);
  const name = chat ? [chat.name?.first_name, chat.name?.last_name].filter(Boolean).join(' ') || chat.profile?.whatsapp?.identifier : 'WhatsApp';
  const workspace = useAccountsStore.getState().sessions.find((s) => s.id === acct)?.workspaceName;
  // A PIN-locked account's alerts say only that a message came: no sender, no text.
  const hidden = hasPin(acct);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: hidden ? workspace || 'Inbox And Campaigns' : name || 'WhatsApp',
      subtitle: !hidden && useAccountsStore.getState().sessions.length > 1 ? workspace : undefined,
      body: hidden ? i18next.t('lock.hiddenMessage') : previewOf(m),
      data: { url: `inboxcampaign://chat/${m.contact}`, accountId: acct },
    },
    // Right away, on the high-importance "WhatsApp messages" channel (null would use Android's default one).
    trigger: Platform.OS === 'android' ? { channelId: MESSAGE_CHANNEL } : null,
  }).catch(() => undefined);
};

const wire = (acct: string, inbox: Inbox) => [
  inbox.on('message.received', (m) => {
    addMessage(acct, m);
    void notifyIncoming(acct, m);
    // Read on screen: tell the server too, or the chat comes back unread for everyone.
    if (!isOutbound(m) && inboxOf(acct).openChat === m.contact && AppState.currentState === 'active')
      void inbox.chats.markAsRead(m.contact).catch(() => undefined);
    // Bump the chat row: preview, time, unread.
    if (isUnreaction(m)) return;
    // A chat not loaded yet (older than the first page): fetch it so it moves to the top.
    if (!inboxOf(acct).chats.some((c) => c.id === m.contact)) {
      void inbox.chats
        .get(m.contact)
        .then((c) => c && upsertChat(acct, c))
        .catch(() => undefined);
      return;
    }
    patch(acct, (a) => {
      const chat = a.chats.find((c) => c.id === m.contact);
      if (!chat) return {};
      const unread = !isOutbound(m) && a.openChat !== m.contact ? (chat.chat_metadata?.unread ?? 0) + 1 : (chat.chat_metadata?.unread ?? 0);
      const next: Chat = {
        ...chat,
        last_seen: isOutbound(m) ? chat.last_seen : m.timestamp,
        last_interaction_props: { ...(chat.last_interaction_props ?? {}), preview: previewOf(m), at: m.timestamp, direction: m.direction },
        chat_metadata: { ...chat.chat_metadata, unread },
      };
      return { chats: [next, ...a.chats.filter((c) => c.id !== chat.id)] };
    });
  }),
  inbox.on('message.status', (u) =>
    patch(acct, (a) => {
      const threads = { ...a.threads };
      for (const [cid, list] of Object.entries(threads)) {
        if (list.some((x) => x.message_id === u.message_id)) {
          threads[cid] = list.map((x) => (x.message_id === u.message_id ? { ...x, status: u.status, error: (u.error as string) ?? x.error } : x));
        }
      }
      return { threads };
    }),
  ),
  inbox.on('chat.action', (r) => (r.chat ? upsertChat(acct, r.chat) : removeChat(acct, r.id))),
  // A brand-new contact: the push is the stored document (`_id`), not a Chat — fetch the Chat.
  inbox.on('contact.received', (c) => {
    const doc = c as unknown as { _id?: string; id?: string };
    const id = doc._id ?? doc.id;
    if (id)
      void inbox.chats
        .get(String(id))
        .then((chat) => chat && upsertChat(acct, chat))
        .catch(() => undefined);
  }),
  inbox.on('message.delete', (r) =>
    patch(acct, (a) => {
      const threads = { ...a.threads };
      for (const cid of Object.keys(threads)) threads[cid] = threads[cid].filter((x) => x.id !== r.id && x.message_id !== r.id);
      return { threads };
    }),
  ),
  inbox.on('message.retry_download', (m) =>
    patch(acct, (a) => ({ threads: { ...a.threads, [m.contact]: (a.threads[m.contact] ?? []).map((x) => (x.id === m.id ? keepKeys(x, m) : x)) } })),
  ),
];

/** Opens (or returns) the socket for one account. */
export const connectInbox = (acct: string): Inbox | null => {
  const existing = sockets.get(acct);
  if (existing) return existing.inbox;
  // Local web dev only: sample chats instead of a socket.
  if (isWebPreview()) {
    if (!inboxOf(acct).loaded) {
      const { chats, threads } = previewInbox();
      patch(acct, () => ({ state: 'connected', loaded: true, chats: chats as never, threads: threads as never, nextPage: null }));
    }
    return null;
  }
  // The chats saved on the phone show at once (and with no internet); the socket then refreshes them.
  restoreInbox(acct);
  const session = useAccountsStore.getState().sessions.find((s) => s.id === acct);
  if (!session || !env.inboxUrl) return null;
  const api = crmFor(acct);
  const inbox = new Inbox({
    url: env.inboxUrl,
    clientId: session.accessId,
    token: () => tokenFor(acct),
    // React Native has no long-polling XHR quirks to rely on: go straight to websockets.
    socketOptions: { transports: ['websocket'], reconnection: true, reconnectionDelayMax: 10_000 },
    uploadMedia: (file, options) => api.inboxMedia.upload(file as never, options as never),
  });
  patch(acct, () => ({ state: 'connecting', error: undefined }));
  const offs = wire(acct, inbox);
  inbox.raw.on('connect', () => {
    patch(acct, () => ({ state: 'connected', error: undefined }));
    void loadChats(acct, true);
    // Thread subscriptions don't survive a reconnect: reload the open chat, which also
    // resubscribes it and brings in what arrived while disconnected.
    const open = inboxOf(acct).openChat;
    if (open) void loadThread(acct, open).catch(() => undefined);
  });
  inbox.raw.on('disconnect', () => patch(acct, () => ({ state: 'connecting' })));
  inbox.raw.on('connect_error', (e: Error) => patch(acct, () => ({ state: 'error', error: e.message })));
  sockets.set(acct, { inbox, offs });
  return inbox;
};

export const disconnectInbox = (acct: string) => {
  const s = sockets.get(acct);
  if (!s) return;
  s.offs.forEach((off) => off());
  s.inbox.disconnect();
  sockets.delete(acct);
  useInboxStore.getState().drop(acct);
};

/** The account's live inbox; none for an account that is not signed in (no token). */
export const inboxFor = (acct: string | null | undefined) => (acct && tokenFor(acct) ? (sockets.get(acct)?.inbox ?? connectInbox(acct)) : null);

/** Keeps exactly the signed-in accounts connected. Call on sign-in and whenever accounts change. */
export const syncInboxConnections = () => {
  const { sessions } = useAccountsStore.getState();
  const want = new Set(sessions.filter((s) => tokenFor(s.id)).map((s) => s.id));
  for (const acct of [...sockets.keys()]) if (!want.has(acct)) disconnectInbox(acct);
  for (const acct of want) connectInbox(acct);
};

export const loadChats = async (acct: string, reset = false, attempt = 0) => {
  const inbox = inboxFor(acct);
  if (!inbox) return;
  const a = inboxOf(acct);
  if (!reset && a.nextPage === null && a.loaded) return;
  try {
    const page = await inbox.chats.list({ limit: 30, nextPage: reset ? undefined : (a.nextPage ?? undefined) });
    patch(acct, (cur) => ({
      loaded: true,
      nextPage: page.nextPage,
      chats: reset ? page.contacts : [...cur.chats, ...page.contacts.filter((c) => !cur.chats.some((x) => x.id === c.id))],
    }));
  } catch (e) {
    patch(acct, () => ({ loaded: true, error: e instanceof Error ? e.message : String(e) }));
    // The first page failed (a saved list may be showing): try once more, so paging isn't left stuck.
    if (reset && attempt < 1) setTimeout(() => void loadChats(acct, true, attempt + 1), 5000);
  }
};

/**
 * A search that looks like a phone number, however it was typed: "09054658623", "9054658623" or
 * "+91 90546 58623" all give the full number with the default country code and its local part.
 */
export const phoneQuery = (q: string): { intl: string; local: string } | null => {
  const digits = q.replace(/\D/g, '');
  if (digits.length < 6 || /[a-z]/i.test(q)) return null;
  const intl = normalizePhone(q) || digits.replace(/^0+/, '');
  return { intl, local: intl.slice(-10) };
};

export const searchChats = async (acct: string, search: string): Promise<Chat[]> => {
  const inbox = inboxFor(acct);
  if (!inbox) return [];
  const phone = phoneQuery(search);
  // Numbers: search the full number and its local part (saved either way), then merge.
  const queries = phone ? [...new Set([phone.intl, phone.local])] : [search];
  const pages = await Promise.all(queries.map((q) => inbox.chats.list({ limit: 30, search: q }).catch(() => ({ contacts: [] as Chat[] }))));
  const seen = new Set<string>();
  return pages.flatMap((p) => p.contacts).filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
};

/** Loads (older) history for a thread; also subscribes the socket to it. */
export const loadThread = async (acct: string, chatId: string, older = false) => {
  const inbox = inboxFor(acct);
  if (!inbox) return;
  const a = inboxOf(acct);
  const list = a.threads[chatId] ?? [];
  if (older && (a.threadDone[chatId] || !list.length)) return;
  // Page from the oldest stored row (never an optimistic bubble's local id).
  const oldest = list.find((x) => !x.pending && !String(x.id).startsWith('local-'));
  if (older && !oldest) return;
  const page = await inbox.messages.list(chatId, { limit: 40, last_message_id: older ? oldest?.id : undefined });
  patch(acct, (cur) => {
    const have = cur.threads[chatId] ?? [];
    const fresh = page.filter((m) => !have.some((x) => x.id === m.id));
    // Each bubble whose stored row is now in the page is done, one row per bubble: only a new
    // row (not one already on screen), sent from here, no earlier than the bubble.
    const haveIds = new Set(have.map((x) => x.id));
    const echoes = page.filter((m) => !haveIds.has(m.id) && fromAgent(m));
    const pairs = new Map<string, ChatMessage>();
    let open = have.filter((b) => b.pending);
    for (const e of echoes) {
      const i = findBubble(
        open.filter((x) => e.timestamp >= x.timestamp - 60),
        e,
      );
      if (i < 0) continue;
      const bubble = open.filter((x) => e.timestamp >= x.timestamp - 60)[i];
      pairs.set(e.id, bubble);
      open = open.filter((x) => x !== bubble);
    }
    const finished = new Set(pairs.values());
    // The rest stay, after the history. Failed local bubbles stay too, so unsent text is never silently lost.
    const pending = have.filter((x) => (x.pending && !finished.has(x)) || (!x.pending && String(x.id).startsWith('local-')));
    // Rows already on screen keep their list key and local file; a row for a finished bubble takes its key.
    const held = new Map(have.map((x) => [x.id, x]));
    const keyed = (m: Message): ChatMessage => {
      const h = held.get(m.id);
      if (h) return keepKeys(h, m);
      const bubble = pairs.get(m.id);
      return bubble ? takeOver(bubble, m) : m;
    };
    return {
      threads: {
        ...cur.threads,
        [chatId]: older ? [...fresh, ...have] : [...page.filter((m, i, arr) => arr.findIndex((y) => y.id === m.id) === i).map(keyed), ...pending],
      },
      threadDone: { ...cur.threadDone, [chatId]: page.length < 40 },
    };
  });
};

export const openChat = async (acct: string, chatId: string) => {
  patch(acct, () => ({ openChat: chatId }));
  const inbox = inboxFor(acct);
  if (!inbox) return null;
  const chat = await inbox.chats.get(chatId).catch(() => null);
  if (chat) upsertChat(acct, chat);
  const c = inboxOf(acct).chats.find((x) => x.id === chatId);
  if (c && ((c.chat_metadata?.unread ?? 0) > 0 || c.chat_metadata?.marked_as_unread)) {
    void inbox.chats.markAsRead(chatId).catch(() => undefined);
    upsertChat(acct, { ...c, chat_metadata: { ...c.chat_metadata, unread: 0, marked_as_unread: false } });
  }
  return chat;
};

/** Leaves a chat (only if it is still the open one: a chat stacked on top must not clear the one below). */
export const closeChat = (acct: string, chatId?: string) => patch(acct, (a) => (!chatId || a.openChat === chatId ? { openChat: null } : {}));

/** Puts an optimistic bubble on screen until the stored row arrives. */
/** Notes the link a media bubble's file was uploaded to, so only its own row replaces it. */
export const setPendingLink = (acct: string, chatId: string, id: string, link: string) =>
  patch(acct, (a) => ({ threads: { ...a.threads, [chatId]: (a.threads[chatId] ?? []).map((x) => (x.id === id ? { ...x, sentLink: link } : x)) } }));

/**
 * The send call answered with its draft (not yet the stored row, which comes as a live
 * update): the bubble notes the draft's ids, so that row finds it. If the row got here first
 * and was drawn on its own, it moves into the bubble's place instead.
 */
export const notePendingDraft = (acct: string, chatId: string, id: string, draft: Message) =>
  patch(acct, (a) => {
    const list = a.threads[chatId] ?? [];
    const bubble = list.find((x) => x.id === id && x.pending);
    if (!bubble) return {};
    const noted = { ...bubble, draftId: draft.id, queueId: draft.message_id || undefined };
    const early = list.find((x) => !x.pending && fromAgentRow(x) && isEchoOf(noted, x) && x.timestamp >= bubble.timestamp - 60);
    const next = early
      ? list.filter((x) => x !== early).map((x) => (x === bubble ? takeOver(bubble, early) : x))
      : list.map((x) => (x === bubble ? noted : x));
    return { threads: { ...a.threads, [chatId]: next } };
  });

export const addPending = (acct: string, chatId: string, echo: Message | ChatMessage) =>
  patch(acct, (a) => ({ threads: { ...a.threads, [chatId]: [...(a.threads[chatId] ?? []), { ...echo, pending: true }] } }));

export const failPending = (acct: string, chatId: string, id: string, reason: string) =>
  patch(acct, (a) => ({
    threads: {
      ...a.threads,
      [chatId]: (a.threads[chatId] ?? []).map((x) => (x.id === id ? { ...x, pending: false, status: 'failed', failedText: reason } : x)),
    },
  }));

/** Reconnects any account's socket that dropped (network back, app reopened, or the user tapped Reconnect). */
export const reconnectInboxes = () => {
  syncInboxConnections();
  for (const [acct, s] of sockets) {
    if (!s.inbox.connected) {
      patch(acct, () => ({ state: 'connecting', error: undefined }));
      s.inbox.connect();
    }
  }
};

export type ChatAction = 'archive' | 'unarchive' | 'markRead' | 'markUnread' | 'block' | 'unblock' | 'close' | 'delete';

/**
 * One chat action, for the account it was started in. The list updates right
 * away; the server's `chat.action` broadcast then confirms (or corrects) it.
 */
export const chatAction = async (acct: string, chat: Chat, action: ChatAction) => {
  const inbox = inboxFor(acct);
  if (!inbox) throw new Error('Inbox is not connected');
  const meta = chat.chat_metadata ?? ({} as Chat['chat_metadata']);
  const blocked = { incoming: action === 'block', outgoing: action === 'block' };
  const optimistic: Partial<Chat['chat_metadata']> | null =
    action === 'archive'
      ? { archived: true }
      : action === 'unarchive'
        ? { archived: false }
        : action === 'markRead'
          ? { unread: 0, marked_as_unread: false }
          : action === 'markUnread'
            ? { marked_as_unread: true }
            : action === 'block' || action === 'unblock'
              ? { blocked: { ...meta.blocked, ...blocked } }
              : action === 'close'
                ? { closed: true }
                : null;
  if (action === 'delete') removeChat(acct, chat.id);
  else if (optimistic) upsertChat(acct, { ...chat, chat_metadata: { ...meta, ...optimistic } });
  try {
    if (action === 'archive') await inbox.chats.archive(chat.id);
    else if (action === 'unarchive') await inbox.chats.unarchive(chat.id);
    else if (action === 'markRead') await inbox.chats.markAsRead(chat.id);
    else if (action === 'markUnread') await inbox.chats.markAsUnread(chat.id);
    else if (action === 'block' || action === 'unblock') await inbox.chats.block(chat.id, blocked);
    else if (action === 'close') await inbox.chats.close(chat.id);
    else await inbox.chats.delete(chat.id);
  } catch (e) {
    // Put the row back as it was.
    upsertChat(acct, chat);
    throw e;
  }
};

/** One page of archived chats (they are kept out of the main list). */
export const listArchived = async (acct: string, nextPage?: number) => {
  const inbox = inboxFor(acct);
  if (!inbox) return { contacts: [] as Chat[], nextPage: null as number | null };
  return inbox.chats.list({ filter: { archived: 'archived' }, limit: 50, nextPage });
};

/** Deletes one message from the thread (for everyone in the inbox), for the account it was started in. */
export const deleteMessage = async (acct: string, chatId: string, messageId: string) => {
  // A bubble that never reached the server (failed send) only lives on this device.
  if (!messageId.startsWith('local-')) {
    const inbox = inboxFor(acct);
    if (!inbox) throw new Error('Inbox is not connected');
    await inbox.messages.delete(chatId, messageId);
  }
  patch(acct, (a) => ({ threads: { ...a.threads, [chatId]: (a.threads[chatId] ?? []).filter((x) => x.id !== messageId) } }));
};

/** Assigns the chat to a team member (their user id), for the account it was started in. */
export const transferChat = async (acct: string, chat: Chat, memberId: string) => {
  const inbox = inboxFor(acct);
  if (!inbox) throw new Error('Inbox is not connected');
  await inbox.chats.transfer(chat.id, memberId);
  upsertChat(acct, { ...chat, agent: memberId });
};

/** A page of chats matching inbox views (assignment, read state…) and contact conditions, from the server. */
export const listFilteredChats = async (acct: string, view: ChatListFilter, conditions?: ContactFilterEntry[], nextPage?: number) => {
  const inbox = inboxFor(acct);
  if (!inbox) return { contacts: [] as Chat[], nextPage: null as number | null };
  return inbox.chats.list({ filter: view, conditions: conditions?.length ? conditions : undefined, limit: 50, nextPage });
};

/* ---------- automation, done, tags, chatbots ---------- */

/** Whether a flow is attached and running for this chat (not paused). */
export const automationState = (chat: Chat): 'running' | 'paused' | 'none' => {
  const bot = (chat.bot ?? {}) as { id?: string; pause?: boolean | number | string };
  if (bot.pause) return 'paused';
  return bot.id ? 'running' : 'none';
};

const applyResult = (acct: string, chat: Chat, r: { chat?: Chat | null } | void) => {
  if (r && r.chat) upsertChat(acct, r.chat);
  else upsertChat(acct, chat);
};

/** Pauses the chat's automation (optionally for a set time) or resumes it. */
export const setAutomation = async (acct: string, chat: Chat, action: 'pause' | 'resume', seconds?: number) => {
  const inbox = inboxFor(acct);
  if (!inbox) throw new Error('Inbox is not connected');
  if (action === 'resume') return applyResult(acct, chat, await inbox.chats.resumeAutomation(chat.id));
  const r = await inbox.chats.pauseAutomation(chat.id);
  applyResult(acct, chat, r);
  if (seconds) applyResult(acct, chat, await inbox.chats.pauseTimer(chat.id, seconds));
};

/** Marks the conversation done: it ends and goes back to the unassigned queue. */
export const markDone = async (acct: string, chat: Chat) => {
  const inbox = inboxFor(acct);
  if (!inbox) throw new Error('Inbox is not connected');
  upsertChat(acct, { ...chat, agent: null, chat_metadata: { ...chat.chat_metadata, marked_as_done: true, new: false } });
  applyResult(acct, chat, await inbox.chats.done(chat.id, true));
};

/** Replaces the chat's tags with `tagIds`. */
export const setChatTags = async (acct: string, chat: Chat, tagIds: string[]) => {
  const inbox = inboxFor(acct);
  if (!inbox) throw new Error('Inbox is not connected');
  applyResult(acct, chat, await inbox.chats.updateTags(chat.id, tagIds));
};

/** Starts a chatbot flow for the chat on a channel, optionally at a node. */
export const startChatbot = async (acct: string, chat: Chat, channel: string, bot: string, node = '') => {
  const inbox = inboxFor(acct);
  if (!inbox) throw new Error('Inbox is not connected');
  await inbox.chats.assignBot({ chat: chat.id, channel, bot, node, action: 'assign' });
};

/** Click-to-WhatsApp ads this contact arrived from (newest first). */
export const chatReferrals = async (acct: string, chatId: string) => (await inboxFor(acct)?.referrals(chatId, 5)) ?? [];

/** Asks the platform to fetch a media message's file again. */
export const retryMediaDownload = async (acct: string, messageId: string) => {
  const inbox = inboxFor(acct);
  if (!inbox) throw new Error('Inbox is not connected');
  const m = await inbox.messages.retryDownload(messageId);
  patch(acct, (a) => ({ threads: { ...a.threads, [m.contact]: (a.threads[m.contact] ?? []).map((x) => (x.id === m.id ? keepKeys(x, m) : x)) } }));
};

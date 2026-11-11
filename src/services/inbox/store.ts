/**
 * Live inbox state, per account, in memory. Fed by the socket manager; read by
 * the Inbox tab and chat screens. Every signed-in account in WhatsApp-API mode
 * has its own slice, so switching accounts never drops anyone's messages.
 */
import type { Chat, Message } from '@ab-ecosystem/cpaas';
import { create } from 'zustand';

export type ConnState = 'idle' | 'connecting' | 'connected' | 'error';

/**
 * A message as the UI holds it: the server row plus local send state. A sent row that
 * replaced its optimistic bubble keeps that bubble's list key (`localKey`), so the list
 * doesn't remount it, and the file it was sent from (`localUri`), shown while the
 * uploaded copy loads. A bubble also notes where its file was uploaded (`sentLink`) and the
 * draft its send answered with (`draftId`, `queueId`), to know its stored row when it comes.
 */
export type ChatMessage = Message & { pending?: boolean; failedText?: string; localKey?: string; localUri?: string; sentLink?: string; draftId?: string; queueId?: string };

export type AccountInbox = {
  state: ConnState;
  error?: string;
  chats: Chat[];
  nextPage: number | null;
  loaded: boolean;
  /** chatId → messages, oldest first */
  threads: Record<string, ChatMessage[]>;
  /** chatId → no older history */
  threadDone: Record<string, boolean>;
  /** The chat open on screen, so its arrivals are not counted unread. */
  openChat: string | null;
};

const empty = (): AccountInbox => ({ state: 'idle', chats: [], nextPage: null, loaded: false, threads: {}, threadDone: {}, openChat: null });

type State = {
  byAccount: Record<string, AccountInbox>;
  patch: (acct: string, fn: (a: AccountInbox) => Partial<AccountInbox>) => void;
  drop: (acct: string) => void;
};

export const useInboxStore = create<State>()((set, get) => ({
  byAccount: {},
  patch: (acct, fn) => {
    const cur = get().byAccount[acct] ?? empty();
    set({ byAccount: { ...get().byAccount, [acct]: { ...cur, ...fn(cur) } } });
  },
  drop: (acct) => {
    const { [acct]: _gone, ...rest } = get().byAccount;
    set({ byAccount: rest });
  },
}));

export const inboxOf = (acct: string | null | undefined): AccountInbox => (acct && useInboxStore.getState().byAccount[acct]) || empty();
export const useAccountInbox = (acct: string | null | undefined): AccountInbox => useInboxStore((s) => (acct && s.byAccount[acct]) || EMPTY);
const EMPTY = empty();

/** Unread chats for one account (badge). */
export const unreadCount = (a: AccountInbox) => a.chats.filter((c) => (c.chat_metadata?.unread ?? 0) > 0 || c.chat_metadata?.marked_as_unread).length;

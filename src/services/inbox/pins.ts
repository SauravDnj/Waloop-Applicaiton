/**
 * Pinned chats, per account, kept on the phone (the inbox API has no pin).
 * Pinned chats sit at the top of the list in the order they were pinned.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { kvStorage } from '@/services/storage';

type State = {
  byAccount: Record<string, string[]>;
  toggle: (acct: string, chatId: string) => void;
};

export const MAX_PINS = 5;

export const usePinStore = create<State>()(
  persist(
    (set, get) => ({
      byAccount: {},
      toggle: (acct, chatId) => {
        const cur = get().byAccount[acct] ?? [];
        const next = cur.includes(chatId) ? cur.filter((id) => id !== chatId) : [chatId, ...cur].slice(0, MAX_PINS);
        set({ byAccount: { ...get().byAccount, [acct]: next } });
      },
    }),
    { name: 'inbox-pins', storage: createJSONStorage(() => kvStorage) },
  ),
);

const NONE: string[] = [];
export const usePins = (acct: string | null) => usePinStore((s) => (acct ? (s.byAccount[acct] ?? NONE) : NONE));

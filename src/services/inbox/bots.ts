/**
 * Chatbots saved per account (name + flow id + optional start node). The
 * inbox API can start a flow by id but can't list flows, so the user saves the
 * ones they use once and picks them from then on.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { kvStorage } from '@/services/storage';

export type SavedBot = { id: string; name: string; node: string };

type State = {
  byAccount: Record<string, SavedBot[]>;
  save: (acct: string, bot: SavedBot) => void;
  remove: (acct: string, id: string) => void;
};

export const useBotStore = create<State>()(
  persist(
    (set, get) => ({
      byAccount: {},
      save: (acct, bot) => set({ byAccount: { ...get().byAccount, [acct]: [bot, ...(get().byAccount[acct] ?? []).filter((b) => b.id !== bot.id || b.node !== bot.node)] } }),
      remove: (acct, id) => set({ byAccount: { ...get().byAccount, [acct]: (get().byAccount[acct] ?? []).filter((b) => b.id !== id) } }),
    }),
    { name: 'inbox-bots', storage: createJSONStorage(() => kvStorage) },
  ),
);

const NONE: SavedBot[] = [];
export const useSavedBots = (acct: string | null) => useBotStore((s) => (acct ? (s.byAccount[acct] ?? NONE) : NONE));

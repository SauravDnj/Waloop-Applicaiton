/**
 * WhatsApp sending preferences, per account: the default WhatsApp Business
 * API channel in CPaaS, and remembered template variable mappings.
 *
 * Each signed-in account has its own default channel, since channels belong
 * to a workspace.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { kvStorage } from '@/services/storage';
import { useAccountsStore } from './accounts';

export type WhatsAppConfig = {
  /** CPaaS channel id used for sends by default. */
  channelId: string | null;
  channelName: string;
};

/** How one template variable gets its value: a contact field, or typed text that may embed `[[field]]` tokens. */
export type VariableSource = { kind: 'field'; key: string } | { kind: 'text'; value: string };

const DEFAULT: WhatsAppConfig = { channelId: null, channelName: '' };

type State = {
  byAccount: Record<string, WhatsAppConfig>;
  /** Remembered variable mappings: `${accountId}|${templateId}` → slot → source. */
  mappings: Record<string, Record<string, VariableSource>>;
  set: (accountId: string, patch: Partial<WhatsAppConfig>) => void;
  setMapping: (accountId: string, templateId: string, mapping: Record<string, VariableSource>) => void;
  forget: (accountId: string) => void;
};

export const useWhatsAppStore = create<State>()(
  persist(
    (set, get) => ({
      byAccount: {},
      mappings: {},
      set: (accountId, patch) => set({ byAccount: { ...get().byAccount, [accountId]: { ...DEFAULT, ...get().byAccount[accountId], ...patch } } }),
      setMapping: (accountId, templateId, mapping) => set({ mappings: { ...get().mappings, [`${accountId}|${templateId}`]: mapping } }),
      forget: (accountId) => {
        const { [accountId]: _gone, ...rest } = get().byAccount;
        const mappings = Object.fromEntries(Object.entries(get().mappings).filter(([k]) => !k.startsWith(`${accountId}|`)));
        set({ byAccount: rest, mappings });
      },
    }),
    {
      name: 'whatsapp',
      storage: createJSONStorage(() => kvStorage),
      version: 1,
      // v0 (CRM Dialer): mappings pointed at built-in lead fields that no longer exist, and
      // there was a phone/API mode. Keep the default channels; drop the mappings.
      migrate: (persisted, version) => {
        const old = (persisted ?? {}) as { byAccount?: Record<string, Partial<WhatsAppConfig>> };
        if (version >= 1) return persisted as State;
        const byAccount = Object.fromEntries(
          Object.entries(old.byAccount ?? {}).map(([id, c]) => [id, { channelId: c.channelId ?? null, channelName: c.channelName ?? '' }]),
        );
        return { byAccount, mappings: {} } as unknown as State;
      },
    },
  ),
);

/** The active account's WhatsApp config. */
export const useWhatsAppConfig = (): WhatsAppConfig => {
  const id = useAccountsStore((s) => s.activeId);
  return useWhatsAppStore((s) => (id ? (s.byAccount[id] ?? DEFAULT) : DEFAULT));
};

export const whatsAppConfig = (): WhatsAppConfig => {
  const id = useAccountsStore.getState().activeId;
  return (id && useWhatsAppStore.getState().byAccount[id]) || DEFAULT;
};

export const savedMapping = (accountId: string | null, templateId: string) =>
  (accountId && useWhatsAppStore.getState().mappings[`${accountId}|${templateId}`]) || {};

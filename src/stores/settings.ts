import type { CountryCode } from 'libphonenumber-js';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { detectLanguage, type LanguageCode } from '@/i18n';
import { detectCountry } from '@/lib/countries';
import { kvStorage } from '@/services/storage';

export type ThemePreference = 'system' | 'light' | 'dark';

type SettingsState = {
  theme: ThemePreference;
  language: LanguageCode;
  country: CountryCode;
  /** Each account's default country for numbers (a workspace can be in another country); falls back to `country`. */
  countryByAccount: Record<string, CountryCode>;
  setAccountCountry: (accountId: string, c: CountryCode) => void;
  setTheme: (t: ThemePreference) => void;
  setLanguage: (l: LanguageCode) => void;
  setCountry: (c: CountryCode) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      language: detectLanguage(),
      country: detectCountry().code,
      countryByAccount: {},
      setAccountCountry: (accountId, c) => set((s) => ({ countryByAccount: { ...s.countryByAccount, [accountId]: c } })),
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      setCountry: (country) => set({ country }),
    }),
    { name: 'settings', storage: createJSONStorage(() => kvStorage) },
  ),
);

/** The default country for numbers in an account (the active one by default). */
export const useAccountCountry = (accountId: string | null | undefined): CountryCode =>
  useSettingsStore((s) => (accountId ? s.countryByAccount[accountId] : undefined) ?? s.country);

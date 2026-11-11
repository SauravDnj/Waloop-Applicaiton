/**
 * Internationalisation.
 *
 * - i18next + react-i18next, resources bundled (no network).
 * - Device language picked on first launch (expo-localization), then whatever
 *   the user chooses in Settings → Language, persisted in the settings store.
 * - RTL: Urdu and Arabic are RTL. Switching to/from an RTL language flips
 *   `I18nManager` (native) / `document.dir` (web). Native needs a reload for
 *   layout direction to take effect, so `applyLanguage` reports whether one
 *   is required and the Language screen offers it.
 */
import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18nManager, Platform } from 'react-native';

import en from './locales/en.json';
import gu from './locales/gu.json';
import hi from './locales/hi.json';
import mr from './locales/mr.json';
import ta from './locales/ta.json';
import te from './locales/te.json';
import ur from './locales/ur.json';
import zh from './locales/zh.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import ar from './locales/ar.json';
import bn from './locales/bn.json';
import pt from './locales/pt.json';
import ru from './locales/ru.json';
import id from './locales/id.json';
import de from './locales/de.json';
import ja from './locales/ja.json';

export type LanguageCode = 'en' | 'hi' | 'mr' | 'gu' | 'ta' | 'te' | 'ur' | 'zh' | 'es' | 'fr' | 'ar' | 'bn' | 'pt' | 'ru' | 'id' | 'de' | 'ja';

export const LANGUAGES: {
  code: LanguageCode;
  name: string;
  native: string;
  rtl?: boolean;
}[] = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
  { code: 'mr', name: 'Marathi', native: 'मराठी' },
  { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు' },
  { code: 'ur', name: 'Urdu', native: 'اردو', rtl: true },
  { code: 'zh', name: 'Chinese', native: '简体中文' },
  { code: 'es', name: 'Spanish', native: 'Español' },
  { code: 'fr', name: 'French', native: 'Français' },
  { code: 'ar', name: 'Arabic', native: 'العربية', rtl: true },
  { code: 'bn', name: 'Bengali', native: 'বাংলা' },
  { code: 'pt', name: 'Portuguese', native: 'Português' },
  { code: 'ru', name: 'Russian', native: 'Русский' },
  { code: 'id', name: 'Indonesian', native: 'Bahasa Indonesia' },
  { code: 'de', name: 'German', native: 'Deutsch' },
  { code: 'ja', name: 'Japanese', native: '日本語' },
];

export const isRtlLanguage = (code: string) => LANGUAGES.find((l) => l.code === code)?.rtl === true;

/** Best match for the device locale, else English. */
export const detectLanguage = (): LanguageCode => {
  try {
    for (const loc of getLocales()) {
      const code = (loc.languageCode ?? '').toLowerCase() as LanguageCode;
      if (LANGUAGES.some((l) => l.code === code)) return code;
    }
  } catch {
    // no locale info (tests / web SSR)
  }
  return 'en';
};

const i18next = createInstance();
let initialised = false;

export const initI18n = (language: LanguageCode) => {
  if (initialised) {
    if (i18next.language !== language) void i18next.changeLanguage(language);
    return i18next;
  }
  initialised = true;
  void i18next.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      hi: { translation: hi },
      mr: { translation: mr },
      gu: { translation: gu },
      ta: { translation: ta },
      te: { translation: te },
      ur: { translation: ur },
      zh: { translation: zh },
      es: { translation: es },
      fr: { translation: fr },
      ar: { translation: ar },
      bn: { translation: bn },
      pt: { translation: pt },
      ru: { translation: ru },
      id: { translation: id },
      de: { translation: de },
      ja: { translation: ja },
    },
    lng: language,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  return i18next;
};

/**
 * Switches language and layout direction. Returns `true` when the native app
 * must reload for the direction change to apply.
 */
export const applyLanguage = async (language: LanguageCode): Promise<boolean> => {
  await i18next.changeLanguage(language);
  const rtl = isRtlLanguage(language);
  if (Platform.OS === 'web') {
    if (typeof document !== 'undefined') {
      document.documentElement.dir = rtl ? 'rtl' : 'ltr';
      document.documentElement.lang = language;
    }
    return false;
  }
  I18nManager.allowRTL(rtl);
  if (I18nManager.isRTL !== rtl) {
    I18nManager.forceRTL(rtl);
    return true;
  }
  return false;
};

export { i18next };

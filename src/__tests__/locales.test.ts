import en from '@/i18n/locales/en.json';
import gu from '@/i18n/locales/gu.json';
import hi from '@/i18n/locales/hi.json';
import mr from '@/i18n/locales/mr.json';
import ta from '@/i18n/locales/ta.json';
import te from '@/i18n/locales/te.json';
import ur from '@/i18n/locales/ur.json';
import zh from '@/i18n/locales/zh.json';
import es from '@/i18n/locales/es.json';
import fr from '@/i18n/locales/fr.json';
import ar from '@/i18n/locales/ar.json';
import bn from '@/i18n/locales/bn.json';
import pt from '@/i18n/locales/pt.json';
import ru from '@/i18n/locales/ru.json';
import id from '@/i18n/locales/id.json';
import de from '@/i18n/locales/de.json';
import ja from '@/i18n/locales/ja.json';

const flatten = (obj: Record<string, unknown>, prefix = ''): string[] =>
  Object.entries(obj).flatMap(([k, v]) => (v && typeof v === 'object' ? flatten(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`]));

const placeholders = (s: string) => (s.match(/\{\{\s*\w+\s*\}\}/g) ?? []).map((p) => p.replace(/\s/g, '')).sort();

const lookup = (obj: Record<string, unknown>, path: string): unknown => path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], obj);

describe('locales', () => {
  const base = flatten(en).sort();
  for (const [code, dict] of Object.entries({ hi, mr, gu, ta, te, ur, zh, es, fr, ar, bn, pt, ru, id, de, ja })) {
    it(`${code} has every English key and the same interpolation placeholders`, () => {
      const keys = flatten(dict).sort();
      expect(keys).toEqual(base);
      for (const key of base) {
        const a = lookup(en, key);
        const b = lookup(dict, key);
        if (typeof a === 'string' && typeof b === 'string') expect(placeholders(b)).toEqual(placeholders(a));
      }
    });
  }
});

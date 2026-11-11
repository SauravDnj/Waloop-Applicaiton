import { COUNTRIES, countryByCode, defaultCurrencyFor, detectCountry, flagEmoji, searchCountries } from '@/lib/countries';

describe('countries', () => {
  it('carries dial codes from libphonenumber', () => {
    expect(countryByCode('IN')?.dial).toBe('91');
    expect(countryByCode('US')?.dial).toBe('1');
    expect(countryByCode('AE')?.dial).toBe('971');
    expect(COUNTRIES.every((c) => c.dial && c.flag.length > 0)).toBe(true);
  });

  it('builds flag emoji from the ISO code', () => {
    expect(flagEmoji('IN')).toBe('🇮🇳');
  });

  it('defaults the currency from the country, constrained to what the SSO offers', () => {
    expect(defaultCurrencyFor('IN', ['INR', 'USD'])).toBe('INR');
    expect(defaultCurrencyFor('GB', ['INR', 'USD'])).toBe('USD');
    expect(defaultCurrencyFor('IN', [])).toBe('INR');
  });

  it('searches by name, code or dial prefix', () => {
    expect(searchCountries('ind').map((c) => c.code)).toContain('IN');
    expect(searchCountries('+97').map((c) => c.code)).toEqual(expect.arrayContaining(['AE', 'QA', 'BH']));
    expect(searchCountries('gb')[0]?.code).toBe('GB');
  });

  it('detects a country and never returns nothing', () => {
    expect(detectCountry().code).toBeTruthy();
  });
});

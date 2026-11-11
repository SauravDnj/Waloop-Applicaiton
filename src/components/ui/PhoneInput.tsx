/**
 * Mobile number as two fields: a country-code dropdown (flag + dial code,
 * searchable, all countries) and the national number. Defaults to the
 * profile's country. Emits the full number as digits with the country code
 * in international form (e.g. "+919876543210").
 */
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { ChevronDown } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { countryByCode, type Country } from '@/lib/countries';
import { useAccountCountry } from '@/stores/settings';
import { useAccountsStore } from '@/stores/accounts';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/tokens';
import { CountryPicker } from './CountryPicker';
import { Text } from './Text';

/** Splits a stored or typed number into country + national part. */
const split = (value: string, fallback: CountryCode): { country: CountryCode; national: string } => {
  const raw = value.trim();
  if (!raw) return { country: fallback, national: '' };
  const parsed = parsePhoneNumberFromString(raw.startsWith('+') ? raw : `+${raw.replace(/\D/g, '')}`);
  if (parsed?.country && parsed.isPossible()) return { country: parsed.country, national: parsed.nationalNumber };
  const local = parsePhoneNumberFromString(raw, fallback);
  return { country: fallback, national: local?.nationalNumber ?? raw.replace(/\D/g, '') };
};

export function PhoneInput({
  value,
  onChange,
  label,
  hint,
  editable = true,
  autoFocus,
}: {
  value: string;
  onChange: (full: string) => void;
  label?: string;
  hint?: string;
  editable?: boolean;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const profileCountry = useAccountCountry(useAccountsStore((s) => s.activeId));
  const [initial] = useState(() => split(value, profileCountry));
  const [country, setCountry] = useState<Country>(() => countryByCode(initial.country) ?? countryByCode(profileCountry)!);
  const [national, setNational] = useState(initial.national);
  const [picking, setPicking] = useState(false);
  const [focused, setFocused] = useState(false);

  const emit = (c: Country, n: string) => {
    const digits = n.replace(/\D/g, '').replace(/^0+/, '');
    onChange(digits ? `+${c.dial}${digits}` : '');
  };

  const field = { backgroundColor: colors.surface, borderColor: focused ? colors.primary : colors.border, borderRadius: radius.md };

  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Text variant="caption" style={{ color: colors.textMuted, fontWeight: '500', marginStart: 2 }}>
          {label}
        </Text>
      ) : null}
      <View style={styles.row}>
        <Pressable
          disabled={!editable}
          onPress={() => setPicking(true)}
          style={[styles.dial, field, !editable && { opacity: 0.6 }]}
          accessibilityLabel={t('auth.countryCode')}
        >
          <Text style={{ fontSize: 18 }}>{country.flag}</Text>
          <Text variant="bodyStrong">+{country.dial}</Text>
          {editable ? <ChevronDown size={14} color={colors.textMuted} /> : null}
        </Pressable>
        <View style={[styles.numberWrap, field, !editable && { opacity: 0.6 }]}>
          <TextInput
            value={national}
            editable={editable}
            autoFocus={autoFocus}
            onChangeText={(v) => {
              setNational(v);
              emit(country, v);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            keyboardType="phone-pad"
            placeholder={t('auth.mobilePlaceholder', { defaultValue: '98765 43210' })}
            placeholderTextColor={colors.textFaint}
            style={[styles.input, { color: colors.text, fontFamily: fonts.regular }]}
          />
        </View>
      </View>
      {hint ? (
        <Text variant="caption" tone="faint">
          {hint}
        </Text>
      ) : null}
      <CountryPicker
        open={picking}
        value={country}
        title={t('auth.countryCode')}
        onClose={() => setPicking(false)}
        onSelect={(c) => {
          setCountry(c);
          setPicking(false);
          emit(c, national);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  dial: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, minHeight: 48, borderWidth: 1 },
  numberWrap: { flex: 1, borderWidth: 1, paddingHorizontal: 14, minHeight: 48, justifyContent: 'center' },
  input: { fontSize: 15, paddingVertical: 12 },
});

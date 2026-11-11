import { HOME } from '@/lib/nav';
import { router } from 'expo-router';
import { ChevronDown, Sparkles } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AuthShell } from '@/components/AuthShell';
import { useCaptchaField } from '@/components/captcha/useCaptchaField';
import { Button, Chip, Input, Row, Text } from '@/components/ui';
import { CountryPicker } from '@/components/ui/CountryPicker';
import { defaultCurrencyFor, detectCountry, type Country } from '@/lib/countries';
import { getCurrencies, readAccessToken, signup } from '@/services/sso/client';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { useTheme } from '@/theme/ThemeProvider';
import type { Metadata } from 'expo-router/server';

const FALLBACK_CURRENCIES = ['INR', 'USD'];

/** Web: this page's title and description for search and link previews. */
export function generateMetadata(): Metadata {
  return {
    title: 'Create your account · Inbox And Campaigns',
    description: 'Create an Inbox And Campaigns account for your team: WhatsApp inbox, contacts and campaigns in one app.',
  };
}

export default function SignupScreen() {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const adoptToken = useAuthStore((s) => s.adoptToken);
  const setDefaultCountrySetting = useSettingsStore((s) => s.setCountry);
  const captcha = useCaptchaField('submit');
  const [detected] = useState<Country>(() => detectCountry());
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [dialCountry, setDialCountry] = useState<Country>(detected);
  const [number, setNumber] = useState('');
  const [country, setCountry] = useState<Country>(detected);
  const [currencies, setCurrencies] = useState<string[]>(FALLBACK_CURRENCIES);
  const [currency, setCurrency] = useState(() => defaultCurrencyFor(detected.code, FALLBACK_CURRENCIES));
  const [currencyTouched, setCurrencyTouched] = useState(false);
  const [picker, setPicker] = useState<'dial' | 'country' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    getCurrencies()
      .then((list) => {
        const codes = list.map((c) => c.code);
        if (!codes.length) return;
        setCurrencies(codes);
        setCurrency((cur) => (codes.includes(cur) ? cur : defaultCurrencyFor(detected.code, codes)));
      })
      .catch(() => undefined);
  }, [detected.code]);

  const pickCountry = (c: Country) => {
    setCountry(c);
    if (!number) setDialCountry(c);
    if (!currencyTouched) setCurrency(defaultCurrencyFor(c.code, currencies));
    setPicker(null);
  };

  const digits = number.replace(/\D/g, '');
  const fullPhone = digits ? `+${dialCountry.dial}${digits}` : '';

  const submit = async () => {
    if (!firstName.trim() || !email.trim() || password.length < 8) return setError(t('auth.signupInvalid'));
    if (!country || !currency) return setError(t('auth.countryRequired'));
    setBusy(true);
    setError(null);
    try {
      const captchaToken = await captcha.getToken();
      const res = await signup({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        password,
        phoneNumber: fullPhone || undefined,
        dialCode: fullPhone ? dialCountry.dial : undefined,
        country: country.code,
        currency,
        captchaToken,
      });
      setDefaultCountrySetting(country.code);
      const token = readAccessToken(res);
      if (token) {
        await adoptToken(token);
        router.replace(HOME);
      } else {
        setDone(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.errorTitle'));
      captcha.reset();
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <AuthShell title={t('auth.checkEmail')} subtitle={t('auth.verificationSent')}>
        <Button title={t('auth.backToSignIn')} size="lg" full onPress={() => router.replace('/(auth)/login')} />
      </AuthShell>
    );
  }

  const fieldStyle = {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
  };

  return (
    <AuthShell
      title={t('auth.signupTitle')}
      subtitle={t('auth.signupSubtitle')}
      back
      footer={
        <>
          <Text tone="muted">{t('auth.haveAccount')}</Text>
          <Pressable onPress={() => router.replace('/(auth)/login')} hitSlop={8}>
            <Text variant="bodyStrong" tone="primary">
              {t('auth.signIn')}
            </Text>
          </Pressable>
        </>
      }
    >
      <View style={styles.form}>
        <Row gap={10}>
          <View style={{ flex: 1 }}>
            <Input label={t('auth.firstName')} value={firstName} onChangeText={setFirstName} autoCapitalize="words" />
          </View>
          <View style={{ flex: 1 }}>
            <Input label={t('auth.lastName')} value={lastName} onChangeText={setLastName} autoCapitalize="words" />
          </View>
        </Row>
        <Input label={t('auth.workEmail')} keyboardType="email-address" autoComplete="email" value={email} onChangeText={setEmail} />
        <Input label={t('auth.password')} secureTextEntry value={password} onChangeText={setPassword} hint={t('auth.passwordHint')} />

        <View style={{ gap: 6 }}>
          <Text variant="caption" tone="muted" style={{ marginStart: 2, fontWeight: '600' }}>
            {t('auth.mobile')}
          </Text>
          <Row gap={8}>
            <Pressable onPress={() => setPicker('dial')} style={[styles.dial, fieldStyle]}>
              <Text style={{ fontSize: 18 }}>{dialCountry.flag}</Text>
              <Text variant="bodyStrong">+{dialCountry.dial}</Text>
              <ChevronDown size={14} color={colors.textMuted} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Input placeholder="98765 43210" keyboardType="phone-pad" autoComplete="tel-national" value={number} onChangeText={setNumber} />
            </View>
          </Row>
        </View>

        <View style={{ gap: 6 }}>
          <Text variant="caption" tone="muted" style={{ marginStart: 2 }}>
            {t('auth.country')} *
          </Text>
          <Pressable onPress={() => setPicker('country')} style={[styles.countryRow, fieldStyle]}>
            <Text style={{ fontSize: 20 }}>{country.flag}</Text>
            <Text variant="bodyStrong" style={{ flex: 1 }}>
              {country.name}
            </Text>
            {country.code === detected.code ? (
              <Row gap={4}>
                <Sparkles size={12} color={colors.textFaint} />
                <Text variant="micro" tone="faint">
                  {t('auth.detected')}
                </Text>
              </Row>
            ) : null}
            <ChevronDown size={16} color={colors.textMuted} />
          </Pressable>
        </View>

        <View style={{ gap: 8 }}>
          <Text variant="caption" tone="muted" style={{ marginStart: 2 }}>
            {t('auth.currency')} *
          </Text>
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            {currencies.map((c) => (
              <Chip
                key={c}
                label={c}
                selected={currency === c}
                onPress={() => {
                  setCurrency(c);
                  setCurrencyTouched(true);
                }}
              />
            ))}
          </Row>
        </View>

        {captcha.element}
        {error ? (
          <Text variant="caption" tone="danger">
            {error}
          </Text>
        ) : null}
        <Button title={t('auth.createAccount')} size="lg" full onPress={() => void submit()} loading={busy || captcha.loading} />
      </View>

      <CountryPicker
        open={picker === 'dial'}
        value={dialCountry}
        title={t('auth.countryCode')}
        onClose={() => setPicker(null)}
        onSelect={(c) => {
          setDialCountry(c);
          setPicker(null);
        }}
      />
      <CountryPicker
        open={picker === 'country'}
        value={country}
        title={t('auth.country')}
        showDial={false}
        onClose={() => setPicker(null)}
        onSelect={pickCountry}
      />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  form: { gap: 14 },
  dial: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 53,
  },
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    height: 53,
  },
});

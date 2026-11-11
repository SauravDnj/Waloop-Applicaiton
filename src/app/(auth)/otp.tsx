import { router } from 'expo-router';
import { goBack } from '@/lib/nav';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AuthShell } from '@/components/AuthShell';
import { useCaptchaField } from '@/components/captcha/useCaptchaField';
import { Button, Text } from '@/components/ui';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme/ThemeProvider';

export default function OtpScreen() {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const verify = useAuthStore((s) => s.verifyOtp);
  const pending = useAuthStore((s) => s.pending);
  const clearPending = useAuthStore((s) => s.clearPending);
  const captcha = useCaptchaField('verify_2fa');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    if (pending?.kind === 'account') router.replace('/(auth)/accounts');
  }, [pending]);

  const submit = async (value = code) => {
    if (!/^\d{6}$/.test(value)) return setError(t('auth.otpInvalid'));
    setBusy(true);
    setError(null);
    try {
      const captchaToken = await captcha.getToken();
      await verify(value, captchaToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.signInFailed'));
      captcha.reset();
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const autoSubmit = !captcha.enabled || captcha.solved || captcha.config?.captcha.version === 'v3';

  return (
    <AuthShell title={t('auth.otpTitle')} subtitle={t('auth.otpSubtitle')} back showLogo={false}>
      <Pressable onPress={() => input.current?.focus()} style={styles.boxes}>
        {Array.from({ length: 6 }).map((_, i) => {
          const active = code.length === i;
          return (
            <View
              key={i}
              style={[
                styles.box,
                {
                  borderColor: active ? colors.primary : 'transparent',
                  backgroundColor: active ? colors.surface : colors.surfaceAlt,
                  borderRadius: radius.sm,
                },
              ]}
            >
              <Text variant="h1">{code[i] ?? ''}</Text>
            </View>
          );
        })}
      </Pressable>
      <TextInput
        ref={input}
        autoFocus
        value={code}
        onChangeText={(v) => {
          const digits = v.replace(/\D/g, '').slice(0, 6);
          setCode(digits);
          if (digits.length === 6 && autoSubmit) void submit(digits);
        }}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={6}
        style={styles.hidden}
      />
      {captcha.element}
      {error ? (
        <Text variant="caption" tone="danger" center>
          {error}
        </Text>
      ) : null}
      <Button title={t('auth.verify')} size="lg" full onPress={() => void submit()} loading={busy} disabled={code.length < 6} />
      <Pressable
        onPress={() => {
          clearPending();
          goBack();
        }}
        style={{ alignSelf: 'center', padding: 6 }}
      >
        <Text variant="caption" tone="muted">
          {t('auth.useDifferentAccount')}
        </Text>
      </Pressable>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  boxes: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  box: {
    flex: 1,
    maxWidth: 52,
    height: 60,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hidden: { position: 'absolute', opacity: 0, height: 1, width: 1 },
});

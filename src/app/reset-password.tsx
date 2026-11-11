/**
 * Password reset link from the sign-in server: `/reset-password?token=…` on
 * the web (https://dialerapp.com.bot/reset-password) and inside the app.
 * Sets a new password, then offers sign-in. A captcha may be required.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { KeyRound } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AuthShell } from '@/components/AuthShell';
import { useCaptchaField } from '@/components/captcha/useCaptchaField';
import { Button, Input, Text } from '@/components/ui';
import { setAuthAccessId } from '@/services/accessId';
import { resetPassword } from '@/services/sso/client';
import { useTheme } from '@/theme/ThemeProvider';
import type { Metadata } from 'expo-router/server';

/** Web: this page's title and description for search and link previews. */
export function generateMetadata(): Metadata {
  return { title: 'Choose a new password · Inbox And Campaigns', description: 'Set a new password for your Inbox And Campaigns account.' };
}

export default function ResetPassword() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ token?: string; access?: string }>();
  const token = params.token ?? '';
  const captcha = useCaptchaField('submit');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (password.length < 8) return setError(t('auth.passwordHint'));
    if (password !== confirm) return setError(t('reset.mismatch'));
    setBusy(true);
    setError(null);
    try {
      if (params.access) setAuthAccessId(params.access);
      await resetPassword(token, password, await captcha.getToken());
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.errorTitle'));
      captcha.reset();
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <AuthShell title={t('reset.title')} subtitle={t('reset.missing')}>
        <Button title={t('reset.requestNew')} full onPress={() => router.replace('/(auth)/forgot')} />
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell title={t('reset.done')} subtitle={t('reset.doneBody')}>
        <View style={{ alignItems: 'center', paddingVertical: 8 }}>
          <KeyRound size={44} color={colors.success} />
        </View>
        <Button title={t('auth.signIn')} size="lg" full onPress={() => router.replace('/(auth)/login')} />
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t('reset.title')} subtitle={t('reset.sub')}>
      <View style={{ gap: 14 }}>
        <Input label={t('reset.newPassword')} secureTextEntry value={password} onChangeText={setPassword} hint={t('auth.passwordHint')} />
        <Input label={t('reset.confirm')} secureTextEntry value={confirm} onChangeText={setConfirm} />
        {captcha.element}
        {error ? (
          <Text variant="caption" tone="danger">
            {error}
          </Text>
        ) : null}
        <Button title={t('reset.button')} size="lg" full loading={busy || captcha.loading} onPress={() => void submit()} />
      </View>
    </AuthShell>
  );
}

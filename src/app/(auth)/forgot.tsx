import { router } from 'expo-router';
import { MailCheck } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AuthShell } from '@/components/AuthShell';
import { useCaptchaField } from '@/components/captcha/useCaptchaField';
import { Button, GradientDisc, Input, Text } from '@/components/ui';
import { forgotPassword } from '@/services/sso/client';
import type { Metadata } from 'expo-router/server';

/** Web: this page's title and description for search and link previews. */
export function generateMetadata(): Metadata {
  return { title: 'Reset your password · Inbox And Campaigns', description: 'Get a link to reset your Inbox And Campaigns password.' };
}

export default function ForgotScreen() {
  const { t } = useTranslation();
  const captcha = useCaptchaField('submit');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const captchaToken = await captcha.getToken();
      await forgotPassword(email.trim(), captchaToken);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.errorTitle'));
      captcha.reset();
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title={t('auth.resetTitle')} subtitle={t('auth.resetSubtitle')} back>
      {sent ? (
        <View style={{ alignItems: 'center', gap: 12 }}>
          <GradientDisc size={64}>
            <MailCheck size={28} color="#fff" />
          </GradientDisc>
          <Text center>{t('auth.resetSent', { email })}</Text>
          <Button title={t('auth.backToSignIn')} size="lg" full onPress={() => router.replace('/(auth)/login')} />
        </View>
      ) : (
        <>
          <Input
            label={t('auth.email')}
            placeholder={t('auth.emailPlaceholder')}
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            autoFocus
            onSubmitEditing={() => void submit()}
          />
          {captcha.element}
          {error ? (
            <Text variant="caption" tone="danger" center>
              {error}
            </Text>
          ) : null}
          <Button title={t('auth.sendResetLink')} size="lg" full onPress={() => void submit()} loading={busy || captcha.loading} disabled={!email.trim()} />
        </>
      )}
    </AuthShell>
  );
}

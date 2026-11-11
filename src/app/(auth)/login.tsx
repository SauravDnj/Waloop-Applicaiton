import { Redirect, router } from 'expo-router';
import { goBack } from '@/lib/nav';
import { Image } from 'expo-image';
import { Clock, Eye, EyeOff, KeyRound, Lock, Mail } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Platform, Pressable, StyleSheet, Switch, View } from 'react-native';

import { AuthShell } from '@/components/AuthShell';
import { useAuthConfig, useCaptchaField } from '@/components/captcha/useCaptchaField';
import { Button, Input, Row, Text } from '@/components/ui';
import { ACCESS_LOCKED, getAuthAccessId, hasChosenAccessId } from '@/services/accessId';
import { savedLogins } from '@/services/storage';
import { hasPin } from '@/stores/appLock';
import { useAccountsStore } from '@/stores/accounts';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme/ThemeProvider';
import type { Metadata } from 'expo-router/server';

/** Web: this page's title and description for search and link previews. */
export function generateMetadata(): Metadata {
  return { title: 'Log in · Inbox And Campaigns', description: 'Log in to Inbox And Campaigns to work your WhatsApp inbox, contacts and campaigns.' };
}

export default function LoginScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const login = useAuthStore((s) => s.login);
  const pending = useAuthStore((s) => s.pending);
  const adding = useAuthStore((s) => s.adding);
  const authConfig = useAuthConfig();
  const captcha = useCaptchaField('submit');
  // Back after the sign-in expired: say so and start from the same email.
  const expired = useAuthStore((s) => s.expired);
  const [email, setEmail] = useState(expired?.email ?? '');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const layout = captcha.config?.cardLayout;
  // Phones keep the password in the Keychain / Keystore; on web the browser's password manager does it.
  const canRemember = Platform.OS !== 'web';
  const [remember, setRemember] = useState(true);

  // Fill in what was saved for this workspace (not over a different email after an expiry).
  useEffect(() => {
    if (!canRemember) return;
    let live = true;
    void savedLogins.get(getAuthAccessId()).then((saved) => {
      if (!live || !saved || (expired?.email && expired.email !== saved.email)) return;
      // Never fill in the password of a PIN-locked account: that would get round its lock.
      const accessId = getAuthAccessId();
      const locked = useAccountsStore
        .getState()
        .sessions.some((x) => x.accessId === accessId && x.email.toLowerCase() === saved.email.toLowerCase() && hasPin(x.id));
      if (locked) return setEmail(saved.email);
      setEmail(saved.email);
      setPassword(saved.password);
    });
    return () => {
      live = false;
    };
  }, [canRemember, expired?.email]);

  useEffect(() => {
    if (pending?.kind === '2fa') router.push('/(auth)/otp');
    if (pending?.kind === 'account') router.push('/(auth)/accounts');
  }, [pending]);

  const submit = async () => {
    if (!email.trim() || !password) return setError(t('auth.enterCreds'));
    setBusy(true);
    setError(null);
    try {
      const captchaToken = await captcha.getToken();
      await login(email.trim(), password, captchaToken);
      // The password was accepted (a 2FA or workspace step may still follow).
      if (canRemember) {
        // Never for a PIN-locked account: the saved password would open it without the PIN.
        const accessId = getAuthAccessId();
        const lockedLogin = useAccountsStore
          .getState()
          .sessions.some((x) => x.accessId === accessId && x.email.toLowerCase() === email.trim().toLowerCase() && hasPin(x.id));
        if (remember && !lockedLogin) void savedLogins.set(accessId, { email: email.trim(), password });
        else void savedLogins.clear(accessId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.signInFailed'));
      captcha.reset();
    } finally {
      setBusy(false);
    }
  };

  if (!hasChosenAccessId()) return <Redirect href="/(auth)/access" />;

  return (
    <AuthShell
      title={adding ? t('accounts.addTitle') : t('auth.welcomeBack')}
      subtitle={adding ? t('accounts.addSub') : t('app.subtitle')}
      // One fixed Access ID: login is the first screen, so back only leaves "add account".
      back={!ACCESS_LOCKED || adding}
      onBack={() => {
        goBack(ACCESS_LOCKED ? '/' : '/(auth)/access');
      }}
      footer={
        (layout?.signupEnabled ?? true) ? (
          <>
            <Text tone="muted">{t('auth.newHere')}</Text>
            <Pressable onPress={() => router.push('/(auth)/signup')} hitSlop={8}>
              <Text variant="bodyStrong" tone="primary">
                {t('auth.createAccount')}
              </Text>
            </Pressable>
          </>
        ) : undefined
      }
    >
      {expired && !adding ? (
        <View style={[styles.expired, { backgroundColor: colors.warningSoft }]} accessibilityRole="alert">
          <Clock size={18} color={colors.warning} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong">{t('auth.expiredTitle')}</Text>
            <Text variant="caption" tone="muted">
              {t('auth.expiredBody', { workspace: expired.workspace })}
            </Text>
          </View>
        </View>
      ) : null}
      {/* A build for one Access ID has nothing to change: just the workspace's logo, if it has one. */}
      {ACCESS_LOCKED ? (
        authConfig.data?.brandLogoUrl ? (
          <Image source={{ uri: authConfig.data.brandLogoUrl }} style={styles.lockedLogo} contentFit="contain" />
        ) : null
      ) : (
        <Pressable onPress={() => router.push('/(auth)/access')} style={[styles.access, { backgroundColor: colors.surfaceAlt }]} hitSlop={4}>
          {authConfig.data?.brandLogoUrl ? (
            <Image source={{ uri: authConfig.data.brandLogoUrl }} style={styles.accessLogo} contentFit="contain" />
          ) : (
            <KeyRound size={16} color={colors.primary} />
          )}
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {t('access.verified')}
            </Text>
          </View>
          <Text variant="caption" tone="primary" style={{ fontWeight: '700' }}>
            {t('access.change')}
          </Text>
        </Pressable>
      )}
      <Input
        label={t('auth.email')}
        placeholder={t('auth.emailPlaceholder')}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="username"
        value={email}
        onChangeText={setEmail}
        left={<Mail size={18} color={colors.textFaint} />}
      />
      <Input
        label={t('auth.password')}
        placeholder="••••••••"
        secureTextEntry={!show}
        autoComplete="password"
        textContentType="password"
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={() => void submit()}
        left={<Lock size={18} color={colors.textFaint} />}
        right={
          <Pressable onPress={() => setShow((v) => !v)} hitSlop={8}>
            {show ? <EyeOff size={18} color={colors.textMuted} /> : <Eye size={18} color={colors.textMuted} />}
          </Pressable>
        }
      />
      <Row gap={8} style={{ marginTop: -4, alignItems: 'center' }}>
        {canRemember ? (
          <Pressable
            onPress={() => setRemember((v) => !v)}
            style={styles.remember}
            hitSlop={6}
            accessibilityRole="switch"
            accessibilityState={{ checked: remember }}
          >
            <Switch value={remember} onValueChange={setRemember} trackColor={{ true: colors.primary }} style={styles.switch} />
            <Text variant="caption" tone="muted">
              {t('auth.rememberPassword')}
            </Text>
          </Pressable>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        {(layout?.forgotPasswordEnabled ?? true) ? (
          <Pressable onPress={() => router.push('/(auth)/forgot')} hitSlop={8}>
            <Text variant="caption" tone="primary" style={{ fontWeight: '700' }}>
              {t('auth.forgot')}
            </Text>
          </Pressable>
        ) : null}
      </Row>
      {captcha.element}
      {error ? (
        <Text variant="caption" tone="danger" center>
          {error}
        </Text>
      ) : null}
      <Button title={t('auth.signIn')} size="lg" full onPress={() => void submit()} loading={busy || captcha.loading} />
      {layout?.termsEnabled || layout?.privacyPolicyEnabled ? (
        <Row gap={14} style={{ justifyContent: 'center' }}>
          {layout.termsEnabled && layout.termsUrl ? (
            <Pressable onPress={() => void Linking.openURL(layout.termsUrl!)}>
              <Text variant="micro" tone="faint">
                {t('auth.terms')}
              </Text>
            </Pressable>
          ) : null}
          {layout.privacyPolicyEnabled && layout.privacyPolicyUrl ? (
            <Pressable onPress={() => void Linking.openURL(layout.privacyPolicyUrl!)}>
              <Text variant="micro" tone="faint">
                {t('auth.privacy')}
              </Text>
            </Pressable>
          ) : null}
        </Row>
      ) : null}
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  lockedLogo: { height: 48, width: '100%' },
  expired: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 12 },
  access: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14 },
  remember: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  switch: { transform: [{ scale: 0.8 }] },
  accessLogo: { width: 28, height: 28, borderRadius: 8 },
});

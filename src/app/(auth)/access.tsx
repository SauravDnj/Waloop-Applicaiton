/**
 * Step one of signing in: the Access ID (the project id). Typed or scanned
 * from a QR code, checked against the SSO, then the project's own login and
 * signup open. Each account keeps the Access ID it signed in with.
 */
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { goBack, HOME } from '@/lib/nav';
import { ArrowRight, KeyRound, QrCode, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

import { AuthShell } from '@/components/AuthShell';
import { QrScanner } from '@/components/QrScanner';
import { Button, Input, Text } from '@/components/ui';
import {
  ACCESS_LOCKED,
  forgetAccessId,
  looksLikeAccessId,
  parseAccessId,
  recentAccessIds,
  rememberAccessId,
  setAuthAccessId,
  type RecentAccess,
} from '@/services/accessId';
import { getAuthConfig } from '@/services/sso/client';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme/ThemeProvider';
import type { Metadata } from 'expo-router/server';

/** Web: this page's title and description for search and link previews. */
export function generateMetadata(): Metadata {
  return {
    title: 'Sign in · Inbox And Campaigns',
    description: 'Enter your company Access ID to sign in to Inbox And Campaigns: your WhatsApp inbox, contacts and campaigns in one app.',
  };
}

/** A build for one Access ID (`EXPO_PUBLIC_ACCESS_ID`) skips this screen. */
export default function AccessGate() {
  if (ACCESS_LOCKED) return <Redirect href="/(auth)/login" />;
  return <AccessScreen />;
}

function AccessScreen() {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const adding = useAuthStore((s) => s.adding);
  const cancelAddAccount = useAuthStore((s) => s.cancelAddAccount);
  // `?id=` from an Access ID link (see +native-intent): filled in and tried once.
  const params = useLocalSearchParams<{ id?: string }>();
  const [value, setValue] = useState(params.id ?? '');
  // A new link while this screen is open fills the field with its id.
  const [shownId, setShownId] = useState(params.id);
  if (params.id && params.id !== shownId) {
    setShownId(params.id);
    setValue(params.id);
  }
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentAccess[]>(() => recentAccessIds());

  const go = async (raw: string) => {
    const id = parseAccessId(raw);
    if (!looksLikeAccessId(id)) return setError(t('access.invalid'));
    setBusy(id);
    setError(null);
    try {
      const config = await getAuthConfig(id);
      setAuthAccessId(id);
      rememberAccessId({ id, label: recent.find((r) => r.id === id)?.label ?? '', logo: config.brandLogoUrl ?? null });
      router.push('/(auth)/login');
    } catch (err) {
      setError(err instanceof Error && /404|Unknown/.test(err.message) ? t('access.notFound') : err instanceof Error ? err.message : t('access.invalid'));
    } finally {
      setBusy(null);
    }
  };
  // Each new link is tried once. Not while already signed in (unless adding an account): a link
  // must not change the Access ID the signed-in accounts fall back on.
  const status = useAuthStore((s) => s.status);
  const linked = useRef<string | null>(null);
  useEffect(() => {
    if (!params.id || linked.current === params.id) return;
    if (status === 'booting' || (status === 'signedIn' && !adding)) return;
    const id = params.id;
    // Submitted on the next tick, not inside the effect itself.
    const timer = setTimeout(() => {
      linked.current = id;
      void go(id);
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per linked id
  }, [params.id, status, adding]);

  return (
    <AuthShell
      title={adding ? t('accounts.addTitle') : t('access.title')}
      subtitle={t('access.subtitle')}
      back={adding}
      onBack={() => {
        cancelAddAccount();
        goBack(HOME);
      }}
    >
      <Input
        label={t('access.label')}
        value={value}
        onChangeText={(v) => {
          setValue(v);
          setError(null);
        }}
        placeholder={t('access.placeholder')}
        autoCapitalize="none"
        autoCorrect={false}
        left={<KeyRound size={18} color={colors.textMuted} />}
        error={error ?? undefined}
        onSubmitEditing={() => void go(value)}
        returnKeyType="go"
      />
      <Button
        title={t('access.continue')}
        iconRight={<ArrowRight size={18} color="#fff" />}
        loading={!!busy && busy === parseAccessId(value)}
        disabled={!value.trim() || !!busy}
        onPress={() => void go(value)}
      />
      <View style={styles.or}>
        <View style={[styles.line, { backgroundColor: colors.border }]} />
        <Text variant="caption" tone="faint">
          {t('access.or')}
        </Text>
        <View style={[styles.line, { backgroundColor: colors.border }]} />
      </View>
      <Button title={t('access.scan')} variant="secondary" icon={<QrCode size={18} color={colors.primary} />} onPress={() => setScanning(true)} />

      {recent.length ? (
        <View style={{ gap: 8, marginTop: 6 }}>
          <Text variant="micro" tone="faint">
            {t('access.recent').toUpperCase()}
          </Text>
          {recent.map((r, i) => (
            <Pressable
              key={r.id}
              onPress={() => void go(r.id)}
              style={({ pressed }) => [
                styles.recent,
                { borderRadius: radius.md, borderColor: colors.border, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' },
              ]}
            >
              {r.logo ? (
                <Image source={{ uri: r.logo }} style={styles.logo} contentFit="contain" />
              ) : (
                <View style={[styles.logo, { backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }]}>
                  <KeyRound size={16} color={colors.primary} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {r.label && r.label !== r.id ? r.label : t('access.savedProject', { n: i + 1 })}
                </Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {t('access.tapToContinue')}
                </Text>
              </View>
              {busy === r.id ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Pressable
                  hitSlop={10}
                  onPress={() => {
                    forgetAccessId(r.id);
                    setRecent(recentAccessIds());
                  }}
                >
                  <X size={16} color={colors.textFaint} />
                </Pressable>
              )}
            </Pressable>
          ))}
        </View>
      ) : null}

      <Text variant="caption" tone="faint" center>
        {t('access.help')}
      </Text>

      <QrScanner
        open={scanning}
        title={t('access.scanTitle')}
        onClose={() => setScanning(false)}
        onScan={(data) => {
          setScanning(false);
          void go(parseAccessId(data));
        }}
      />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  or: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
  recent: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderWidth: 1 },
  logo: { width: 36, height: 36, borderRadius: 10 },
});

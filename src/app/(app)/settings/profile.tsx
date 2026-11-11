import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Button, Card, Chip, Row, Screen, Text } from '@/components/ui';
import { CountryPicker } from '@/components/ui/CountryPicker';
import { countryByCode } from '@/lib/countries';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuthStore, useMyName } from '@/stores/auth';
import { useAccountCountry, useSettingsStore } from '@/stores/settings';
import { useAccountsStore } from '@/stores/accounts';
import type { CountryCode } from 'libphonenumber-js';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);
  const context = useAuthStore((s) => s.context);
  const signOut = useAuthStore((s) => s.signOut);
  const name = useMyName();
  // Per account: each workspace can be in its own country.
  const activeId = useAccountsStore((s) => s.activeId);
  const country = useAccountCountry(activeId);
  const setAccountCountry = useSettingsStore((s) => s.setAccountCountry);
  const setCountry = (c: CountryCode) => (activeId ? setAccountCountry(activeId, c) : useSettingsStore.getState().setCountry(c));
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const { colors, radius } = useTheme();
  const current = countryByCode(country);

  return (
    <Screen title={t('settings.profile')} back scroll>
      <View style={{ gap: 14, marginTop: 8 }}>
        <Card style={{ alignItems: 'center', gap: 8 }}>
          <Avatar name={name} uri={profile?.avatarUrl} size={72} />
          <Text variant="h2">{name}</Text>
          <Text tone="muted">{profile?.email}</Text>
          <Row gap={6}>
            <Chip label={context?.accountName || 'My workspace'} tone="primary" small />
            <Chip label={context?.isOwner === false ? context.role?.title || 'Member' : 'Owner'} small />
          </Row>
          <Text variant="micro" tone="faint">
            Edit your name, password and 2FA from the web console.
          </Text>
        </Card>
        <Card style={{ gap: 8 }}>
          <Text variant="h3">Default country for numbers</Text>
          <Text variant="caption" tone="muted">
            Numbers typed without a country code are read in this region.
          </Text>
          <Pressable
            onPress={() => setPicking(true)}
            style={({ pressed }) => [styles.select, { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, opacity: pressed ? 0.8 : 1 }]}
          >
            <Text style={{ fontSize: 24 }}>{current?.flag ?? '🌐'}</Text>
            <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
              {current ? current.name : country}
            </Text>
            <Text variant="bodyStrong" tone="muted">
              {current ? `+${current.dial}` : ''}
            </Text>
            <ChevronDown size={18} color={colors.textMuted} />
          </Pressable>
          <CountryPicker
            open={picking}
            value={current}
            title={t('auth.countryCode')}
            onClose={() => setPicking(false)}
            onSelect={(c) => {
              setCountry(c.code);
              setPicking(false);
            }}
          />
        </Card>
        <Button
          title="Sign out"
          variant="danger"
          loading={busy}
          onPress={() => {
            setBusy(true);
            void signOut();
          }}
          style={{ alignSelf: 'center' }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  select: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, height: 54 },
});

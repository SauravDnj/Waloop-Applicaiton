/**
 * One channel: who it is, where it stands, and tabs for everything that can be
 * done with it. Which tabs show depends on the channel's kind (Profile and
 * Templates are WhatsApp's) and on whether its wallet is visible.
 *
 * Desktop web: a page header with the main actions on the right, and each tab
 * laid out in columns; phones: a summary card and stacked tabs.
 */
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ExternalLink, Wallet } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ChannelIcon, ChannelStateBadge, useKindLabel } from '@/components/channels/ChannelBits';
import { ActivityTab, OverviewTab, ProfileTab, SettingsTab, WalletTab } from '@/components/channels/ChannelTabs';
import { TemplateLibrary } from '@/components/whatsapp/TemplateLibrary';
import { Button, Card, EmptyState, Loading, Row, Screen, Text, UnderlineTabs } from '@/components/ui';
import { useChannel, useRefreshChannels } from '@/hooks/channels';
import { useDesktop } from '@/hooks/useDesktop';
import { showAlert } from '@/lib/dialog';
import { channelColor, channelIdentity, channelName, channelType, rechargeUrl, walletBalance, whatsAppManagerUrl, type Channel } from '@/services/crm/channels';
import { describeCrmError } from '@/services/crm/client';
import { useTheme } from '@/theme/ThemeProvider';

type Tab = 'overview' | 'profile' | 'templates' | 'wallet' | 'activity' | 'settings';

const openLink = (get: () => Promise<string>, missing: string) => () =>
  void get()
    .then(async (url) => {
      if (url) await WebBrowser.openBrowserAsync(url);
      else showAlert(missing);
    })
    .catch((err: unknown) => showAlert(missing, describeCrmError(err)));

export default function ChannelScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const channel = useChannel(id);
  const refresh = useRefreshChannels();
  const desktop = useDesktop();
  const kindLabel = useKindLabel();
  const [tab, setTab] = useState<Tab>('overview');

  if (channel.isLoading)
    return (
      <Screen back title={t('channels.title')}>
        <Loading />
      </Screen>
    );
  const c = channel.data;
  if (!c)
    return (
      <Screen back title={t('channels.title')}>
        <EmptyState title={t('channels.notFound')} body={channel.isError ? describeCrmError(channel.error) : undefined} />
      </Screen>
    );

  const type = channelType(c);
  const wa = type === 'whatsapp';
  const tabs: { value: Tab; label: string }[] = [
    { value: 'overview', label: t('channels.tab.overview') },
    ...(wa ? [{ value: 'profile' as Tab, label: t('channels.tab.profile') }] : []),
    ...(wa && c.meta?.support_template !== false ? [{ value: 'templates' as Tab, label: t('whatsapp.templates') }] : []),
    ...(walletBalance(c) != null ? [{ value: 'wallet' as Tab, label: t('channels.tab.wallet') }] : []),
    { value: 'activity', label: t('channels.tab.activity') },
    { value: 'settings', label: t('channels.tab.settings') },
  ];

  return (
    <Screen title={desktop ? undefined : kindLabel(type)} back scroll onRefresh={refresh} maxWidth={1200}>
      <View style={{ gap: desktop ? 20 : 14, marginTop: 8 }}>
        {desktop ? <DesktopHeader channel={c} /> : <MobileHeader channel={c} />}
        <UnderlineTabs value={tab} onChange={setTab} options={tabs} />
        {tab === 'overview' ? <OverviewTab channel={c} /> : null}
        {tab === 'profile' ? <ProfileTab key={c.id} channel={c} /> : null}
        {tab === 'templates' ? <TemplateLibrary channelId={c.id} /> : null}
        {tab === 'wallet' ? <WalletTab channel={c} /> : null}
        {tab === 'activity' ? <ActivityTab channel={c} /> : null}
        {tab === 'settings' ? <SettingsTab key={c.id} channel={c} /> : null}
      </View>
    </Screen>
  );
}

function MobileHeader({ channel: c }: { channel: Channel }) {
  const kindLabel = useKindLabel();
  return (
    <Card>
      <Row gap={12}>
        <ChannelIcon type={channelType(c)} color={channelColor(c)} size={48} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="h3" numberOfLines={1}>
            {channelName(c)}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {[kindLabel(channelType(c)), channelIdentity(c)].filter(Boolean).join(' · ')}
          </Text>
          <ChannelStateBadge channel={c} />
        </View>
      </Row>
    </Card>
  );
}

function DesktopHeader({ channel: c }: { channel: Channel }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const kindLabel = useKindLabel();
  const wa = channelType(c) === 'whatsapp';
  return (
    <Row gap={18} style={styles.desktopHeader}>
      <ChannelIcon type={channelType(c)} color={channelColor(c)} size={64} />
      <View style={{ flex: 1, gap: 6 }}>
        <Text variant="h1" numberOfLines={1} accessibilityRole="header">
          {channelName(c)}
        </Text>
        <Row gap={10} style={{ flexWrap: 'wrap' }}>
          <Text tone="muted">{[kindLabel(channelType(c)), channelIdentity(c)].filter(Boolean).join(' · ')}</Text>
          <ChannelStateBadge channel={c} />
        </Row>
      </View>
      {wa ? (
        <Button
          title={t('channels.openManager')}
          variant="secondary"
          icon={<ExternalLink size={16} color={colors.text} />}
          onPress={openLink(() => whatsAppManagerUrl(c.id), t('common.errorTitle'))}
        />
      ) : null}
      {walletBalance(c) != null ? (
        <Button
          title={t('channels.topUp')}
          icon={<Wallet size={16} color={colors.onPrimary} />}
          onPress={openLink(() => rechargeUrl(c.id), t('channels.noTopUp'))}
        />
      ) : null}
    </Row>
  );
}

const styles = StyleSheet.create({
  desktopHeader: { paddingVertical: 4 },
});

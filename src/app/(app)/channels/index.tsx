/**
 * Channels: every number and inbox the workspace sends and receives on, of any
 * type. Channels are connected outside the app; here they are managed.
 */
import { router } from 'expo-router';
import { Check, ChevronRight, Radio } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { ChannelIcon, ChannelStateBadge, useKindLabel } from '@/components/channels/ChannelBits';
import { Card, Chip, Divider, EmptyState, Loading, Row, Screen, Text } from '@/components/ui';
import { useChannels, useRefreshChannels } from '@/hooks/channels';
import { formatMoney } from '@/lib/money';
import { rtlFlip } from '@/lib/rtl';
import { channelColor, channelIdentity, channelName, channelType, sortKinds, walletBalance, type Channel, type ChannelKind } from '@/services/crm/channels';
import { useDesktop } from '@/hooks/useDesktop';
import { describeCrmError } from '@/services/crm/client';
import { useWhatsAppConfig } from '@/stores/whatsapp';
import { useTheme } from '@/theme/ThemeProvider';
import { RequireCan } from '@/components/RequireCan';
import { P } from '@/lib/permissions';

function ChannelsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const channels = useChannels();
  const refresh = useRefreshChannels();
  const defaultId = useWhatsAppConfig().channelId;
  const [type, setType] = useState<ChannelKind | 'all'>('all');
  const kindLabel = useKindLabel();
  const desktop = useDesktop();

  const present = useMemo(() => sortKinds((channels.data ?? []).map(channelType)), [channels.data]);
  const shown = (channels.data ?? []).filter((c) => type === 'all' || channelType(c) === type);

  return (
    // Desktop reaches this page from the sidebar, so it needs no back button.
    <Screen
      title={t('channels.title')}
      subtitle={t('channels.subtitle')}
      back={!desktop}
      scroll
      onRefresh={refresh}
      maxWidth={1200}
    >
      <View style={{ gap: 14, marginTop: 8 }}>
        {present.length > 1 ? (
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            <Chip label={t('common.all')} selected={type === 'all'} onPress={() => setType('all')} />
            {present.map((ty) => (
              <Chip key={ty} label={kindLabel(ty)} selected={type === ty} onPress={() => setType(ty)} />
            ))}
          </Row>
        ) : null}

        {channels.isLoading ? (
          <Loading />
        ) : channels.isError ? (
          <EmptyState
            title={t('common.errorTitle')}
            body={describeCrmError(channels.error)}
            action={t('common.retry')}
            onAction={() => void channels.refetch()}
          />
        ) : !shown.length ? (
          <EmptyState
            icon={<Radio size={28} color={colors.primary} />}
            title={t('channels.emptyTitle')}
            body={t('channels.emptyManaged')}
          />
        ) : desktop ? (
          // Desktop: a grid of channel cards.
          <View style={styles.grid}>
            {shown.map((c) => (
              <ChannelTile key={c.id} channel={c} isDefault={channelType(c) === 'whatsapp' && c.id === defaultId} />
            ))}
          </View>
        ) : (
          <Card padded={false}>
            {shown.map((c, i) => {
              const balance = walletBalance(c);
              const isDefault = channelType(c) === 'whatsapp' && c.id === defaultId;
              return (
                <View key={c.id}>
                  <Pressable
                    onPress={() => openChannel(c.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`${channelName(c)}, ${kindLabel(channelType(c))}`}
                    style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}
                  >
                    <ChannelIcon type={channelType(c)} color={channelColor(c)} />
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text variant="bodyStrong" numberOfLines={1}>
                        {channelName(c)}
                      </Text>
                      <Text variant="caption" tone="muted" numberOfLines={1}>
                        {[kindLabel(channelType(c)), channelIdentity(c)].filter(Boolean).join(' · ')}
                      </Text>
                      <ChannelMeta channel={c} isDefault={isDefault} balance={balance} />
                    </View>
                    <ChevronRight size={18} color={colors.textFaint} style={rtlFlip()} />
                  </Pressable>
                  {i < shown.length - 1 ? <Divider inset={64} /> : null}
                </View>
              );
            })}
          </Card>
        )}
      </View>
    </Screen>
  );
}

const openChannel = (id: string) => router.push({ pathname: '/(app)/channels/[id]', params: { id } });

/** Status, default and balance, under a channel's name. */
function ChannelMeta({ channel: c, isDefault, balance }: { channel: Channel; isDefault: boolean; balance: number | null }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Row gap={6} style={{ flexWrap: 'wrap' }}>
      <ChannelStateBadge channel={c} />
      {isDefault ? (
        <Row gap={3}>
          <Check size={12} color={colors.primary} />
          <Text variant="micro" tone="primary">
            {t('whatsapp.default')}
          </Text>
        </Row>
      ) : null}
      {balance != null ? (
        <Text variant="micro" tone={balance < 0 ? 'danger' : 'faint'}>
          {t('channels.balance', { amount: formatMoney(balance, c.wallet.currency) })}
        </Text>
      ) : null}
    </Row>
  );
}

/** Desktop: one channel as a card in the grid. */
function ChannelTile({ channel: c, isDefault }: { channel: Channel; isDefault: boolean }) {
  const { colors, radius } = useTheme();
  const kindLabel = useKindLabel();
  return (
    <Pressable
      onPress={() => openChannel(c.id)}
      accessibilityRole="button"
      accessibilityLabel={`${channelName(c)}, ${kindLabel(channelType(c))}`}
      style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [
        styles.tile,
        {
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          borderColor: hovered ? colors.primary : colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Row gap={12}>
        <ChannelIcon type={channelType(c)} color={channelColor(c)} size={48} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="h3" numberOfLines={1}>
            {channelName(c)}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {kindLabel(channelType(c))}
          </Text>
        </View>
      </Row>
      <Text numberOfLines={1}>{channelIdentity(c) || ' '}</Text>
      <ChannelMeta channel={c} isDefault={isDefault} balance={walletBalance(c)} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  tile: { flexBasis: 300, flexGrow: 1, maxWidth: 380, gap: 12, padding: 18, borderWidth: 1 },
});

/** Members whose role can't open this page get a short explanation instead. */
export default function ChannelsScreenGate() {
  return (
    <RequireCan any={[...P.channelsAny]}>
      <ChannelsScreen />
    </RequireCan>
  );
}

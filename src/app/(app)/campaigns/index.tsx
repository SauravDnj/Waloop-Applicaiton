/**
 * Campaigns tab: a summary of what is scheduled, sending and done, then every
 * campaign (newest first, by state, searchable). Each card says which template
 * on which channel, when it goes (or went) out, to how many, and, once it has
 * run, how many read and replied. Opens a campaign's report, or starts a new one.
 */
import type { Campaign, CampaignStatus } from '@ab-ecosystem/cpaas';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { CalendarClock, CheckCheck, FileText, Megaphone, MessageCircleReply, Plus, Radio, Repeat, Send, Users } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { campaignKeys, useStateColor } from '@/components/campaigns/shared';
import { TAB_BAR_SPACE } from '@/components/navigation/FloatingTabBar';
import { Button, Card, EmptyState, Hero, HeroButton, Row, SearchField, StatTile, StatusPill, Text, UnderlineTabs } from '@/components/ui';
import { RequireCan } from '@/components/RequireCan';
import { useWaChannels } from '@/hooks/queries';
import { useDesktop } from '@/hooks/useDesktop';
import { usePullRefresh } from '@/hooks/usePullRefresh';
import { P } from '@/lib/permissions';
import { campaignRan, campaignState, campaignStats, listCampaigns, type CampaignState } from '@/services/crm/campaigns';
import { describeCrmError } from '@/services/crm/client';
import { useCan } from '@/stores/auth';
import { useTheme } from '@/theme/ThemeProvider';

const FILTERS: (CampaignStatus | 'all')[] = ['all', 'pending', 'processing', 'completed', 'failed', 'cancelled'];

const templateOf = (c: Campaign) => (c.messages?.[0]?.message as { template?: { name?: string } } | undefined)?.template?.name ?? '';
const channelOf = (c: Campaign) => c.messages?.[0]?.channel?.id ?? '';
const fmt = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

function CampaignsScreen() {
  const { t } = useTranslation();
  const { colors, radius, shadow } = useTheme();
  const canCreate = useCan(P.campaigns.create);
  const desktop = useDesktop();
  const [status, setStatus] = useState<CampaignStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const q = useInfiniteQuery({
    queryKey: campaignKeys.list(status),
    queryFn: ({ pageParam }) => listCampaigns({ status: status === 'all' ? undefined : status, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  // The summary counts every campaign, whatever the tab shows.
  const everything = useInfiniteQuery({
    queryKey: campaignKeys.list('all'),
    queryFn: ({ pageParam }) => listCampaigns({ cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const pull = usePullRefresh(() => Promise.all([q.refetch(), everything.refetch()]));
  const channels = useWaChannels();
  const channelName = (id: string) => channels.data?.find((c) => c.id === id)?.name ?? '';

  const items = useMemo(() => {
    // The status is also checked here: the server has been seen to return every campaign whatever the filter.
    const all = (q.data?.pages.flatMap((p) => p.data) ?? []).filter((c) => status === 'all' || c.status === status);
    const term = search.trim().toLowerCase();
    return term ? all.filter((c) => c.name.toLowerCase().includes(term) || templateOf(c).toLowerCase().includes(term)) : all;
  }, [q.data, search, status]);

  const summary = useMemo(() => {
    const counts: Record<CampaignState, number> = { draft: 0, scheduled: 0, sending: 0, completed: 0, failed: 0, cancelled: 0 };
    for (const c of everything.data?.pages.flatMap((p) => p.data) ?? []) counts[campaignState(c)] += 1;
    return counts;
  }, [everything.data]);
  const loadedAll = everything.data?.pages.reduce((n, p) => n + p.data.length, 0) ?? 0;

  // There is no server-side search (and the status filter may be ignored): while a search or tab
  // finds nothing, older pages are fetched (up to 10).
  const autoPages = useRef(0);
  const term = search.trim();
  useEffect(() => {
    autoPages.current = 0;
  }, [term, status]);
  useEffect(() => {
    if ((!term && status === 'all') || items.length || !q.hasNextPage || q.isFetchingNextPage || autoPages.current >= 10) return;
    autoPages.current += 1;
    void q.fetchNextPage();
  }, [term, status, items.length, q]);
  const searchingOlder = (!!term || status !== 'all') && !items.length && q.isFetchingNextPage;

  const tabs = FILTERS.map((f) => ({ value: f, label: t(`camp.filter.${f}`) }));

  const header = (
    <View>
      <Hero
        title={t('camp.title')}
        subtitle={t('camp.sub')}
        right={
          canCreate ? (
            <HeroButton label={t('camp.new')} onPress={() => router.push('/(app)/campaigns/new')}>
              <Plus size={18} color="#fff" />
            </HeroButton>
          ) : undefined
        }
        overlap={<SearchField value={search} onChangeText={setSearch} placeholder={t('camp.search')} elevated />}
      />

      <View style={[styles.body, desktop && styles.bodyWide]}>
        {/* What is going on right now, at a glance. */}
        <View style={styles.tiles}>
          <StatTile
            icon={<CalendarClock size={18} color={colors.warning} />}
            tint={colors.warning}
            value={String(summary.scheduled)}
            label={t('camp.state.scheduled')}
            style={[styles.tile, { backgroundColor: colors.surface, borderRadius: radius.lg }, shadow.card]}
          />
          <StatTile icon={<Send size={18} color={colors.primary} />} tint={colors.primary} value={String(summary.sending)} label={t('camp.state.sending')} style={[styles.tile, { backgroundColor: colors.surface, borderRadius: radius.lg }, shadow.card]} />
          <StatTile
            icon={<CheckCheck size={18} color={colors.success} />}
            tint={colors.success}
            value={String(summary.completed)}
            label={t('camp.state.completed')}
            style={[styles.tile, { backgroundColor: colors.surface, borderRadius: radius.lg }, shadow.card]}
          />
          <StatTile icon={<FileText size={18} color={colors.textMuted} />} tint={colors.textMuted} value={String(summary.draft)} label={t('camp.state.draft')} style={[styles.tile, { backgroundColor: colors.surface, borderRadius: radius.lg }, shadow.card]} />
        </View>

        {everything.hasNextPage ? (
          <Text variant="micro" tone="faint" style={{ marginTop: -6 }}>
            {t('camp.summaryOfLatest', { count: loadedAll })}
          </Text>
        ) : null}

        <UnderlineTabs value={status} options={tabs} onChange={setStatus} />

        {q.isLoading ? <ActivityIndicator color={colors.primary} style={{ padding: 24 }} /> : null}
        {q.error && !q.data ? (
          <EmptyState title={t('common.errorTitle')} body={describeCrmError(q.error)} action={t('common.retry')} onAction={() => void q.refetch()} />
        ) : null}
        {!q.isLoading && !q.error && !items.length && !searchingOlder ? (
          <EmptyState
            icon={<Megaphone size={26} color="#fff" />}
            title={search ? t('camp.noMatch') : t('camp.empty')}
            body={search ? undefined : t('camp.emptyBody')}
            action={canCreate && !search ? t('camp.new') : undefined}
            onAction={canCreate && !search ? () => router.push('/(app)/campaigns/new') : undefined}
          />
        ) : null}
      </View>
    </View>
  );

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      data={items}
      keyExtractor={(c) => c.id}
      // Only cards near the screen mount, so only they load their delivery numbers.
      renderItem={({ item }) => (
        <View style={[styles.item, desktop && styles.itemWide]}>
          <CampaignCard campaign={item} channel={channelName(channelOf(item))} />
        </View>
      )}
      ListHeaderComponent={header}
      ListFooterComponent={
        <View style={[styles.item, desktop && styles.itemWide, { paddingBottom: TAB_BAR_SPACE + 24 }]}>
          {searchingOlder ? (
            <Row gap={8} style={{ justifyContent: 'center', padding: 12 }}>
              <ActivityIndicator color={colors.primary} />
              <Text variant="caption" tone="muted">
                {t('camp.searchingOlder')}
              </Text>
            </Row>
          ) : null}
          {q.hasNextPage && !searchingOlder ? (
            <Button variant="secondary" title={t('camp.loadMore')} loading={q.isFetchingNextPage} onPress={() => void q.fetchNextPage()} />
          ) : null}
        </View>
      }
      refreshing={pull.refreshing}
      onRefresh={() => void pull.onRefresh()}
      showsVerticalScrollIndicator={false}
    />
  );
}

function CampaignCard({ campaign: c, channel }: { campaign: Campaign; channel: string }) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const stateColor = useStateColor();
  const state = campaignState(c);
  const ran = campaignRan(c);
  // Delivery numbers for campaigns that have gone out (kept a minute; the report has the live ones).
  const stats = useQuery({ queryKey: campaignKeys.stats(c.id), queryFn: () => campaignStats(c.id), enabled: ran, staleTime: 5 * 60_000 });
  const s = stats.data;
  const rate = (n: number) => (s?.total ? Math.round((n / s.total) * 100) : 0);
  const when =
    state === 'scheduled' && c.scheduledAt
      ? t('camp.whenScheduled', { when: fmt(c.scheduledAt) })
      : state === 'completed' && c.completedAt
        ? t('camp.whenDone', { when: fmt(c.completedAt) })
        : state === 'sending' && c.processedAt
          ? t('camp.whenStarted', { when: fmt(c.processedAt) })
          : t('camp.whenCreated', { when: fmt(c.createdAt) });
  const template = templateOf(c);

  return (
    <Pressable onPress={() => router.push({ pathname: '/(app)/campaigns/[id]', params: { id: c.id } })}>
      <Card style={{ gap: 10 }}>
        <Row style={{ justifyContent: 'space-between' }} gap={8}>
          <View style={[styles.icon, { backgroundColor: `${stateColor(state)}1F`, borderRadius: radius.md }]}>
            <Megaphone size={18} color={stateColor(state)} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {c.name}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {when}
            </Text>
          </View>
          <StatusPill label={t(`camp.state.${state}`)} color={stateColor(state)} />
        </Row>

        <Row gap={12} style={{ flexWrap: 'wrap' }}>
          {template ? <Meta icon={<FileText size={13} color={colors.textMuted} />} text={template} /> : null}
          {channel ? <Meta icon={<Radio size={13} color={colors.textMuted} />} text={channel} /> : null}
          {c.receivers ? <Meta icon={<Users size={13} color={colors.textMuted} />} text={t('camp.recipients', { count: c.receivers })} /> : null}
          {c.isRepeating && c.repeat ? (
            <Meta icon={<Repeat size={13} color={colors.textMuted} />} text={t(`camp.rep.${c.repeat.unit}`, { defaultValue: c.repeat.unit })} />
          ) : null}
          {c.type === 'retarget' ? (
            <Text variant="caption" tone="primary">
              {t('camp.retargetTag')}
            </Text>
          ) : null}
        </Row>

        {s?.total ? (
          // Sent → read → replied, as one bar and three numbers.
          <View style={{ gap: 6 }}>
            <View style={[styles.bar, { backgroundColor: colors.surfaceAlt }]}>
              <View style={{ width: `${rate(s.delivered)}%`, backgroundColor: colors.accent }} />
            </View>
            <Row gap={14} style={{ flexWrap: 'wrap', rowGap: 4 }}>
              <Rate icon={<CheckCheck size={13} color={colors.accent} />} label={t('camp.stat.delivered')} value={rate(s.delivered)} />
              <Rate icon={<CheckCheck size={13} color={colors.success} />} label={t('camp.stat.read')} value={rate(s.read)} />
              <Rate icon={<MessageCircleReply size={13} color={colors.warning} />} label={t('camp.stat.replied')} value={rate(s.replied)} />
              {s.failed ? (
                <Text variant="caption" tone="danger">
                  {t('camp.failedN', { count: s.failed })}
                </Text>
              ) : null}
            </Row>
          </View>
        ) : null}

        {c.error ? (
          <Text variant="caption" tone="danger" numberOfLines={2}>
            {c.error}
          </Text>
        ) : null}
      </Card>
    </Pressable>
  );
}

function Meta({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <Row gap={4} style={{ maxWidth: '100%' }}>
      {icon}
      <Text variant="caption" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
        {text}
      </Text>
    </Row>
  );
}

function Rate({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Row gap={4}>
      {icon}
      <Text variant="caption" tone="muted">
        {label}{' '}
      </Text>
      <Text variant="caption" style={{ fontWeight: '700' }}>
        {value}%
      </Text>
    </Row>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, gap: 14, marginTop: 16 },
  bodyWide: { paddingHorizontal: 24 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexBasis: '22%', flexGrow: 1, minWidth: 140 },
  item: { paddingHorizontal: 16, paddingBottom: 10 },
  itemWide: { paddingHorizontal: 24, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  icon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  bar: { height: 6, borderRadius: 3, overflow: 'hidden', flexDirection: 'row' },
});

/** Members whose role can't open this page get a short explanation instead. */
export default function CampaignsScreenGate() {
  return (
    <RequireCan any={[P.campaigns.list]}>
      <CampaignsScreen />
    </RequireCan>
  );
}

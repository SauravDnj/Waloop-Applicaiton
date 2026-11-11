/**
 * Contacts. Hero with count and an overlapping search; a sideways row of
 * quick filters (saved segments, then tags); clean rows with a WhatsApp button; long-press to
 * multi-select for bulk edit, delete or a campaign.
 */
import { FlashList } from '@shopify/flash-list';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Layers, ListFilter, Megaphone, PencilLine, Trash2, UserPlus, Users, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { BulkEditSheet } from '@/components/leads/BulkEditSheet';
import { tagLabel } from '@/components/leads/ContactChips';
import { FilterSheet } from '@/components/leads/FilterSheet';
import { LeadCard } from '@/components/leads/LeadCard';
import { LeadTableHeader, LeadTableRow } from '@/components/leads/LeadTable';
import { useDesktop } from '@/hooks/useDesktop';
import { TAB_BAR_SPACE } from '@/components/navigation/FloatingTabBar';
import { Button, Chip, EmptyState, Hero, HeroButton, Loading, Row, SearchField, Text } from '@/components/ui';
import { ChipRow } from '@/components/ui/ChipRow';
import { useLeads, useSegments, useTags } from '@/hooks/queries';
import { countActiveFilters, type LeadFilter } from '@/lib/filters';
import { P } from '@/lib/permissions';
import { trashLead, type Lead } from '@/services/crm/leads';
import { confirmAction, showAlert } from '@/lib/dialog';
import { useTheme } from '@/theme/ThemeProvider';
import { useCan, useCanAny } from '@/stores/auth';
import { RequireCan } from '@/components/RequireCan';

const hex = (c?: string) => !!c && /^#[0-9a-f]{6}$/i.test(c);

function LeadsScreen() {
  const { t } = useTranslation();
  const { colors, radius, shadow } = useTheme();
  const [filter, setFilter] = useState<LeadFilter>({});
  const [search, setSearch] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  // What the role allows here (owners: everything).
  const can = {
    create: useCan(P.contacts.create),
    update: useCan(P.contacts.update),
    delete: useCan(P.contacts.delete),
    trash: useCanAny([P.contacts.update, P.contacts.delete]),
    campaign: useCan(P.campaigns.create),
  };
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignOpen, setAssignOpen] = useState(false);
  const tags = useTags();
  const segments = useSegments();

  const desktop = useDesktop();
  const effective = useMemo<LeadFilter>(() => {
    return { ...filter, search: search.trim() || undefined };
  }, [filter, search]);

  const leads = useLeads(effective);
  // A selection belongs to the list it was made in: a new search, tab or filter starts it afresh,
  // so a bulk action never touches contacts that are no longer on screen.
  const [selectedFor, setSelectedFor] = useState(effective);
  if (selectedFor !== effective) {
    setSelectedFor(effective);
    if (selected.size) setSelected(new Set());
  }
  const items = useMemo(() => leads.data?.pages.flatMap((p) => p.leads) ?? [], [leads.data]);
  const total = leads.data?.pages[0]?.total ?? 0;
  const activeCount = countActiveFilters(filter);
  const selecting = selected.size > 0;
  const narrowed = activeCount > 0 || !!search;

  const qc = useQueryClient();
  // Moves the selected leads to the trash (restorable from Leads → Trash).
  const deleteSelected = async () => {
    const ids = [...selected];
    const ok = await confirmAction({
      title: t('trash.deleteManyQ', { count: ids.length }),
      message: t('trash.deleteLeadBody'),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    const results = await Promise.allSettled(ids.map((id) => trashLead(id)));
    setSelected(new Set());
    ids.forEach((id) => qc.removeQueries({ queryKey: ['lead', id] }));
    void qc.invalidateQueries({ queryKey: ['leads'] });
    void qc.invalidateQueries({ queryKey: ['board'] });
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed) showAlert(t('trash.someFailed', { count: failed }));
  };

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  // Quick filters: one saved segment at a time, any number of tags (the filter sheet has the rest).
  const pickSegment = (id: string) => setFilter((f) => ({ ...f, segment: f.segment === id ? undefined : id }));
  const toggleTag = (id: string) =>
    setFilter((f) => {
      const next = f.tags?.includes(id) ? f.tags.filter((x) => x !== id) : [...(f.tags ?? []), id];
      return { ...f, tags: next.length ? next : undefined };
    });
  const quickCount = (segments.data?.length ?? 0) + (tags.data?.length ?? 0);

  const header = (
    <View>
      <Hero
        title={t('leads.title')}
        subtitle={leads.isLoading ? t('common.loading') : narrowed ? t('leads.matching', { count: total }) : t('leads.total', { count: total })}
        right={
          <Row gap={8}>
            {/* A campaign to the list on screen (its filters and type); desktop has it beside the type bar. */}
            {can.campaign && !desktop && items.length ? (
              <HeroButton
                label={t('camp.short')}
                onPress={() => router.push({ pathname: '/(app)/campaigns/new', params: { filter: JSON.stringify(effective) } })}
              >
                <Megaphone size={18} color="#fff" />
              </HeroButton>
            ) : null}
            {can.create ? (
              <HeroButton label={t('leads.addLead')} onPress={() => router.push('/(app)/lead/new')}>
                <UserPlus size={18} color="#fff" />
              </HeroButton>
            ) : null}
            {can.trash ? (
              <HeroButton label={t('trash.title')} onPress={() => router.push('/(app)/trash')}>
                <Trash2 size={18} color="#fff" />
              </HeroButton>
            ) : null}
          </Row>
        }
        overlap={
          <Row gap={10}>
            <View style={{ flex: 1 }}>
              <SearchField value={search} onChangeText={setSearch} placeholder={t('leads.searchPlaceholder')} elevated />
            </View>
            <Pressable
              onPress={() => setShowFilter(true)}
              style={[
                styles.filterBtn,
                shadow.card,
                {
                  backgroundColor: activeCount ? colors.primary : colors.surface,
                  borderRadius: radius.md,
                },
              ]}
            >
              <ListFilter size={20} color={activeCount ? colors.onPrimary : colors.text} />
              {activeCount ? (
                <View style={[styles.badge, { backgroundColor: colors.danger }]}>
                  <Text variant="micro" style={{ color: '#fff' }}>
                    {activeCount}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          </Row>
        }
      />
      {quickCount || (desktop && can.campaign && items.length) ? (
        <Row gap={8} style={{ marginTop: 12, paddingEnd: desktop ? 16 : 0, alignItems: 'center' }}>
          <View style={{ flex: 1, minWidth: 0, marginStart: 16 }}>
            {quickCount ? (
              <ChipRow>
                <Chip
                  small
                  label={t('common.all')}
                  selected={!filter.segment && !filter.tags?.length}
                  onPress={() => setFilter((f) => ({ ...f, segment: undefined, tags: undefined }))}
                />
                {segments.data?.map((sg) => (
                  <Chip
                    key={sg.id}
                    small
                    label={sg.name}
                    tone="accent"
                    icon={<Layers size={12} color={filter.segment === sg.id ? colors.primary : colors.accent} />}
                    selected={filter.segment === sg.id}
                    onPress={() => pickSegment(sg.id)}
                  />
                ))}
                {tags.data?.map((tg) => (
                  <Chip
                    key={tg.id}
                    small
                    label={tagLabel(tg)}
                    color={hex(tg.color) ? tg.color : undefined}
                    selected={!!filter.tags?.includes(tg.id)}
                    onPress={() => toggleTag(tg.id)}
                  />
                ))}
              </ChipRow>
            ) : null}
          </View>
          {/* Desktop: a campaign to the list on screen sits beside the filters. */}
          {desktop && can.campaign && items.length ? (
            <Button
              title={t('camp.short')}
              size="sm"
              variant="secondary"
              icon={<Megaphone size={14} color={colors.primary} />}
              onPress={() => router.push({ pathname: '/(app)/campaigns/new', params: { filter: JSON.stringify(effective) } })}
            />
          ) : null}
        </Row>
      ) : null}
      <View style={{ height: 10 }} />
      {desktop && items.length ? (
        <LeadTableHeader
          allSelected={items.length > 0 && items.every((l) => selected.has(l.id))}
          onSelectAll={() => setSelected(items.every((l) => selected.has(l.id)) ? new Set() : new Set(items.map((l) => l.id)))}
        />
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlashList<Lead>
        data={items}
        keyExtractor={(l) => l.id}
        renderItem={({ item }) =>
          desktop ? (
            <LeadTableRow lead={item} selecting={selecting} selected={selected.has(item.id)} onSelect={() => toggle(item.id)} />
          ) : (
            <View style={[styles.rowWrap, { backgroundColor: colors.surface }]}>
              <LeadCard lead={item} selecting={selecting} selected={selected.has(item.id)} onSelect={() => toggle(item.id)} />
            </View>
          )
        }
        ListHeaderComponent={header}
        onEndReached={() => leads.hasNextPage && !leads.isFetchingNextPage && leads.fetchNextPage()}
        onEndReachedThreshold={0.6}
        ListFooterComponent={leads.isFetchingNextPage ? <Loading /> : <View style={{ height: TAB_BAR_SPACE + 80 }} />}
        ListEmptyComponent={
          leads.isLoading ? (
            <Loading label={t('common.loading')} />
          ) : leads.isError ? (
            <EmptyState
              title={t('leads.loadFailed')}
              body={String((leads.error as Error)?.message ?? '')}
              action={t('common.retry')}
              onAction={() => void leads.refetch()}
            />
          ) : (
            <EmptyState
              icon={<Users size={30} color="#fff" />}
              title={narrowed ? t('leads.noMatchTitle') : t('leads.emptyTitle')}
              body={narrowed ? t('leads.noMatchBody') : t('leads.emptyBody')}
              action={narrowed ? t('leads.clearFilters') : can.create ? t('leads.addLead') : undefined}
              onAction={() => {
                if (narrowed) {
                  setFilter({});
                  setSearch('');
                } else router.push('/(app)/lead/new');
              }}
            />
          )
        }
        refreshing={leads.isRefetching && !leads.isFetchingNextPage}
        onRefresh={() => void leads.refetch()}
        showsVerticalScrollIndicator={false}
      />

      {selecting ? (
        <View
          style={[
            styles.bulkBar,
            shadow.floating,
            { backgroundColor: colors.surface, bottom: TAB_BAR_SPACE + 12 },
            desktop && { start: undefined, width: 640, alignSelf: 'center' },
          ]}
        >
          <Pressable onPress={() => setSelected(new Set())} hitSlop={10}>
            <X size={20} color={colors.textMuted} />
          </Pressable>
          <Text variant="bodyStrong" style={{ flex: 1 }}>
            {t('leads.selected', { count: selected.size })}
          </Text>
          {/* Change type / status / fields / tags, or assign, on all selected. */}
          {can.update ? (
            <Button
              title={t('bulk.edit')}
              size="sm"
              variant="secondary"
              onPress={() => setAssignOpen(true)}
              icon={<PencilLine size={14} color={colors.primary} />}
            />
          ) : null}
          {can.delete ? (
            <Pressable
              onPress={() => void deleteSelected()}
              hitSlop={8}
              style={{ padding: 6 }}
              accessibilityRole="button"
              accessibilityLabel={t('common.delete')}
            >
              <Trash2 size={18} color={colors.danger} />
            </Pressable>
          ) : null}
          {can.campaign ? (
            <Button
              title={t('camp.short')}
              size="sm"
              variant="secondary"
              icon={<Megaphone size={14} color={colors.primary} />}
              onPress={() => router.push({ pathname: '/(app)/campaigns/new', params: { leadIds: [...selected].join(',') } })}
            />
          ) : null}
        </View>
      ) : null}

      <FilterSheet
        open={showFilter}
        value={filter}
        onClose={() => setShowFilter(false)}
        onApply={(f) => {
          setFilter(f);
          setShowFilter(false);
        }}
      />
      {assignOpen ? (
        <BulkEditSheet
          ids={[...selected]}
          leads={items.filter((l) => selected.has(l.id))}
          onClose={(changed) => {
            setAssignOpen(false);
            if (changed) setSelected(new Set());
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  filterBtn: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    end: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  rowWrap: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 18,
    overflow: 'hidden',
  },
  bulkBar: {
    position: 'absolute',
    start: 16,
    end: 16,
    borderRadius: 22,
    padding: 10,
    paddingStart: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});

/** Members whose role can't open this page get a short explanation instead. */
export default function LeadsScreenGate() {
  return (
    <RequireCan any={[P.contacts.list]}>
      <LeadsScreen />
    </RequireCan>
  );
}

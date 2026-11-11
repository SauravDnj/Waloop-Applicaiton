/**
 * One board: a dropdown field marked as a board; each option is a column.
 * Cards open WhatsApp or move the contact to another column.
 */
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { ArrowRightLeft, MessageCircle } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ContactChips } from '@/components/leads/ContactChips';
import { useBoards, type Board } from '@/hooks/boards';
import { EmptyState, Loading, Row, Screen, SegmentedControl, Sheet, Text, useOptionColor } from '@/components/ui';
import { useUpdateLead } from '@/hooks/queries';
import { usePullRefresh } from '@/hooks/usePullRefresh';
import { messageOnWhatsApp } from '@/lib/actions';
import { showAlert } from '@/lib/dialog';
import { formatPhone } from '@/lib/phone';
import { describeCrmError } from '@/services/crm/client';
import { fieldText, listLeadsByField, type BoardColumn, type Lead } from '@/services/crm/leads';
import { MAX_CONDITIONS } from '@/lib/filters';
import { useTabBarInset } from '@/components/navigation/FloatingTabBar';
import { useTheme } from '@/theme/ThemeProvider';
import { openContact } from '@/stores/contactPanel';
import { LeadTableHeader, LeadTableRow } from '@/components/leads/LeadTable';
import { useDesktop } from '@/hooks/useDesktop';

export default function BoardView() {
  const { t } = useTranslation();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { boards, isLoading } = useBoards();
  const board = boards.find((b) => b.slug === slug);
  if (!board)
    return (
      <Screen title={t('board.title')} back>
        {isLoading ? <Loading /> : <EmptyState title={t('board.notFound')} />}
      </Screen>
    );
  return (
    <Screen title={board.label} subtitle={t('board.sub')} back padded={false} wide>
      <BoardColumns key={board.slug} board={board} />
    </Screen>
  );
}

function BoardColumns({ board }: { board: Board }) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const colWidth = Math.min(320, Math.max(260, width * 0.82));
  const barInset = useTabBarInset();
  // Each option, then "Not set", then "Other" for values that are no longer options (if the filter fits).
  const all: { key: string; value: string; label: string; col: BoardColumn }[] = [
    ...board.options.map((value) => ({ key: `o:${value}`, value, label: value, col: { kind: 'option' as const, value } })),
    { key: '__none', value: '', label: t('board.notSet'), col: { kind: 'unset' } },
    ...(board.options.length < MAX_CONDITIONS
      ? [{ key: '__other', value: '__other', label: t('board.other'), col: { kind: 'other' as const, options: board.options } }]
      : []),
  ];
  const allResults = useQueries({
    queries: all.map((c) => ({
      queryKey: c.col.kind === 'other' ? ['board', board.slug, c.key, board.options.join('\u0000')] : ['board', board.slug, c.key],
      queryFn: () => listLeadsByField(board.slug, c.col),
      staleTime: 30_000,
    })),
  });
  // "Other" only shows when some contact actually holds an old value.
  const shown = all.map((c, i) => ({ c, r: allResults[i] })).filter(({ c, r }) => c.key !== '__other' || (r?.data?.total ?? 0) > 0);
  const columns = shown.map((x) => x.c);
  const results = shown.map((x) => x.r);
  const [moving, setMoving] = useState<Lead | null>(null);
  const qc = useQueryClient();
  const pull = usePullRefresh(() => qc.invalidateQueries({ queryKey: ['board', board.slug] }));
  const desktop = useDesktop();
  const [view, setView] = useState<'board' | 'list'>('board');
  const { colors } = useTheme();
  const optionColor = useOptionColor();

  // Desktop: a list grouped by column, as an alternative to the columns.
  const list =
    desktop && view === 'list' ? (
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <LeadTableHeader allSelected={false} onSelectAll={() => undefined} />
        {columns.map((c, i) => {
          const rows = results[i]?.data?.leads ?? [];
          return (
            <View key={c.key} style={{ marginTop: 14 }}>
              <Row gap={8} style={{ paddingHorizontal: 32, paddingVertical: 6 }}>
                <View style={[styles.dot, { backgroundColor: optionColor(c.value) }]} />
                <Text variant="bodyStrong">{c.label}</Text>
                <Text variant="caption" tone="muted">
                  {results[i]?.data?.total ?? 0}
                </Text>
                {results[i]?.isLoading ? <ActivityIndicator size="small" color={colors.primary} /> : null}
              </Row>
              {rows.map((l) => (
                <LeadTableRow key={l.id} lead={l} selected={false} selecting={false} onSelect={() => undefined} />
              ))}
            </View>
          );
        })}
      </ScrollView>
    ) : null;

  return (
    <>
      {desktop ? (
        <Row gap={8} style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <View style={{ width: 240 }}>
            <SegmentedControl
              value={view}
              onChange={setView}
              options={[
                { value: 'board', label: t('board.viewBoard') },
                { value: 'list', label: t('board.viewList') },
              ]}
            />
          </View>
        </Row>
      ) : null}
      {list ?? (
        <ScrollView
          horizontal
          snapToInterval={colWidth + 12}
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.columns, { paddingBottom: barInset + 28 }]}
        >
          {columns.map((c, i) => (
            <Column
              key={c.key}
              width={colWidth}
              value={c.value}
              label={c.label}
              leads={results[i]?.data?.leads ?? []}
              total={results[i]?.data?.total ?? 0}
              loading={!!results[i]?.isLoading}
              error={results[i]?.error ? describeCrmError(results[i].error) : null}
              onMove={setMoving}
              refreshing={pull.refreshing}
              onRefresh={() => void pull.onRefresh()}
            />
          ))}
        </ScrollView>
      )}
      {moving ? <MoveSheet lead={moving} board={board} onClose={() => setMoving(null)} /> : null}
    </>
  );
}

function Column({
  width,
  value,
  label,
  leads,
  total,
  loading,
  error,
  onMove,
  refreshing,
  onRefresh,
}: {
  width: number;
  value: string;
  label: string;
  leads: Lead[];
  total: number;
  loading: boolean;
  error: string | null;
  onMove: (l: Lead) => void;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const dot = useOptionColor()(value);
  return (
    <View style={[styles.column, { width, backgroundColor: colors.surfaceAlt, borderRadius: radius.lg }]}>
      <Row gap={8} style={styles.colHead}>
        <View style={[styles.dot, { backgroundColor: dot }]} />
        <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
          {label}
        </Text>
        <View style={[styles.count, { backgroundColor: colors.surface }]}>
          <Text variant="caption" tone="muted" style={{ fontWeight: '700' }}>
            {total}
          </Text>
        </View>
      </Row>
      {loading ? <ActivityIndicator color={colors.primary} style={{ padding: 20 }} /> : null}
      {error ? (
        <Text variant="caption" tone="danger" style={{ padding: 12 }}>
          {error}
        </Text>
      ) : null}
      <FlatList
        data={leads}
        refreshing={refreshing}
        onRefresh={onRefresh}
        keyExtractor={(l) => l.id}
        contentContainerStyle={{ gap: 8, padding: 8, paddingBottom: 24 }}
        renderItem={({ item }) => <BoardCard lead={item} onMove={() => onMove(item)} />}
        ListEmptyComponent={
          !loading && !error ? (
            <Text variant="caption" tone="faint" center style={{ padding: 16 }}>
              {t('board.empty')}
            </Text>
          ) : undefined
        }
        ListFooterComponent={
          total > leads.length ? (
            <Text variant="micro" tone="faint" center>
              {t('board.more', { count: total - leads.length })}
            </Text>
          ) : undefined
        }
      />
    </View>
  );
}

function BoardCard({ lead, onMove }: { lead: Lead; onMove: () => void }) {
  const { t } = useTranslation();
  const { colors, radius, shadow } = useTheme();
  return (
    <Pressable onPress={() => openContact(lead.id)} style={[styles.card, shadow.card, { backgroundColor: colors.surface, borderRadius: radius.md }]}>
      <Text variant="bodyStrong" numberOfLines={1}>
        {lead.name}
      </Text>
      {lead.phone ? (
        <Text variant="caption" tone="muted">
          {formatPhone(lead.phone)}
        </Text>
      ) : null}
      <View style={{ marginTop: 5 }}>
        <ContactChips hash={lead.fields} tags={lead.tags} />
      </View>
      <Row gap={8} style={{ marginTop: 8 }}>
        <CardBtn
          icon={<MessageCircle size={15} color="#128C7E" />}
          label={t('common.whatsapp')}
          bg={colors.whatsappSoft}
          onPress={() => (lead.phone ? messageOnWhatsApp({ phone: lead.phone, leadId: lead.id }) : undefined)}
        />
        <CardBtn icon={<ArrowRightLeft size={15} color={colors.text} />} label={t('board.move')} bg={colors.surfaceAlt} onPress={onMove} />
      </Row>
    </Pressable>
  );
}

function CardBtn({ icon, label, bg, onPress }: { icon: React.ReactNode; label: string; bg: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={4} style={({ pressed }) => [styles.btn, { backgroundColor: bg, opacity: pressed ? 0.7 : 1 }]}>
      {icon}
      <Text variant="micro" style={{ fontWeight: '700' }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function MoveSheet({ lead, board, onClose }: { lead: Lead; board: Board; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const qc = useQueryClient();
  const update = useUpdateLead();
  const current = fieldText(lead, board.slug);
  const [busy, setBusy] = useState<string | null>(null);

  const move = async (value: string) => {
    if (value === current) return onClose();
    setBusy(value);
    try {
      await update.mutateAsync({ lead, input: { fields: { [board.slug]: value } } });
      await qc.invalidateQueries({ queryKey: ['board', board.slug] });
      onClose();
    } catch (err) {
      showAlert(t('common.couldNotSave'), describeCrmError(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet open onClose={onClose} title={t('board.moveTitle', { name: lead.name })} subtitle={board.label}>
      <View style={{ gap: 8 }}>
        {[...board.options, ''].map((o) => {
          const on = o === current;
          return (
            <Pressable
              key={o || '__none'}
              onPress={() => void move(o)}
              style={[styles.option, { borderRadius: radius.md, backgroundColor: on ? colors.primarySoft : colors.surfaceAlt }]}
            >
              <Text variant="bodyStrong" style={{ flex: 1, color: on ? colors.primary : o ? colors.text : colors.textMuted }}>
                {o || t('board.notSet')}
              </Text>
              {busy === o ? <ActivityIndicator color={colors.primary} /> : on ? <Text tone="primary">✓</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  columns: { gap: 12, paddingHorizontal: 16, paddingTop: 8 },
  column: { flex: 1, overflow: 'hidden' },
  colHead: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  count: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  card: { padding: 12, gap: 2 },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, height: 34, borderRadius: 10 },
  option: { flexDirection: 'row', alignItems: 'center', padding: 14 },
});

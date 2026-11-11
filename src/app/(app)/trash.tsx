/**
 * Trash: leads (and inbox chats, which are the same contacts) that were
 * deleted. Restore puts one back everywhere; Delete forever removes it with its
 * notes and WhatsApp identity, which cannot be undone.
 */
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { useTabBarInset } from '@/components/navigation/FloatingTabBar';
import { Avatar, EmptyState, Screen, SearchField, Text } from '@/components/ui';
import { confirmAction, showAlert } from '@/lib/dialog';
import { formatPhone } from '@/lib/phone';
import { describeCrmError } from '@/services/crm/client';
import { deleteLeadForever, listTrashed, restoreLead, type Lead } from '@/services/crm/leads';
import { useTheme } from '@/theme/ThemeProvider';

export default function TrashScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const bar = useTabBarInset();
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const q = useInfiniteQuery({
    queryKey: ['trash', search.trim()],
    queryFn: ({ pageParam }) => listTrashed(pageParam, search),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
  });
  const items = q.data?.pages.flatMap((p) => p.leads) ?? [];
  const total = q.data?.pages[0]?.total ?? 0;

  const refreshAll = () => {
    void qc.invalidateQueries({ queryKey: ['trash'] });
    void qc.invalidateQueries({ queryKey: ['leads'] });
    void qc.invalidateQueries({ queryKey: ['board'] });
  };

  const restore = async (l: Lead) => {
    setBusy(l.id);
    try {
      await restoreLead(l.id);
      refreshAll();
    } catch (e) {
      showAlert(t('trash.failed'), describeCrmError(e));
    } finally {
      setBusy(null);
    }
  };

  const destroy = async (l: Lead) => {
    const ok = await confirmAction({
      title: t('trash.foreverQ'),
      message: t('trash.foreverBody', { name: l.name || formatPhone(l.phone) }),
      confirmText: t('trash.forever'),
      cancelText: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    setBusy(l.id);
    try {
      await deleteLeadForever(l.id);
      refreshAll();
    } catch (e) {
      showAlert(t('trash.failed'), describeCrmError(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen title={t('trash.title')} subtitle={t('trash.sub', { count: total })} back padded={false}>
      <FlatList
        data={items}
        keyExtractor={(l) => l.id}
        contentContainerStyle={{ paddingBottom: bar + 24 }}
        refreshing={q.isRefetching}
        onRefresh={() => void q.refetch()}
        onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && void q.fetchNextPage()}
        ListHeaderComponent={
          <View style={{ padding: 16, paddingBottom: 6 }}>
            <SearchField value={search} onChangeText={setSearch} placeholder={t('leads.searchPlaceholder')} />
          </View>
        }
        renderItem={({ item: l }) => (
          <View style={styles.row}>
            <Avatar name={l.name || l.phone} size={40} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {l.name || formatPhone(l.phone)}
              </Text>
              {l.name && l.phone ? (
                <Text variant="caption" tone="muted">
                  {formatPhone(l.phone)}
                </Text>
              ) : null}
            </View>
            {busy === l.id ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <Pressable onPress={() => void restore(l)} hitSlop={8} style={[styles.btn, { backgroundColor: colors.primarySoft }]}>
                  <RotateCcw size={16} color={colors.primary} />
                  <Text variant="caption" tone="primary" style={{ fontWeight: '700' }}>
                    {t('trash.restore')}
                  </Text>
                </Pressable>
                <Pressable onPress={() => void destroy(l)} hitSlop={8} style={[styles.btn, { backgroundColor: colors.dangerSoft }]}>
                  <Trash2 size={16} color={colors.danger} />
                </Pressable>
              </>
            )}
          </View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginStart: 68 }} />}
        ListEmptyComponent={
          q.isLoading ? (
            <ActivityIndicator style={{ padding: 32 }} color={colors.primary} />
          ) : (
            <EmptyState icon={<Trash2 size={26} color="#fff" />} title={t('trash.empty')} body={t('trash.emptyBody')} />
          )
        }
        ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator style={{ padding: 16 }} color={colors.primary} /> : undefined}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10 },
});

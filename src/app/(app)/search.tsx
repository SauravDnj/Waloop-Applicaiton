import { FlashList } from '@shopify/flash-list';
import { Search, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { LeadCard } from '@/components/leads/LeadCard';
import { EmptyState, Loading, Screen } from '@/components/ui';
import { useLeads } from '@/hooks/queries';
import { useTheme } from '@/theme/ThemeProvider';

export default function SearchScreen() {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const [q, setQ] = useState('');
  const leads = useLeads({
    search: q.trim().length >= 2 ? q.trim() : undefined,
  });
  const items = useMemo(() => (q.trim().length >= 2 ? (leads.data?.pages.flatMap((p) => p.leads) ?? []) : []), [leads.data, q]);
  return (
    <Screen back padded={false} right={null}>
      <View
        style={[
          styles.search,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: radius.md,
          },
        ]}
      >
        <Search size={16} color={colors.textFaint} />
        <TextInput
          autoFocus
          placeholder="Name, number, company…"
          placeholderTextColor={colors.textFaint}
          value={q}
          onChangeText={setQ}
          style={[styles.input, { color: colors.text }]}
        />
        {q ? (
          <Pressable onPress={() => setQ('')}>
            <X size={16} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      <FlashList
        data={items}
        keyExtractor={(l) => l.id}
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: 16, paddingVertical: 5 }}>
            <LeadCard lead={item} compact />
          </View>
        )}
        ListEmptyComponent={
          leads.isFetching ? (
            <Loading />
          ) : q.trim().length >= 2 ? (
            <EmptyState title={t('searchPage.noMatches', { q: q.trim() })} body={t('searchPage.noMatchesBody')} />
          ) : (
            // Before anything is typed: say what can be found, instead of an empty page.
            <EmptyState icon={<Search size={26} color="#fff" />} title={t('searchPage.hintTitle')} body={t('searchPage.hintBody')} />
          )
        }
        onEndReached={() => leads.hasNextPage && leads.fetchNextPage()}
        keyboardShouldPersistTaps="handled"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 46,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  input: { flex: 1, fontSize: 16 },
});

/** Search the CRM and pick one lead (used for a campaign's test send). */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Button, SearchField, Sheet, Text } from '@/components/ui';
import { useLeads } from '@/hooks/queries';
import { formatPhone } from '@/lib/phone';
import type { Lead } from '@/services/crm/leads';
import { useTheme } from '@/theme/ThemeProvider';

export function LeadPickerSheet({ title, onClose, onPick }: { title: string; onClose: () => void; onPick: (lead: Lead) => void }) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const [search, setSearch] = useState('');
  const leads = useLeads({ search: search.trim() || undefined });
  const items = (leads.data?.pages.flatMap((p) => p.leads) ?? []).filter((l) => !!l.phone);

  return (
    <Sheet open onClose={onClose} title={title}>
      <View style={{ gap: 10 }}>
        <SearchField value={search} onChangeText={setSearch} placeholder={t('camp.searchLeads')} />
        {leads.isLoading ? <ActivityIndicator color={colors.primary} style={{ padding: 16 }} /> : null}
        {!leads.isLoading && !items.length ? (
          <Text variant="caption" tone="faint" style={{ padding: 8 }}>
            {t('camp.noLeadsFound')}
          </Text>
        ) : null}
        {items.map((l) => (
          <Pressable
            key={l.id}
            onPress={() => onPick(l)}
            style={({ pressed }) => [styles.row, { borderRadius: radius.md, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' }]}
          >
            <Avatar name={l.name || l.phone} size={36} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {l.name || formatPhone(l.phone)}
              </Text>
              {l.name ? (
                <Text variant="caption" tone="muted">
                  {formatPhone(l.phone)}
                </Text>
              ) : null}
            </View>
          </Pressable>
        ))}
        {leads.hasNextPage ? <Button variant="ghost" size="sm" title={t('dial.loadMore')} loading={leads.isFetchingNextPage} onPress={() => void leads.fetchNextPage()} /> : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8 },
});

/** A row showing the chosen approved template; tapping opens a searchable list (from the saved copy). */
import type { Template } from '@ab-ecosystem/cpaas';
import { ChevronDown } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { SearchField, Sheet, Text } from '@/components/ui';
import { useTemplates } from '@/hooks/queries';
import { parseTemplate } from '@/services/crm/whatsapp';
import { useTheme } from '@/theme/ThemeProvider';

export function TemplatePicker({ channelId, value, onPick, label }: { channelId: string | null; value: string; onPick: (t: Template) => void; label?: string }) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const templates = useTemplates(channelId, 'approved');
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const current = templates.data?.find((x) => x.id === value);
  const list = useMemo(() => (templates.data ?? []).filter((x) => !q.trim() || x.name.toLowerCase().includes(q.trim().toLowerCase())), [templates.data, q]);

  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Text variant="caption" tone="muted" style={{ fontWeight: '500' }}>
          {label}
        </Text>
      ) : null}
      <Pressable
        onPress={() => setOpen(true)}
        disabled={!channelId}
        style={[styles.select, { borderRadius: radius.md, borderColor: colors.border, backgroundColor: colors.surface, opacity: channelId ? 1 : 0.5 }]}
      >
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong" numberOfLines={1} tone={current ? 'default' : 'muted'}>
            {current?.name ?? t('followup.pickTemplate')}
          </Text>
          {current ? (
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {parseTemplate(current.components).body}
            </Text>
          ) : null}
        </View>
        <ChevronDown size={18} color={colors.textMuted} />
      </Pressable>
      {open ? (
        <Sheet open onClose={() => setOpen(false)} title={t('followup.pickTemplate')} subtitle={t('followup.approvedOnly')} scroll={false}>
          <SearchField value={q} onChangeText={setQ} placeholder={t('whatsapp.searchTemplates')} />
          {templates.isLoading ? <ActivityIndicator color={colors.primary} style={{ margin: 16 }} /> : null}
          <FlatList
            data={list}
            keyExtractor={(x) => x.id}
            style={{ maxHeight: 440, marginTop: 8 }}
            ListEmptyComponent={templates.isLoading ? undefined : <Text tone="muted">{t('wa.noApproved')}</Text>}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onPick(item);
                  setOpen(false);
                }}
                style={({ pressed }) => [styles.option, { borderRadius: radius.md, borderColor: item.id === value ? colors.primary : colors.border, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' }]}
              >
                <Text variant="bodyStrong">{item.name}</Text>
                <Text variant="caption" tone="muted" numberOfLines={2}>
                  {parseTemplate(item.components).body}
                </Text>
              </Pressable>
            )}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          />
        </Sheet>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  select: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, minHeight: 54, borderWidth: 1 },
  option: { padding: 12, borderWidth: 1, gap: 2 },
});

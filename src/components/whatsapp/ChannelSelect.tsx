/**
 * "Send from" picker: one row showing the chosen WhatsApp channel; tapping it
 * opens a searchable list, so 50 channels never render as chips.
 */
import { Check, ChevronDown, MessageCircle } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { SearchField, Sheet, Text } from '@/components/ui';
import type { WaChannel } from '@/services/crm/whatsapp';
import { useTheme } from '@/theme/ThemeProvider';

const numberOf = (c: WaChannel) => (c.number ? `+${c.number.replace(/^\+/, '')}` : '');

export function ChannelSelect({
  channels,
  value,
  onChange,
  label,
}: {
  channels: WaChannel[];
  value: string | null;
  onChange: (id: string) => void;
  label?: string;
}) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const current = channels.find((c) => c.id === value);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? channels.filter((c) => c.name.toLowerCase().includes(s) || c.number.includes(s.replace(/\D/g, '') || '§')) : channels;
  }, [channels, q]);

  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Text variant="caption" tone="muted" style={{ fontWeight: '500' }}>
          {label}
        </Text>
      ) : null}
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.select,
          { borderRadius: radius.md, borderColor: colors.border, backgroundColor: pressed ? colors.surfaceAlt : colors.surface },
        ]}
      >
        <View style={[styles.dot, { backgroundColor: current?.color ?? colors.whatsapp }]}>
          <MessageCircle size={14} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {current?.name ?? t('wa.pickChannel')}
          </Text>
          {current && numberOf(current) ? (
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {numberOf(current)}
            </Text>
          ) : null}
        </View>
        <ChevronDown size={18} color={colors.textMuted} />
      </Pressable>
      {open ? (
        <Sheet
          open
          onClose={() => {
            setOpen(false);
            setQ('');
          }}
          title={t('wa.sendFrom')}
          subtitle={t('wa.channelCount', { count: channels.length })}
          scroll={false}
        >
          {channels.length > 6 ? <SearchField value={q} onChangeText={setQ} placeholder={t('wa.searchChannels')} /> : null}
          <FlatList
            data={list}
            keyExtractor={(c) => c.id}
            style={{ maxHeight: 420, marginTop: 8 }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const on = item.id === value;
              return (
                <Pressable
                  // An inactive channel can't send: shown, but not selectable.
                  disabled={!item.active}
                  onPress={() => {
                    onChange(item.id);
                    setOpen(false);
                    setQ('');
                  }}
                  style={({ pressed }) => [
                    styles.row,
                    { borderRadius: radius.sm, backgroundColor: on ? colors.primarySoft : pressed ? colors.surfaceAlt : 'transparent' },
                    !item.active && { opacity: 0.45 },
                  ]}
                >
                  <View style={[styles.dot, { backgroundColor: item.color }]}>
                    <MessageCircle size={14} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong" numberOfLines={1} style={on ? { color: colors.primary } : undefined}>
                      {item.name}
                    </Text>
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {numberOf(item)}
                      {!item.active ? ` · ${t('whatsapp.inactive')}` : ''}
                    </Text>
                  </View>
                  {on ? <Check size={18} color={colors.primary} /> : null}
                </Pressable>
              );
            }}
          />
        </Sheet>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  select: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, minHeight: 54, borderWidth: 1 },
  dot: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 },
});

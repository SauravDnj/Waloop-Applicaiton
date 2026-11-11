/**
 * Desktop contacts list: one row per contact in aligned columns (name, labels
 * and tags, last updated), a checkbox to select, hover highlight, and the row
 * opens the contact panel.
 */
import { Check, MessageCircle } from 'lucide-react-native';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { ContactChips } from '@/components/leads/ContactChips';
import { Avatar, Text } from '@/components/ui';
import { messageOnWhatsApp } from '@/lib/actions';
import { formatPhone } from '@/lib/phone';
import { fromNow } from '@/lib/time';
import type { Lead } from '@/services/crm/leads';
import { openContact } from '@/stores/contactPanel';
import { useTheme } from '@/theme/ThemeProvider';

const COLS = { name: 2.4, labels: 3.2, updated: 1.2 };

export function LeadTableHeader({ allSelected, onSelectAll }: { allSelected: boolean; onSelectAll: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const cell = (label: string, flex: number) => (
    <Text variant="micro" tone="faint" style={{ flex, letterSpacing: 0.6 }} numberOfLines={1}>
      {label.toUpperCase()}
    </Text>
  );
  return (
    <View style={[styles.row, styles.header, { borderBottomColor: colors.border }]}>
      <Box checked={allSelected} onPress={onSelectAll} />
      {cell(t('common.name'), COLS.name)}
      {cell(t('leads.labels'), COLS.labels)}
      {cell(t('leads.updated'), COLS.updated)}
      <View style={{ width: 42 }} />
    </View>
  );
}

function Box({ checked, onPress }: { checked: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={8} style={[styles.box, { borderColor: checked ? colors.primary : colors.borderStrong, backgroundColor: checked ? colors.primary : 'transparent' }]}>
      {checked ? <Check size={12} color="#fff" strokeWidth={3} /> : null}
    </Pressable>
  );
}

function LeadTableRowInner({ lead, selected, selecting, onSelect }: { lead: Lead; selected: boolean; selecting: boolean; onSelect: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => (selecting ? onSelect() : openContact(lead.id))}
      style={({ hovered }: { hovered?: boolean }) => [
        styles.row,
        { borderBottomColor: colors.border, backgroundColor: selected ? colors.primarySoft : hovered ? colors.surfacePressed : colors.surface },
      ]}
    >
      <Box checked={selected} onPress={onSelect} />
      <View style={[styles.nameCell, { flex: COLS.name }]}>
        <Avatar name={lead.name} uri={lead.avatarUrl} size={34} />
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {lead.name}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {lead.phone ? formatPhone(lead.phone) : t('leads.noNumber')}
          </Text>
        </View>
      </View>
      <View style={{ flex: COLS.labels, overflow: 'hidden' }}>
        <ContactChips hash={lead.fields} tags={lead.tags} />
      </View>
      <Text variant="caption" tone="muted" numberOfLines={1} style={{ flex: COLS.updated }}>
        {fromNow(lead.updatedAt)}
      </Text>
      <View style={styles.actions}>
        <Pressable onPress={() => messageOnWhatsApp({ phone: lead.phone, leadId: lead.id })} disabled={!lead.phone} style={[styles.act, { backgroundColor: colors.whatsappSoft }]}>
          <MessageCircle size={16} color={colors.whatsapp} />
        </Pressable>
      </View>
    </Pressable>
  );
}

export const LeadTableRow = memo(LeadTableRowInner);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, marginHorizontal: 16 },
  header: { paddingVertical: 8 },
  box: { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  nameCell: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  actions: { width: 42, flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  act: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});

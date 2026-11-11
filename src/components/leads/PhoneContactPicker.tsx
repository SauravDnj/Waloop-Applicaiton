/**
 * Full-screen list of the phone's contacts with checkboxes, search and
 * "select all", for picking contacts to sync or to block. Each row says
 * whether the contact is already in the CRM or blocked.
 */
import { Check, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, SearchField, Text } from '@/components/ui';
import { formatPhone } from '@/lib/phone';
import { isBlocked, isSynced, type BlockedContact, type DeviceContact } from '@/services/phoneContacts';
import { useTheme } from '@/theme/ThemeProvider';

export function PhoneContactPicker({
  mode,
  contacts,
  blocked,
  synced,
  onClose,
  onDone,
}: {
  /** `sync`: blocked and synced contacts can't be picked. `block`: blocked ones are hidden. */
  mode: 'sync' | 'block';
  contacts: DeviceContact[];
  blocked: BlockedContact[];
  synced: Set<string>;
  onClose: () => void;
  onDone: (picked: DeviceContact[]) => void;
}) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return contacts
      .filter((c) => (mode === 'block' ? !isBlocked(c, blocked) : true))
      .filter((c) => !term || c.name.toLowerCase().includes(term) || (digits.length > 2 && c.phones.some((p) => p.includes(digits))));
  }, [contacts, blocked, mode, q]);
  const pickable = (c: DeviceContact) => mode === 'block' || (!isBlocked(c, blocked) && !isSynced(c, synced));
  const choosable = list.filter(pickable);
  const allOn = choosable.length > 0 && choosable.every((c) => picked.has(c.id));

  const toggle = (id: string) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
        <View style={styles.head}>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel={t('common.close')}>
            <X size={22} color={colors.text} />
          </Pressable>
          <Text variant="h3" style={{ flex: 1 }}>
            {mode === 'sync' ? t('phoneSync.pickToSync') : t('phoneSync.pickToBlock')}
          </Text>
          <Pressable
            onPress={() => setPicked(allOn ? new Set() : new Set(choosable.map((c) => c.id)))}
            hitSlop={8}
            disabled={!choosable.length}
          >
            <Text variant="caption" tone="primary" style={{ fontWeight: '700' }}>
              {allOn ? t('phoneSync.selectNone') : t('phoneSync.selectAll')}
            </Text>
          </Pressable>
        </View>
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <SearchField value={q} onChangeText={setQ} placeholder={t('phoneSync.search')} />
        </View>
        <FlatList
          data={list}
          keyExtractor={(c) => c.id}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={30}
          ListEmptyComponent={
            <Text tone="muted" center style={{ padding: 24 }}>
              {t('phoneSync.none')}
            </Text>
          }
          renderItem={({ item }) => {
            const can = pickable(item);
            const on = picked.has(item.id);
            const status = isBlocked(item, blocked) ? t('phoneSync.blocked') : isSynced(item, synced) ? t('phoneSync.inCrm') : '';
            return (
              <Pressable
                onPress={() => can && toggle(item.id)}
                disabled={!can}
                style={({ pressed }) => [styles.row, { opacity: can ? 1 : 0.5, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' }]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on, disabled: !can }}
              >
                <View style={[styles.box, { borderColor: on ? colors.primary : colors.borderStrong, backgroundColor: on ? colors.primary : 'transparent', borderRadius: 6 }]}>
                  {on ? <Check size={14} color="#fff" /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {item.phones.map((p) => formatPhone(p)).join(' · ')}
                  </Text>
                </View>
                {status ? (
                  <View style={[styles.badge, { backgroundColor: colors.surfaceAlt, borderRadius: radius.sm }]}>
                    <Text variant="micro" tone="muted" style={{ letterSpacing: 0 }}>
                      {status}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          }}
        />
        <View style={[styles.foot, { borderTopColor: colors.border, paddingBottom: insets.bottom + 10 }]}>
          <Button
            full
            variant={mode === 'block' ? 'danger' : 'primary'}
            disabled={!picked.size}
            title={mode === 'sync' ? t('phoneSync.syncN', { count: picked.size }) : t('phoneSync.blockN', { count: picked.size })}
            onPress={() => onDone(contacts.filter((c) => picked.has(c.id)))}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  box: { width: 22, height: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  badge: { paddingHorizontal: 6, paddingVertical: 2 },
  foot: { paddingHorizontal: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
});

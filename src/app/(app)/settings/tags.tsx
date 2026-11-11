/** Manage contact tags and saved segments (create / delete). */
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { confirmAction, showAlert } from '@/lib/dialog';
import { Button, Card, Divider, Input, Row, Screen, Text } from '@/components/ui';
import { FilterSheet } from '@/components/leads/FilterSheet';
import { keys, useSegments, useTags } from '@/hooks/queries';
import { crm, describeCrmError } from '@/services/crm/client';
import { deleteSegment } from '@/services/crm/segments';
import { useTheme } from '@/theme/ThemeProvider';
import { useCan } from '@/stores/auth';
import { P } from '@/lib/permissions';

const PALETTE = ['#2A2283', '#16A34A', '#F59E0B', '#EF4444', '#7C3AED', '#0D9488', '#DB2777', '#0EA5E9'];

export default function TagsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const tags = useTags();
  const segments = useSegments();
  const [name, setName] = useState('');
  const [color, setColor] = useState(PALETTE[0]);
  const [busy, setBusy] = useState(false);
  const [newSegment, setNewSegment] = useState(false);
  // What the role allows (owners: everything); everyone can see the lists.
  const can = {
    tagCreate: useCan(P.tags.create),
    tagDelete: useCan(P.tags.delete),
    segCreate: useCan(P.segments.create),
    segDelete: useCan(P.segments.delete),
  };

  const removeSegment = async (id: string, label: string) => {
    const ok = await confirmAction({
      title: t('segments.deleteTitle', { name: label }),
      message: t('segments.deleteBody'),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    await deleteSegment(id).catch((e: unknown) => showAlert(t('common.errorTitle'), describeCrmError(e)));
    void qc.invalidateQueries({ queryKey: keys.segments });
  };

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await crm().contactTags.create({ name: name.trim(), color });
      setName('');
      void qc.invalidateQueries({ queryKey: keys.tags });
    } catch (err) {
      showAlert('Could not create tag', describeCrmError(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string, label: string) => {
    const ok = await confirmAction({
      title: `Delete “${label}”?`,
      message: 'Leads keep a dangling reference until re-tagged.',
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    await crm()
      .contactTags.delete(id)
      .catch((e: unknown) => showAlert('Failed', describeCrmError(e)));
    void qc.invalidateQueries({ queryKey: keys.tags });
  };

  return (
    <Screen title={t('settings.tags')} back scroll>
      <View style={{ gap: 14, marginTop: 8 }}>
        {can.tagCreate ? (
          <Card style={{ gap: 10 }}>
            <Text variant="h3">New tag</Text>
            <Input
              placeholder="e.g. VIP, Webinar May, Do not call"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              onSubmitEditing={() => void create()}
            />
            <Row gap={8}>
              {PALETTE.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setColor(c)}
                  style={[
                    styles.swatch,
                    {
                      backgroundColor: c,
                      borderWidth: color === c ? 3 : 0,
                      borderColor: colors.text,
                    },
                  ]}
                />
              ))}
            </Row>
            <Button
              title="Create tag"
              icon={<Plus size={16} color={colors.onPrimary} />}
              onPress={() => void create()}
              loading={busy}
              disabled={!name.trim()}
            />
          </Card>
        ) : null}

        <Card padded={false}>
          {(tags.data ?? []).map((t, i) => (
            <View key={t.id}>
              <Row gap={12} style={styles.row}>
                <View style={[styles.swatchSm, { backgroundColor: t.color || colors.textFaint }]} />
                <Text variant="bodyStrong" style={{ flex: 1 }}>
                  {t.name}
                </Text>
                {can.tagDelete ? (
                  <Pressable onPress={() => void remove(t.id, t.name)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Delete ${t.name}`}>
                    <Trash2 size={16} color={colors.danger} />
                  </Pressable>
                ) : null}
              </Row>
              {i < (tags.data?.length ?? 0) - 1 ? <Divider inset={40} /> : null}
            </View>
          ))}
          {!tags.data?.length ? (
            <Text tone="muted" style={{ padding: 14 }}>
              No tags yet.
            </Text>
          ) : null}
        </Card>

        <Row style={{ marginStart: 4, justifyContent: 'space-between' }}>
          <Text variant="micro" tone="faint">
            {t('segments.title').toUpperCase()}
          </Text>
          {can.segCreate ? (
            <Pressable onPress={() => setNewSegment(true)} hitSlop={8}>
              <Row gap={4}>
                <Plus size={14} color={colors.primary} />
                <Text variant="caption" style={{ color: colors.primary, fontWeight: '700' }}>
                  {t('segments.new')}
                </Text>
              </Row>
            </Pressable>
          ) : null}
        </Row>
        <Card padded={false}>
          {(segments.data ?? []).map((s, i) => (
            <View key={s.id}>
              <Row gap={12} style={styles.row}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="bodyStrong">{s.name}</Text>
                  <Text variant="caption" tone="muted">
                    {s.description || t('segments.conditions', { count: s.filter.conditions?.length ?? 0 })}
                  </Text>
                </View>
                {can.segDelete ? (
                  <Pressable onPress={() => void removeSegment(s.id, s.name)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Delete ${s.name}`}>
                    <Trash2 size={16} color={colors.danger} />
                  </Pressable>
                ) : null}
              </Row>
              {i < (segments.data?.length ?? 0) - 1 ? <Divider inset={12} /> : null}
            </View>
          ))}
          {!segments.data?.length ? (
            <View style={{ padding: 14, gap: 10 }}>
              <Text tone="muted">{t('segments.empty')}</Text>
              {can.segCreate ? (
                <Button title={t('segments.new')} variant="secondary" icon={<Plus size={16} color={colors.primary} />} onPress={() => setNewSegment(true)} />
              ) : null}
            </View>
          ) : null}
        </Card>
      </View>
      <FilterSheet open={newSegment} mode="segment" value={{}} onClose={() => setNewSegment(false)} onApply={() => setNewSegment(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  swatch: { width: 28, height: 28, borderRadius: 14 },
  swatchSm: { width: 14, height: 14, borderRadius: 7 },
  row: { padding: 12 },
});

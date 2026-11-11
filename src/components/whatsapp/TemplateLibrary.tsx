/** A channel's templates: search, status filter, sync from Meta, preview, delete, create. */
import type { Template } from '@ab-ecosystem/cpaas';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { MessageCircle, Plus, RefreshCw, Trash2 } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, Chip, EmptyState, Row, SearchField, Sheet, StatusPill, Text } from '@/components/ui';
import { templatesUpdatedAt, useTemplates } from '@/hooks/queries';
import { formatWhen } from '@/lib/time';
import { confirmAction, showAlert } from '@/lib/dialog';
import { describeCrmError } from '@/services/crm/client';
import { deleteTemplate, parseTemplate, syncTemplates } from '@/services/crm/whatsapp';
import { useCan } from '@/stores/auth';
import { P } from '@/lib/permissions';
import { useTheme } from '@/theme/ThemeProvider';
import { TemplatePreview } from './TemplatePreview';

type StatusFilter = 'all' | Template['status'];

export const useTemplateStatusColor = () => {
  const { colors } = useTheme();
  return (s: Template['status']) =>
    s === 'approved' ? colors.success : s === 'pending' ? colors.warning : s === 'rejected' ? colors.danger : colors.textMuted;
};

export function TemplateLibrary({ channelId }: { channelId: string }) {
  // What the role allows with templates (owners: everything).
  const can = { create: useCan(P.templates.create), update: useCan(P.templates.update), delete: useCan(P.templates.delete) };
  const { t } = useTranslation();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const templates = useTemplates(channelId);
  const statusColor = useTemplateStatusColor();
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [syncing, setSyncing] = useState(false);
  // Re-read after every fetch: the query's data changes when the saved copy is replaced.
  const updatedAt = templates.dataUpdatedAt || templatesUpdatedAt(channelId);
  const [preview, setPreview] = useState<Template | null>(null);

  const list = useMemo(
    () =>
      (templates.data ?? []).filter(
        (x) => (filter === 'all' || x.status === filter) && (!search.trim() || x.name.toLowerCase().includes(search.trim().toLowerCase())),
      ),
    [templates.data, filter, search],
  );

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await syncTemplates(channelId);
      await qc.invalidateQueries({ queryKey: ['wa', 'templates', channelId] });
      showAlert(t('whatsapp.synced'), t('whatsapp.syncedBody', { fetched: r.fetched, updated: r.updated + r.created }));
    } catch (err) {
      showAlert(t('whatsapp.syncFailed'), describeCrmError(err));
    } finally {
      setSyncing(false);
    }
  };

  const remove = async (tpl: Template) => {
    const ok = await confirmAction({
      title: t('whatsapp.deleteTitle', { name: tpl.name }),
      message: tpl.status === 'draft' ? t('whatsapp.deleteDraft') : t('whatsapp.deleteMeta'),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteTemplate(channelId, tpl.id);
      setPreview(null);
      void qc.invalidateQueries({ queryKey: ['wa', 'templates', channelId] });
    } catch (err) {
      showAlert(t('common.errorTitle'), describeCrmError(err));
    }
  };

  return (
    <View style={{ gap: 10 }}>
      <Row style={{ justifyContent: 'space-between', marginStart: 4, marginTop: 6 }}>
        <Text variant="micro" tone="faint">
          {t('whatsapp.templates').toUpperCase()}
        </Text>
        {can.update ? (
          <Pressable onPress={() => void sync()} hitSlop={8} disabled={syncing} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {syncing ? <ActivityIndicator size="small" color={colors.primary} /> : <RefreshCw size={16} color={colors.primary} />}
            <Text variant="caption" tone="primary" style={{ fontWeight: '600' }}>
              {t('whatsapp.resync')}
            </Text>
          </Pressable>
        ) : null}
      </Row>
      <Text variant="micro" tone="faint" style={{ marginStart: 4, letterSpacing: 0 }}>
        {updatedAt ? t('whatsapp.updatedAgo', { when: formatWhen(new Date(updatedAt)) }) : t('whatsapp.neverDownloaded')}
      </Text>
      {can.create ? (
        <Button
          title={t('whatsapp.newTemplate')}
          icon={<Plus size={18} color="#fff" />}
          onPress={() => router.push({ pathname: '/(app)/whatsapp/template-new', params: { channelId } })}
        />
      ) : null}
      <SearchField value={search} onChangeText={setSearch} placeholder={t('whatsapp.searchTemplates')} />
      <Row gap={6} style={{ flexWrap: 'wrap' }}>
        {(['all', 'approved', 'pending', 'rejected', 'draft'] as StatusFilter[]).map((f) => (
          <Chip key={f} small label={t(`whatsapp.status.${f}`)} selected={filter === f} onPress={() => setFilter(f)} />
        ))}
      </Row>
      <Card padded={false}>
        {templates.isLoading ? <ActivityIndicator style={{ padding: 20 }} color={colors.primary} /> : null}
        {templates.error ? (
          <Text tone="danger" style={{ padding: 14 }}>
            {describeCrmError(templates.error)}
          </Text>
        ) : null}
        {!templates.isLoading && !list.length ? (
          <EmptyState icon={<MessageCircle size={26} color="#fff" />} title={t('whatsapp.noTemplates')} body={t('whatsapp.noTemplatesBody')} />
        ) : null}
        {list.map((tpl, i) => {
          const parsed = parseTemplate(tpl.components);
          return (
            <Pressable
              key={tpl.id}
              onPress={() => setPreview(tpl)}
              style={[styles.tpl, i < list.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
            >
              <View style={{ flex: 1, gap: 3 }}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {tpl.name}
                </Text>
                <Text variant="caption" tone="muted" numberOfLines={2}>
                  {parsed.body || '—'}
                </Text>
                <Text variant="micro" tone="faint">
                  {tpl.language} · {t(`whatsapp.category.${tpl.category}`, { defaultValue: tpl.category })}
                  {parsed.header.format !== 'NONE' && parsed.header.format !== 'TEXT' ? ` · ${parsed.header.format.toLowerCase()}` : ''}
                </Text>
              </View>
              <StatusPill label={t(`whatsapp.status.${tpl.status}`)} color={statusColor(tpl.status)} />
            </Pressable>
          );
        })}
      </Card>
      {preview ? (
        <Sheet open onClose={() => setPreview(null)} title={preview.name} subtitle={`${preview.language} · ${t(`whatsapp.status.${preview.status}`)}`}>
          <View style={{ gap: 12 }}>
            <TemplatePreview template={parseTemplate(preview.components)} />
            {can.delete ? (
              <Button title={t('common.delete')} variant="ghost" icon={<Trash2 size={16} color={colors.danger} />} onPress={() => void remove(preview)} />
            ) : null}
          </View>
        </Sheet>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tpl: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
});

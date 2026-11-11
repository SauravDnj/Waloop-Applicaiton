/**
 * Contact fields: the workspace's custom fields as they are in CPaaS. Add your
 * own (text, number, date, dropdown, …), rename them, edit their options, and
 * choose which fields show as labels. Every dropdown is also a board. The app
 * creates no fields of its own.
 */
import type { CustomField } from '@ab-ecosystem/cpaas';
import { useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2, X } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, Chip, EmptyState, IconButton, Input, Loading, Row, Screen, Sheet, Switch, Text } from '@/components/ui';
import { keys, useFields } from '@/hooks/queries';
import { confirmAction, showAlert } from '@/lib/dialog';
import { P } from '@/lib/permissions';
import { describeCrmError } from '@/services/crm/client';
import { createField, deleteField, dropdownOptions, fieldLabel, hasOptions, propsWithOptions, updateField, USER_FIELD_TYPES, type UserFieldType } from '@/services/crm/fields';
import { useCan } from '@/stores/auth';
import { useTheme } from '@/theme/ThemeProvider';

export default function FieldsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const fields = useFields();
  const canCreate = useCan(P.fields.create);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<CustomField | null>(null);
  const all = fields.data ?? [];

  return (
    <Screen
      title={t('settings.fields')}
      subtitle={t('settings.fieldsSub')}
      back
      scroll
      onRefresh={() => fields.refetch()}
      // New field at the top, not under a long list.
      right={
        canCreate ? (
          <IconButton tone="primary" label={t('fields.add')} onPress={() => setAdding(true)}>
            <Plus size={20} color={colors.primary} />
          </IconButton>
        ) : undefined
      }
    >
      <View style={{ gap: 14, marginTop: 8 }}>
        {fields.isLoading ? <Loading /> : null}
        {fields.isError ? <Text tone="danger">{describeCrmError(fields.error)}</Text> : null}
        {fields.data && !all.length ? (
          <EmptyState
            title={t('fields.noneYet')}
            body={t('fields.noneBody')}
            action={canCreate ? t('fields.add') : undefined}
            onAction={canCreate ? () => setAdding(true) : undefined}
          />
        ) : null}
        {all.length ? (
          <Card padded={false}>
            {all.map((f, i) => (
              <Pressable key={f.slug} onPress={() => setEditing(f)} style={[styles.fieldRow, i > 0 && styles.divider]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="bodyStrong">{fieldLabel(f)}</Text>
                  <Text variant="caption" tone="muted">
                    {[
                      t(`fields.type.${f.dataType}`, { defaultValue: f.dataType }),
                      hasOptions(f.dataType) ? `${dropdownOptions(f).length} ${t('fields.options')}` : '',
                      f.showAsLabel ? t('fields.label') : '',
                      f.type === 'system' ? t('fields.builtIn') : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                <Pencil size={16} color={colors.textMuted} />
              </Pressable>
            ))}
          </Card>
        ) : null}
      </View>
      {adding ? <AddFieldSheet taken={all.map((f) => f.slug)} onClose={() => setAdding(false)} /> : null}
      {editing ? <EditFieldSheet field={editing} onClose={() => setEditing(null)} /> : null}
    </Screen>
  );
}

function OptionsInput({ options, onChange }: { options: string[]; onChange: (o: string[]) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (v && !options.includes(v)) onChange([...options, v]);
    setDraft('');
  };
  return (
    <View style={{ gap: 8 }}>
      <Row gap={6} style={{ flexWrap: 'wrap' }}>
        {options.map((o) => (
          <Chip
            key={o}
            small
            label={o}
            icon={
              <Pressable hitSlop={8} onPress={() => onChange(options.filter((x) => x !== o))}>
                <X size={12} color={colors.textMuted} />
              </Pressable>
            }
          />
        ))}
      </Row>
      <Row gap={8}>
        <View style={{ flex: 1 }}>
          <Input placeholder={t('fields.addOption')} value={draft} onChangeText={setDraft} onSubmitEditing={add} />
        </View>
        <Button icon={<Plus size={16} color={colors.onPrimary} />} onPress={add} style={styles.addBtn} />
      </Row>
    </View>
  );
}

function AddFieldSheet({ taken, onClose }: { taken: string[]; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [type, setType] = useState<UserFieldType>('text');
  const [options, setOptions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) return showAlert(t('fields.needName'));
    if (hasOptions(type) && !options.length) return showAlert(t('fields.needOptions'));
    setBusy(true);
    try {
      await createField({ name, type, options, taken });
      await qc.invalidateQueries({ queryKey: keys.fields });
      // Board columns follow the field's options.
      void qc.invalidateQueries({ queryKey: ['board'] });
      onClose();
    } catch (err) {
      showAlert(t('common.couldNotSave'), describeCrmError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={t('fields.add')}
      subtitle={t('fields.addSub')}
      footer={<Button title={t('fields.create')} loading={busy} onPress={() => void save()} />}
    >
      <View style={{ gap: 12 }}>
        <Input label={t('fields.name')} value={name} onChangeText={setName} placeholder={t('fields.namePh')} autoFocus />
        <Text variant="caption" tone="muted">
          {t('fields.typeLabel')}
        </Text>
        <Row gap={6} style={{ flexWrap: 'wrap' }}>
          {USER_FIELD_TYPES.map((ty) => (
            <Chip key={ty} small label={t(`fields.type.${ty}`)} selected={type === ty} onPress={() => setType(ty)} />
          ))}
        </Row>
        {hasOptions(type) ? <OptionsInput options={options} onChange={setOptions} /> : null}
      </View>
    </Sheet>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Row gap={12} style={{ justifyContent: 'space-between' }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong">{label}</Text>
        {hint ? (
          <Text variant="caption" tone="muted">
            {hint}
          </Text>
        ) : null}
      </View>
      <Switch value={value} onChange={onChange} />
    </Row>
  );
}

function EditFieldSheet({ field, onClose }: { field: CustomField; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const canUpdate = useCan(P.fields.update);
  const canDelete = useCan(P.fields.delete) && field.type !== 'system';
  const [name, setName] = useState(field.name ?? '');
  const [options, setOptions] = useState<string[]>(() => dropdownOptions(field));
  const [showAsLabel, setShowAsLabel] = useState(field.showAsLabel);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const optionsChanged = hasOptions(field.dataType) && options.join('\u0000') !== dropdownOptions(field).join('\u0000');
      await updateField(field.slug, {
        ...(name.trim() && name.trim() !== field.name ? { name: name.trim() } : {}),
        // Only when the options changed; the field's own option objects (labels…) are kept.
        ...(optionsChanged ? { props: propsWithOptions(field, options) } : {}),
        ...(showAsLabel !== field.showAsLabel ? { showAsLabel } : {}),
      });
      await qc.invalidateQueries({ queryKey: keys.fields });
      // Board columns follow the field's options.
      void qc.invalidateQueries({ queryKey: ['board'] });
      onClose();
    } catch (err) {
      showAlert(t('common.couldNotSave'), describeCrmError(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirmAction({
      title: t('fields.deleteTitle', { name: fieldLabel(field) }),
      message: t('fields.deleteBody'),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteField(field);
      await qc.invalidateQueries({ queryKey: keys.fields });
      // Board columns follow the field's options.
      void qc.invalidateQueries({ queryKey: ['board'] });
      onClose();
    } catch (err) {
      showAlert(t('common.errorTitle'), describeCrmError(err));
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={fieldLabel(field)}
      subtitle={`${t(`fields.type.${field.dataType}`, { defaultValue: field.dataType })} · ${field.slug}`}
      footer={
        canUpdate || canDelete ? (
          <Row gap={10}>
            {canDelete ? <Button title={t('common.delete')} variant="ghost" icon={<Trash2 size={16} color={colors.danger} />} onPress={() => void remove()} /> : null}
            {canUpdate ? <Button title={t('common.save')} loading={busy} onPress={() => void save()} style={{ flex: 1 }} /> : null}
          </Row>
        ) : undefined
      }
    >
      <View style={{ gap: 12 }} pointerEvents={canUpdate ? 'auto' : 'none'}>
        <Input label={t('fields.name')} value={name} onChangeText={setName} editable={canUpdate} />
        {hasOptions(field.dataType) ? <OptionsInput options={options} onChange={setOptions} /> : null}
        <Toggle label={t('fields.showAsLabel')} hint={t('fields.showAsLabelHint')} value={showAsLabel} onChange={setShowAsLabel} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  addBtn: { width: 48, paddingHorizontal: 0 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(128,128,128,0.25)' },
});

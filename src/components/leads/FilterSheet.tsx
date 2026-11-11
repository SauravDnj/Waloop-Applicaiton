import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Chip, Input, Row, Sheet, Text } from '@/components/ui';
import { keys, useFields, useSegments, useTags } from '@/hooks/queries';
import { showAlert } from '@/lib/dialog';
import { countActiveFilters, type LeadFilter } from '@/lib/filters';
import { describeCrmError } from '@/services/crm/client';
import { canSaveAsSegment, createSegment } from '@/services/crm/segments';
import { useTheme } from '@/theme/ThemeProvider';
import { dropdownOptions, fieldLabel } from '@/services/crm/fields';

const toggle = <T,>(list: T[] | undefined, value: T): T[] => (list?.includes(value) ? list.filter((v) => v !== value) : [...(list ?? []), value]);

type Mode = 'filter' | 'segment';

type Props = {
  open: boolean;
  value: LeadFilter;
  onClose: () => void;
  /** Filter mode: called with the chosen filter. Segment mode: called with the filter after the segment is saved. */
  onApply: (f: LeadFilter) => void;
  title?: string;
  /** `segment` opens straight into "new segment": name + conditions + save. */
  mode?: Mode;
};

export function FilterSheet({ open, ...rest }: Props) {
  if (!open) return null;
  return <FilterForm {...rest} />;
}

function FilterForm({ value, onClose, onApply, title, mode: initialMode = 'filter' }: Omit<Props, 'open'>) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<LeadFilter>(value);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [segName, setSegName] = useState('');
  const [saving, setSaving] = useState(false);
  const fields = useFields();
  const tags = useTags();
  const segments = useSegments();
  const reset = () => setDraft({ search: value.search });
  const count = countActiveFilters(draft);
  const isSegment = mode === 'segment';
  const savable = canSaveAsSegment(draft);

  const saveSegment = async () => {
    if (!segName.trim()) {
      showAlert(t('segments.nameRequired'));
      return;
    }
    if (!savable) {
      showAlert(t('segments.needCondition'));
      return;
    }
    setSaving(true);
    try {
      const seg = await createSegment(segName, draft);
      await qc.invalidateQueries({ queryKey: keys.segments });
      // Filter by the new segment from now on; its conditions now live in the segment.
      onApply(initialMode === 'segment' ? draft : { search: draft.search, segment: seg.id });
    } catch (err) {
      showAlert(t('segments.couldNotSave'), describeCrmError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={isSegment ? t('segments.new') : (title ?? t('filter.title'))}
      subtitle={isSegment ? t('segments.newHint') : count ? t('filter.active', { count }) : t('filter.everything')}
      footer={
        isSegment ? (
          <Row gap={10}>
            <Button title={t('common.cancel')} variant="ghost" onPress={initialMode === 'segment' ? onClose : () => setMode('filter')} />
            <Button
              title={t('segments.save')}
              full
              style={{ flex: 1 }}
              loading={saving}
              disabled={!segName.trim() || !savable}
              onPress={() => void saveSegment()}
            />
          </Row>
        ) : (
          <View style={{ gap: 10 }}>
            {savable ? (
              <Pressable onPress={() => setMode('segment')} hitSlop={6} style={{ alignSelf: 'center' }}>
                <Text variant="bodyStrong" style={{ color: colors.primary }}>
                  {t('segments.saveAs')}
                </Text>
              </Pressable>
            ) : null}
            <Row gap={10}>
              <Button title={t('filter.clear')} variant="ghost" onPress={reset} />
              <Button title={count ? t('filter.apply', { count }) : t('filter.showAll')} full style={{ flex: 1 }} onPress={() => onApply(draft)} />
            </Row>
          </View>
        )
      }
    >
      {isSegment ? (
        <Input
          label={t('segments.name')}
          placeholder={t('segments.namePlaceholder')}
          value={segName}
          onChangeText={setSegName}
          autoFocus
          autoCapitalize="words"
        />
      ) : null}
      {!isSegment && segments.data?.length ? (
        <Group label={t('filter.segments')}>
          {segments.data.map((s) => (
            <Chip
              key={s.id}
              label={s.name}
              selected={draft.segment === s.id}
              onPress={() =>
                setDraft({
                  ...draft,
                  segment: draft.segment === s.id ? undefined : s.id,
                })
              }
              tone="accent"
            />
          ))}
        </Group>
      ) : null}
      {tags.data?.length ? (
        <Group label={t('filter.tags')}>
          {tags.data.map((tg) => (
            <Chip
              key={tg.id}
              label={tg.name}
              color={tg.color || undefined}
              selected={draft.tags?.includes(tg.id)}
              onPress={() => setDraft({ ...draft, tags: toggle(draft.tags, tg.id) })}
            />
          ))}
        </Group>
      ) : null}
      <Group label={t('filter.added')}>
        <Chip
          label={t('leads.addedToday')}
          selected={draft.createdWithinDays === 1}
          onPress={() => setDraft({ ...draft, createdWithinDays: draft.createdWithinDays === 1 ? undefined : 1 })}
        />
        <Chip
          label={t('leads.addedWeek')}
          selected={draft.createdWithinDays === 7}
          onPress={() => setDraft({ ...draft, createdWithinDays: draft.createdWithinDays === 7 ? undefined : 7 })}
        />
      </Group>
      {/* Every dropdown field the workspace has. */}
      {(fields.data ?? [])
        .filter((f) => f.dataType === 'dropdown' && dropdownOptions(f).length)
        .map((f) => (
          <Group key={f.slug} label={fieldLabel(f)}>
            {dropdownOptions(f).map((o) => (
              <Chip
                key={o}
                label={o}
                selected={draft.fields?.[f.slug]?.includes(o)}
                onPress={() => setDraft({ ...draft, fields: { ...draft.fields, [f.slug]: toggle(draft.fields?.[f.slug], o) } })}
              />
            ))}
          </Group>
        ))}
      <Text variant="micro" tone="faint">
        {t('filter.note')}
      </Text>
    </Sheet>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Row gap={6} style={styles.wrap}>
        {children}
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { flexWrap: 'wrap' } });

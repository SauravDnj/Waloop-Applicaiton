/**
 * Bulk edit for selected contacts (Contacts page and Inbox): pick what to
 * change (any of the workspace's dropdown fields, add / remove tags), pick the
 * value, apply to all.
 * Inbox chats are the same contacts, so callers pass ids and the sheet loads
 * each contact before writing.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Button, Chip, Row, Sheet, Text } from '@/components/ui';
import { useFields, useTags } from '@/hooks/queries';
import { showAlert } from '@/lib/dialog';
import { rtlFlip } from '@/lib/rtl';
import { dropdownOptions, fieldLabel } from '@/services/crm/fields';
import { getLead, updateLead, type Lead, type LeadInput } from '@/services/crm/leads';
import { useTheme } from '@/theme/ThemeProvider';

type Target = { kind: 'dropdown'; slug: string; label: string; options: string[] } | { kind: 'addTags' | 'removeTags' };

/** Runs `fn` over items, a few at a time. Returns how many failed. */
const eachLimited = async <T,>(items: T[], fn: (x: T) => Promise<unknown>, onDone: (n: number) => void, limit = 4): Promise<number> => {
  let next = 0;
  let done = 0;
  let failed = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item).catch(() => {
        failed += 1;
      });
      onDone(++done);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return failed;
};

export function BulkEditSheet({ ids, leads: given, onClose }: { ids: string[]; leads?: Lead[]; onClose: (changed: boolean) => void }) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const qc = useQueryClient();
  const fields = useFields();
  const tags = useTags();
  const [target, setTarget] = useState<Target | null>(null);
  const [value, setValue] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<number | null>(null);

  // The contacts as they are now (tags are added to / removed from each one's own list).
  const loaded = useQuery({
    queryKey: ['bulkLeads', ids.join(',')],
    queryFn: async () => (await Promise.allSettled(ids.map((id) => getLead(id)))).flatMap((r) => (r.status === 'fulfilled' ? [r.value] : [])),
    initialData: given && given.length === ids.length ? given : undefined,
    // List rows can be old (or from the copy saved on the phone): show them, but load the current contacts.
    initialDataUpdatedAt: 0,
    staleTime: 30_000,
  });
  const leads = loaded.data ?? [];

  const targets: Target[] = [
    ...(fields.data ?? [])
      .filter((f) => f.dataType === 'dropdown')
      .map((f): Target => ({ kind: 'dropdown', slug: f.slug, label: fieldLabel(f), options: dropdownOptions(f) })),
    { kind: 'addTags' },
    { kind: 'removeTags' },
  ];
  const titleOf = (x: Target) => (x.kind === 'dropdown' ? x.label : t(`bulk.${x.kind}`));

  const inputFor = (lead: Lead): LeadInput | null => {
    if (!target) return null;
    if (target.kind === 'dropdown') return value === null ? null : { fields: { [target.slug]: value } };
    const have = lead.tags.map((tg) => tg.id);
    const next = target.kind === 'addTags' ? [...new Set([...have, ...picked])] : have.filter((id) => !picked.has(id));
    return next.length === have.length && next.every((id) => have.includes(id)) ? null : { tags: next };
  };

  const apply = async () => {
    setProgress(0);
    const failed = await eachLimited(
      leads,
      async (lead) => {
        const input = inputFor(lead);
        if (input) await updateLead(lead, input);
      },
      setProgress,
    );
    setProgress(null);
    void qc.invalidateQueries({ queryKey: ['leads'] });
    void qc.invalidateQueries({ queryKey: ['board'] });
    // The next bulk edit must start from the contacts as they are now (tags especially).
    qc.removeQueries({ queryKey: ['bulkLeads'] });
    leads.forEach((l) => void qc.invalidateQueries({ queryKey: ['lead', l.id] }));
    if (failed) showAlert(t('bulk.someFailed', { count: failed }));
    onClose(true);
  };

  const busy = progress !== null;
  const ready = target && (target.kind === 'dropdown' ? value !== null : picked.size > 0);

  return (
    <Sheet
      open
      onClose={() => (target && !busy ? setTarget(null) : onClose(false))}
      locked={busy}
      title={target ? titleOf(target) : t('bulk.title', { count: ids.length })}
      subtitle={target ? t('bulk.title', { count: ids.length }) : t('bulk.sub')}
      footer={
        target ? (
          <Button
            title={busy ? t('bulk.updating', { done: progress, count: leads.length }) : t('bulk.apply', { count: leads.length })}
            disabled={!ready || busy || !leads.length}
            loading={busy}
            onPress={() => void apply()}
          />
        ) : undefined
      }
    >
      {loaded.isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ padding: 24 }} />
      ) : !target ? (
        <View style={{ gap: 2 }}>
          {targets.map((x) => (
            <Pressable
              key={x.kind === 'dropdown' ? x.slug : x.kind}
              onPress={() => {
                setTarget(x);
                setValue(null);
                setPicked(new Set());
              }}
              style={[styles.row, { borderRadius: radius.md }]}
            >
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                {titleOf(x)}
              </Text>
              <ChevronRight size={18} color={colors.textFaint} style={rtlFlip()} />
            </Pressable>
          ))}
        </View>
      ) : target.kind === 'dropdown' ? (
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          {target.options.map((o) => (
            <Chip key={o} label={o} selected={value === o} onPress={() => setValue(o)} />
          ))}
          <Chip label={t('bulk.clear')} selected={value === ''} onPress={() => setValue('')} />
        </Row>
      ) : (
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          {(tags.data ?? []).map((tg) => (
            <Chip
              key={tg.id}
              label={tg.name}
              selected={picked.has(tg.id)}
              onPress={() => {
                const next = new Set(picked);
                if (next.has(tg.id)) next.delete(tg.id);
                else next.add(tg.id);
                setPicked(next);
              }}
            />
          ))}
          {!tags.isLoading && !tags.data?.length ? <Text tone="muted">{t('bulk.noTags')}</Text> : null}
        </Row>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 8 },
});

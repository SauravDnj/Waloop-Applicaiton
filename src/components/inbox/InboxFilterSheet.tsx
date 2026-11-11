/**
 * Inbox filters: the views CPaaS supports beyond the tabs (read state, new,
 * open / closed, 24-hour window, automation, blocked). Assignment is a tab of
 * its own. Contact conditions (tags, stages, fields, segments) have their own
 * button beside it.
 */
import type { ChatListFilter } from '@ab-ecosystem/cpaas';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button, Chip, Row, Sheet, Text } from '@/components/ui';
import { countActiveFilters, type LeadFilter } from '@/lib/filters';

export type InboxFilter = { view: ChatListFilter; lead: LeadFilter };
export const EMPTY_INBOX_FILTER: InboxFilter = { view: {}, lead: {} };

export const countInboxFilters = (f: InboxFilter) => Object.values(f.view).filter(Boolean).length + countActiveFilters(f.lead);

type Group = { key: keyof ChatListFilter; options: string[] };
const GROUPS: Group[] = [
  { key: 'unread', options: ['unread', 'replied'] },
  { key: 'new', options: ['new', 'old'] },
  { key: 'closed', options: ['open', 'closed'] },
  { key: 'session', options: ['active', 'expired'] },
  { key: 'automation', options: ['active', 'paused'] },
  { key: 'block', options: ['ic', 'unblocked'] },
];

export function InboxFilterSheet({ value, onClose, onApply }: { value: InboxFilter; onClose: () => void; onApply: (f: InboxFilter) => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<InboxFilter>(value);

  const pick = (key: keyof ChatListFilter, option: string) =>
    setDraft((d) => ({ ...d, view: { ...d.view, [key]: d.view[key] === option ? undefined : option } as ChatListFilter }));

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={t('inbox.filters')}
        footer={
          <Row gap={10}>
            <Button title={t('inbox.clearFilters')} variant="ghost" style={{ flex: 1 }} onPress={() => onApply(EMPTY_INBOX_FILTER)} />
            <Button title={t('filter.apply', { count: countInboxFilters(draft) })} style={{ flex: 1 }} onPress={() => onApply(draft)} />
          </Row>
        }
      >
        <View style={{ gap: 14 }}>
          {GROUPS.map((g) => (
            <View key={g.key} style={{ gap: 6 }}>
              <Text variant="caption" tone="muted">
                {t(`inbox.f.${g.key}`)}
              </Text>
              <Row gap={6} style={{ flexWrap: 'wrap' }}>
                {g.options.map((o) => (
                  <Chip key={o} small label={t(`inbox.f.${g.key}_${o}`)} selected={draft.view[g.key] === o} onPress={() => pick(g.key, o)} />
                ))}
              </Row>
            </View>
          ))}
        </View>
      </Sheet>
    </>
  );
}

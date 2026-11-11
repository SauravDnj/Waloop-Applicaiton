/** Options for a chat: info, transfer, done / close, automation, chatbot, tags, pin, read state, archive, block, delete. */
import type { Chat } from '@ab-ecosystem/cpaas';
import {
  Archive,
  ArchiveRestore,
  BadgeCheck,
  Ban,
  Bot,
  CheckCheck,
  CircleCheck,
  Info,
  Mail,
  Pause,
  Pin,
  PinOff,
  Play,
  ShieldCheck,
  Tag,
  Trash2,
  UserRoundCog,
} from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Sheet, Text } from '@/components/ui';
import { useTeam } from '@/hooks/queries';
import { useCan } from '@/stores/auth';
import { P } from '@/lib/permissions';
import type { Teammate } from '@/services/sso/client';
import { confirmAction, showAlert } from '@/lib/dialog';
import { describeCrmError } from '@/services/crm/client';
import { automationState, chatAction, markDone, transferChat, type ChatAction } from '@/services/inbox/manager';
import { AutomationSheet, ChatbotSheet, ChatInfoSheet, TagsSheet } from './ChatSubSheets';
import { MAX_PINS, usePinStore, usePins } from '@/services/inbox/pins';
import { useTheme } from '@/theme/ThemeProvider';

/** The chat's actions. `only`: just the status shortcuts (done, close, archive, read) or straight to assigning. */
export function ChatActionsSheet({
  acct,
  chat,
  title,
  onClose,
  only,
}: {
  acct: string;
  chat: Chat;
  title: string;
  onClose: () => void;
  only?: 'status' | 'assign';
}) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const pins = usePins(acct);
  const togglePin = usePinStore((s) => s.toggle);
  const meta = chat.chat_metadata;
  const pinned = pins.includes(chat.id);
  const unread = (meta?.unread ?? 0) > 0 || !!meta?.marked_as_unread;
  const blocked = !!meta?.blocked?.incoming || !!meta?.blocked?.outgoing;
  const [transferring, setTransferring] = useState(only === 'assign');
  const [mode, setMode] = useState<'automation' | 'bot' | 'tags' | 'info' | null>(null);
  const auto = automationState(chat);
  const team = useTeam();
  const can = {
    update: useCan(P.chats.update),
    transfer: useCan(P.chats.transfer),
    delete: useCan(P.chats.delete),
  };

  const transfer = async (m: Teammate) => {
    onClose();
    await transferChat(acct, chat, m.userId)
      .then(() => showAlert(t('inbox.transferred', { name: m.name })))
      .catch((e: unknown) => showAlert(t('inbox.actionFailed'), describeCrmError(e)));
  };

  const run = async (action: ChatAction) => {
    onClose();
    if (action === 'delete' || action === 'block') {
      const ok = await confirmAction({
        title: action === 'delete' ? t('inbox.deleteQ') : t('inbox.blockQ'),
        message: action === 'delete' ? t('inbox.deleteBody') : t('inbox.blockBody'),
        confirmText: action === 'delete' ? t('common.delete') : t('inbox.block'),
        cancelText: t('common.cancel'),
        destructive: true,
      });
      if (!ok) return;
    }
    await chatAction(acct, chat, action).catch((e: unknown) => showAlert(t('inbox.actionFailed'), describeCrmError(e)));
  };

  const all: { key: string; label: string; Icon: typeof Pin; danger?: boolean; onPress: () => void }[] = [
    {
      key: 'pin',
      label: pinned ? t('inbox.unpin') : t('inbox.pin'),
      Icon: pinned ? PinOff : Pin,
      onPress: () => {
        onClose();
        if (!pinned && pins.length >= MAX_PINS) return showAlert(t('inbox.pinLimit', { count: MAX_PINS }));
        togglePin(acct, chat.id);
      },
    },
    { key: 'info', label: t('inbox.chatInfo'), Icon: Info, onPress: () => setMode('info') },
    { key: 'transfer', label: t('inbox.transfer'), Icon: UserRoundCog, onPress: () => setTransferring(true) },
    ...(!meta?.marked_as_done
      ? [
          {
            key: 'done',
            label: t('inbox.markDone'),
            Icon: BadgeCheck,
            onPress: () => {
              onClose();
              void markDone(acct, chat).catch((e: unknown) => showAlert(t('inbox.actionFailed'), describeCrmError(e)));
            },
          },
        ]
      : []),
    {
      key: 'automation',
      label: auto === 'paused' ? t('inbox.resumeOrPause') : t('inbox.pauseAuto'),
      Icon: auto === 'paused' ? Play : Pause,
      onPress: () => setMode('automation'),
    },
    { key: 'bot', label: t('inbox.startBot'), Icon: Bot, onPress: () => setMode('bot') },
    { key: 'tags', label: t('inbox.editTags'), Icon: Tag, onPress: () => setMode('tags') },
    {
      key: 'read',
      label: unread ? t('inbox.markRead') : t('inbox.markUnread'),
      Icon: unread ? CheckCheck : Mail,
      onPress: () => void run(unread ? 'markRead' : 'markUnread'),
    },
    {
      key: 'archive',
      label: meta?.archived ? t('inbox.unarchive') : t('inbox.archive'),
      Icon: meta?.archived ? ArchiveRestore : Archive,
      onPress: () => void run(meta?.archived ? 'unarchive' : 'archive'),
    },
    ...(!meta?.closed ? [{ key: 'close', label: t('inbox.closeChat'), Icon: CircleCheck, onPress: () => void run('close') }] : []),
    {
      key: 'block',
      label: blocked ? t('inbox.unblock') : t('inbox.block'),
      Icon: blocked ? ShieldCheck : Ban,
      danger: !blocked,
      onPress: () => void run(blocked ? 'unblock' : 'block'),
    },
    { key: 'delete', label: t('inbox.deleteChat'), Icon: Trash2, danger: true, onPress: () => void run('delete') },
  ];
  // Only what the role allows (owners: everything). Pin and info are this device's / read-only.
  const needs: Record<string, boolean> = {
    transfer: can.transfer,
    delete: can.delete,
    done: can.update,
    close: can.update,
    automation: can.update,
    bot: can.update,
    tags: can.update,
    read: can.update,
    archive: can.update,
    block: can.update,
  };
  const STATUS = ['done', 'close', 'archive', 'read'];
  const items = all.filter((i) => (needs[i.key] ?? true) && (only !== 'status' || STATUS.includes(i.key)));

  if (mode === 'automation') return <AutomationSheet acct={acct} chat={chat} onClose={onClose} />;
  if (mode === 'bot') return <ChatbotSheet acct={acct} chat={chat} onClose={onClose} />;
  if (mode === 'tags') return <TagsSheet acct={acct} chat={chat} onClose={onClose} />;
  if (mode === 'info') return <ChatInfoSheet acct={acct} chat={chat} onClose={onClose} />;

  if (transferring) {
    return (
      <Sheet open onClose={onClose} title={t('inbox.transferTo')}>
        <View style={{ gap: 2 }}>
          {team.isLoading ? <ActivityIndicator color={colors.primary} style={{ padding: 16 }} /> : null}
          {/* Nothing to pick from: say why, with a retry, rather than an empty sheet. */}
          {!team.isLoading && !team.data?.length ? (
            <View style={{ padding: 12, gap: 10 }}>
              <Text tone={team.isError ? 'danger' : 'muted'}>{team.isError ? describeCrmError(team.error) : t('inbox.noTeammates')}</Text>
              <Pressable onPress={() => void team.refetch()} hitSlop={8} accessibilityRole="button">
                <Text tone="primary" style={{ fontWeight: '600' }}>
                  {t('common.retry')}
                </Text>
              </Pressable>
            </View>
          ) : null}
          {(team.data ?? []).map((m) => (
            <Pressable
              key={m.userId}
              onPress={() => void transfer(m)}
              style={({ pressed }) => [styles.row, { borderRadius: radius.md, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' }]}
            >
              <Avatar name={m.name} size={34} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{m.name}</Text>
                <Text variant="caption" tone="muted">
                  {m.roleTitle || m.email}
                </Text>
              </View>
              {chat.agent === m.userId ? (
                <Text variant="caption" tone="primary">
                  {t('inbox.assigned')}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      </Sheet>
    );
  }

  return (
    <Sheet open onClose={onClose} title={title}>
      <View style={{ gap: 2 }}>
        {items.map(({ key, label, Icon, danger, onPress }) => (
          <Pressable
            key={key}
            onPress={onPress}
            style={({ pressed }) => [styles.row, { borderRadius: radius.md, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' }]}
          >
            <Icon size={20} color={danger ? colors.danger : colors.textMuted} />
            <Text variant="bodyStrong" style={{ color: danger ? colors.danger : colors.text }}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, paddingHorizontal: 8 },
});

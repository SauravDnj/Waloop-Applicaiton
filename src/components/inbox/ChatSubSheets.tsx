/**
 * Chat options that need their own sheet: automation (pause / resume / pause
 * for a while), start a chatbot, edit tags, and chat info (assignee,
 * automation, ad referral, reply windows, blocks).
 */
import type { Chat } from '@ab-ecosystem/cpaas';
import { useQuery } from '@tanstack/react-query';
import { Bot, ExternalLink, Pause, Play, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';

import { Button, Chip, Input, Row, Sheet, Text } from '@/components/ui';
import { useTags, useTeam, useWaChannels } from '@/hooks/queries';
import { showAlert } from '@/lib/dialog';
import { formatPhone } from '@/lib/phone';
import { describeCrmError } from '@/services/crm/client';
import { useBotStore, useSavedBots } from '@/services/inbox/bots';
import { automationState, chatReferrals, inboxFor, setAutomation, setChatTags, startChatbot } from '@/services/inbox/manager';
import { channelFor, identifierOf } from '@/services/inbox/send';
import { useTheme } from '@/theme/ThemeProvider';

const fail = (t: (k: string) => string) => (e: unknown) => showAlert(t('inbox.actionFailed'), describeCrmError(e));

const PAUSES = [3600, 4 * 3600, 24 * 3600, 7 * 86400];

export function AutomationSheet({ acct, chat, onClose }: { acct: string; chat: Chat; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const state = automationState(chat);
  const run = (action: 'pause' | 'resume', seconds?: number) => {
    onClose();
    void setAutomation(acct, chat, action, seconds)
      .then(() => showAlert(action === 'resume' ? t('inbox.autoResumed') : t('inbox.autoPaused')))
      .catch(fail(t));
  };
  return (
    <Sheet open onClose={onClose} title={t('inbox.automation')} subtitle={t(`inbox.auto.${state}`)}>
      <View style={{ gap: 10 }}>
        {state === 'paused' ? <Button title={t('inbox.resumeAuto')} icon={<Play size={16} color="#fff" />} onPress={() => run('resume')} /> : null}
        <Text variant="caption" tone="muted">
          {t('inbox.pauseFor')}
        </Text>
        <Row gap={6} style={{ flexWrap: 'wrap' }}>
          {PAUSES.map((s) => (
            <Chip key={s} label={t(`inbox.pause.${s}`)} onPress={() => run('pause', s)} />
          ))}
        </Row>
        <Button variant="secondary" title={t('inbox.pauseNow')} icon={<Pause size={16} color={colors.primary} />} onPress={() => run('pause')} />
        <Text variant="caption" tone="faint">
          {t('inbox.pauseHint')}
        </Text>
      </View>
    </Sheet>
  );
}

export function ChatbotSheet({ acct, chat, onClose }: { acct: string; chat: Chat; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const bots = useSavedBots(acct);
  const save = useBotStore((s) => s.save);
  const remove = useBotStore((s) => s.remove);
  const [adding, setAdding] = useState(!bots.length);
  const [name, setName] = useState('');
  const [id, setId] = useState('');
  const [node, setNode] = useState('');
  const channel = channelFor(acct, chat.id);

  const start = (bot: { id: string; node: string; name: string }) => {
    onClose();
    void startChatbot(acct, chat, channel, bot.id, bot.node)
      .then(() => showAlert(t('inbox.botStarted', { name: bot.name || bot.id })))
      .catch(fail(t));
  };

  return (
    <Sheet open onClose={onClose} title={t('inbox.startBot')} subtitle={t('inbox.startBotSub')}>
      <View style={{ gap: 8 }}>
        {bots.map((b) => (
          <View key={`${b.id}:${b.node}`} style={[styles.bot, { borderColor: colors.border, borderRadius: radius.md }]}>
            <Bot size={18} color={colors.primary} />
            <Pressable style={{ flex: 1 }} onPress={() => start(b)}>
              <Text variant="bodyStrong">{b.name || b.id}</Text>
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {b.node ? `${b.id} · ${b.node}` : b.id}
              </Text>
            </Pressable>
            <Pressable onPress={() => remove(acct, b.id)} hitSlop={8}>
              <Trash2 size={16} color={colors.textFaint} />
            </Pressable>
          </View>
        ))}
        {adding ? (
          <View style={{ gap: 8 }}>
            <Input label={t('inbox.botName')} value={name} onChangeText={setName} placeholder={t('inbox.botNamePh')} />
            <Input label={t('inbox.botId')} value={id} onChangeText={setId} autoCapitalize="none" placeholder={t('inbox.botIdPh')} />
            <Input label={t('inbox.botNode')} value={node} onChangeText={setNode} autoCapitalize="none" placeholder={t('inbox.botNodePh')} />
            <Button
              title={t('inbox.saveAndStart')}
              disabled={!id.trim()}
              onPress={() => {
                const bot = { id: id.trim(), name: name.trim(), node: node.trim() };
                save(acct, bot);
                start(bot);
              }}
            />
          </View>
        ) : (
          <Button variant="ghost" title={t('inbox.addBot')} onPress={() => setAdding(true)} />
        )}
      </View>
    </Sheet>
  );
}

export function TagsSheet({ acct, chat, onClose }: { acct: string; chat: Chat; onClose: () => void }) {
  const { t } = useTranslation();
  const tags = useTags();
  const [picked, setPicked] = useState<string[]>(() => (chat.tags ?? []).map((x) => x.id));
  const toggle = (tid: string) => setPicked((cur) => (cur.includes(tid) ? cur.filter((x) => x !== tid) : [...cur, tid]));
  return (
    <Sheet
      open
      onClose={onClose}
      title={t('inbox.editTags')}
      footer={
        <Button
          title={t('common.save')}
          onPress={() => {
            onClose();
            void setChatTags(acct, chat, picked).catch(fail(t));
          }}
        />
      }
    >
      {tags.isLoading ? <ActivityIndicator /> : null}
      <Row gap={6} style={{ flexWrap: 'wrap' }}>
        {(tags.data ?? []).map((tag) => (
          <Chip key={tag.id} label={tag.name} selected={picked.includes(tag.id)} onPress={() => toggle(tag.id)} />
        ))}
      </Row>
      {!tags.isLoading && !tags.data?.length ? (
        <Text variant="caption" tone="muted">
          {t('inbox.noTags')}
        </Text>
      ) : null}
    </Sheet>
  );
}

export function ChatInfoSheet({ acct, chat, onClose }: { acct: string; chat: Chat; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const team = useTeam();
  const channels = useWaChannels();
  const sessions = useQuery({ queryKey: ['inbox', 'sessions', acct, chat.id, 'info'], queryFn: () => inboxFor(acct)?.sessions(chat.id) ?? [] });
  const referrals = useQuery({ queryKey: ['inbox', 'referrals', acct, chat.id], queryFn: () => chatReferrals(acct, chat.id) });
  const meta = chat.chat_metadata;
  const agent = team.data?.find((m) => m.userId === chat.agent);
  const now = sessions.dataUpdatedAt / 1000;
  const blocked = Object.entries(meta?.blocked ?? {})
    .filter(([, v]) => v)
    .map(([k]) => t(`inbox.blocked.${k}`));
  const rows: [string, string][] = [
    [t('inbox.phone'), formatPhone(identifierOf(chat))],
    [t('inbox.assignedTo'), chat.agent ? (agent?.name ?? t('inbox.someone')) : t('inbox.f.assignment_none')],
    [t('inbox.automation'), t(`inbox.auto.${automationState(chat)}`)],
    [t('inbox.f.closed'), meta?.marked_as_done ? t('inbox.done') : meta?.closed ? t('inbox.f.closed_closed') : t('inbox.f.closed_open')],
    ...(blocked.length ? ([[t('inbox.f.block'), blocked.join(', ')]] as [string, string][]) : []),
    ...((chat.tags ?? []).length ? ([[t('inbox.tags'), (chat.tags ?? []).map((x) => x.name).join(', ')]] as [string, string][]) : []),
  ];
  return (
    <Sheet open onClose={onClose} title={t('inbox.chatInfo')}>
      <View style={{ gap: 12 }}>
        {rows.map(([k, v]) => (
          <View key={k} style={styles.kv}>
            <Text tone="muted">{k}</Text>
            <Text variant="bodyStrong" style={{ flexShrink: 1, textAlign: 'right' }}>
              {v}
            </Text>
          </View>
        ))}
        <Text variant="caption" tone="muted">
          {t('inbox.windows')}
        </Text>
        {(channels.data ?? []).map((ch) => {
          const seen = sessions.data?.find((x) => x.channel === ch.id)?.last_seen ?? 0;
          const open = !!seen && now - seen < 86400;
          return (
            <View key={ch.id} style={styles.kv}>
              <Text>{ch.name}</Text>
              <Text variant="caption" tone={open ? 'success' : 'muted'}>
                {open ? t('inbox.windowOpen') : t('inbox.windowClosed')}
              </Text>
            </View>
          );
        })}
        {referrals.data?.length ? (
          <View style={[styles.ad, { backgroundColor: colors.surfaceAlt, borderRadius: radius.md }]}>
            <Text variant="caption" tone="muted">
              {t('inbox.fromAd')}
            </Text>
            {referrals.data.map((r) => {
              const p = r.payload as { headline?: string; body?: string; source_url?: string; source_type?: string };
              return (
                <Pressable key={r.id} disabled={!p.source_url} onPress={() => p.source_url && void Linking.openURL(p.source_url)} style={{ gap: 2 }}>
                  <Row gap={6}>
                    <Text variant="bodyStrong" style={{ flex: 1 }}>
                      {p.headline || p.source_type || t('inbox.ad')}
                    </Text>
                    {p.source_url ? <ExternalLink size={14} color={colors.primary} /> : null}
                  </Row>
                  {p.body ? (
                    <Text variant="caption" tone="muted" numberOfLines={3}>
                      {p.body}
                    </Text>
                  ) : null}
                  <Text variant="micro" tone="faint">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  bot: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  ad: { padding: 12, gap: 8 },
});

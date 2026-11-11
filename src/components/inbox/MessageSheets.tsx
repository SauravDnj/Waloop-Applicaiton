/**
 * Sheets for one chat message:
 *  - MessageMenu: reply, forward, copy, save to phone, info, delete;
 *  - MessageInfo: status with times, channel, and for a failed send the reason
 *    in plain words, plus the raw message for support;
 *  - ForwardSheet: pick a chat to send copies of one or more messages to.
 */
import type { Chat } from '@ab-ecosystem/cpaas';
import * as Clipboard from 'expo-clipboard';
import { CircleAlert, Copy, Download, Forward, Info, RefreshCw, Reply, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar, SearchField, Sheet, Text } from '@/components/ui';
import { confirmAction, showAlert } from '@/lib/dialog';
import { formatPhone } from '@/lib/phone';
import { describeCrmError } from '@/services/crm/client';
import { KNOWN_CODES, parseDeliveryError } from '@/services/inbox/errors';
import { deleteMessage, retryMediaDownload } from '@/services/inbox/manager';
import { useCan } from '@/stores/auth';
import { P } from '@/lib/permissions';
import { saveMedia, saveAllMedia } from '@/services/inbox/download';
import { previewText, renderContent, templateMedia, type Rendered } from '@/services/inbox/render';
import { channelFor, identifierOf, sendContents } from '@/services/inbox/send';
import { useAccountInbox, type ChatMessage } from '@/services/inbox/store';
import { useTheme } from '@/theme/ThemeProvider';

/** A photo, video, voice note or document whose file the platform hasn't got (download failed). */
const isUnloadedMedia = (m: ChatMessage) => {
  const r = renderContent(m.content);
  return r.kind === 'media' && !r.link;
};

/** The file a message carries that can be saved to the phone (a template's media header too). */
export const savableMedia = (m: ChatMessage): Extract<Rendered, { kind: 'media' }> | null => {
  const r = renderContent(m.content);
  const media = r.kind === 'template' ? templateMedia(r) : r;
  return media?.kind === 'media' && /^https?:/.test(media.link) ? media : null;
};

/**
 * Saves messages' media: photos and videos to the photo library together, other files one by
 * one through the share sheet. Says how it went.
 */
export const saveMessagesMedia = async (messages: ChatMessage[], t: (k: string, o?: Record<string, unknown>) => string) => {
  const files = messages.map(savableMedia).filter((x): x is NonNullable<typeof x> => !!x);
  const pics = files.filter((f) => f.media === 'image' || f.media === 'video');
  const others = files.filter((f) => !pics.includes(f));
  try {
    // Share sheets first, one after another; then one alert about the photos (an alert and a
    // share sheet at the same moment collide on iOS).
    for (const f of others) await saveMedia(f.link, f.media, f.filename, f.mime);
    if (pics.length) {
      const n =
        pics.length === 1
          ? await saveMedia(pics[0].link, pics[0].media, pics[0].filename, pics[0].mime)
          : await saveAllMedia(pics.map((f) => ({ link: f.link, kind: f.media, filename: f.filename })));
      if (n === 'denied') return showAlert(t('inbox.saveDenied'));
      showAlert(t('inbox.savedToPhone', { count: pics.length }));
    }
  } catch (e) {
    showAlert(t('inbox.saveFailed'), e instanceof Error ? e.message : '');
  }
};

/** Text that can be copied from a message: its text, caption or template body. */
export const copyableText = (m: ChatMessage) => {
  const r = renderContent(m.content);
  if (r.kind === 'text') return r.text;
  if (r.kind === 'media') return r.caption;
  if (r.kind === 'interactive') return [r.header, r.body, r.footer].filter(Boolean).join('\n');
  return '';
};

export function MessageMenu({
  acct,
  chatId,
  m,
  onClose,
  onReply,
  onForward,
  onInfo,
}: {
  acct: string;
  chatId: string;
  m: ChatMessage;
  onClose: () => void;
  onReply: () => void;
  onForward: () => void;
  onInfo: () => void;
}) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const text = copyableText(m);
  const canSend = useCan(P.chats.send);
  const canDelete = useCan(P.chats.delete);
  const all: { key: string; label: string; Icon: typeof Reply; danger?: boolean; onPress: () => void }[] = [
    { key: 'reply', label: t('inbox.reply'), Icon: Reply, onPress: onReply },
    { key: 'forward', label: t('inbox.forward'), Icon: Forward, onPress: onForward },
    ...(text
      ? [
          {
            key: 'copy',
            label: t('common.copy'),
            Icon: Copy,
            onPress: () => {
              onClose();
              void Clipboard.setStringAsync(text);
            },
          },
        ]
      : []),
    ...(savableMedia(m)
      ? [
          {
            key: 'save',
            label: t('inbox.saveToPhone'),
            Icon: Download,
            onPress: () => {
              onClose();
              void saveMessagesMedia([m], t);
            },
          },
        ]
      : []),
    { key: 'info', label: t('inbox.info'), Icon: Info, onPress: onInfo },
    ...(isUnloadedMedia(m)
      ? [
          {
            key: 'retry',
            label: t('inbox.retryDownload'),
            Icon: RefreshCw,
            onPress: () => {
              onClose();
              void retryMediaDownload(acct, m.id).catch((e: unknown) => showAlert(t('inbox.actionFailed'), describeCrmError(e)));
            },
          },
        ]
      : []),
    {
      key: 'delete',
      label: t('common.delete'),
      Icon: Trash2,
      danger: true,
      onPress: () => {
        onClose();
        void confirmAction({
          title: t('inbox.deleteMsgQ'),
          message: t('inbox.deleteMsgBody'),
          confirmText: t('common.delete'),
          cancelText: t('common.cancel'),
          destructive: true,
        }).then((ok) => {
          if (ok) void deleteMessage(acct, chatId, m.id).catch((e: unknown) => showAlert(t('inbox.actionFailed'), describeCrmError(e)));
        });
      },
    },
  ];
  // Replying and forwarding send a message; deleting needs its own permission (owners: everything).
  const actions = all.filter((i) => (i.key === 'delete' ? canDelete : i.key === 'reply' || i.key === 'forward' ? canSend : true));
  return (
    <Sheet open onClose={onClose}>
      <Text numberOfLines={2} tone="muted" style={{ marginBottom: 8 }}>
        {previewText(m.content)}
      </Text>
      <View style={styles.grid}>
        {actions.map(({ key, label, Icon, danger, onPress }) => (
          <Pressable
            key={key}
            onPress={onPress}
            style={({ pressed }) => [styles.tile, { borderRadius: radius.md, backgroundColor: pressed ? colors.surfaceAlt : colors.background }]}
          >
            <Icon size={22} color={danger ? colors.danger : colors.primary} />
            <Text variant="caption" style={{ color: danger ? colors.danger : colors.text, fontWeight: '600' }}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

export function MessageInfo({ m, channelName, onClose }: { m: ChatMessage; channelName?: string; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const err = m.status === 'failed' ? parseDeliveryError(m.failedText || m.error) : null;
  const receipts = (m.receipts ?? {}) as Partial<Record<'sent' | 'delivered' | 'read' | 'failed', number>>;
  const at = (s?: number) => (s ? new Date(s * 1000).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—');
  const rows: [string, string][] = [
    [t('inbox.status'), t(`inbox.st.${m.pending ? 'pending' : m.status}`, { defaultValue: m.status })],
    [t('inbox.sentAt'), at(receipts.sent ?? m.timestamp)],
    ...(receipts.delivered ? ([[t('inbox.deliveredAt'), at(receipts.delivered)]] as [string, string][]) : []),
    ...(receipts.read ? ([[t('inbox.readAt'), at(receipts.read)]] as [string, string][]) : []),
    ...(channelName ? ([[t('inbox.via'), channelName]] as [string, string][]) : []),
  ];
  return (
    <Sheet open onClose={onClose} title={t('inbox.info')}>
      <View style={{ gap: 12 }}>
        {err ? (
          <View style={[styles.errBox, { backgroundColor: colors.dangerSoft, borderRadius: radius.md }]}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <CircleAlert size={18} color={colors.danger} />
              <Text variant="bodyStrong" style={{ color: colors.danger, flex: 1 }}>
                {err.title || t('inbox.notSent')}
              </Text>
            </View>
            <Text style={{ color: colors.text }}>{err.code && KNOWN_CODES.includes(err.code) ? t(`inbox.err.${err.code}`) : t('inbox.err.generic')}</Text>
            {err.code ? (
              <Text variant="caption" tone="muted">
                {t('inbox.errCode', { code: err.code })}
                {err.details && err.details !== err.title ? ` · ${err.details}` : ''}
              </Text>
            ) : null}
          </View>
        ) : null}
        {rows.map(([k, v]) => (
          <View key={k} style={styles.kv}>
            <Text tone="muted">{k}</Text>
            <Text variant="bodyStrong" style={{ flexShrink: 1, textAlign: 'right' }}>
              {v}
            </Text>
          </View>
        ))}
      </View>
    </Sheet>
  );
}

export function ForwardSheet({ acct, messages, onClose }: { acct: string; messages: ChatMessage[]; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const inbox = useAccountInbox(acct);
  const [q, setQ] = useState('');
  const nameOf = (c: Chat) => [c.name?.first_name, c.name?.last_name].filter(Boolean).join(' ') || formatPhone(identifierOf(c));
  const list = inbox.chats
    .filter((c) => !q.trim() || nameOf(c).toLowerCase().includes(q.trim().toLowerCase()) || identifierOf(c).includes(q.replace(/\D/g, '') || '§'))
    .slice(0, 50);

  const send = async (to: Chat) => {
    onClose();
    // A reaction belongs to its message in this chat: it isn't forwarded.
    const forwardable = messages.filter((m) => m.content?.type !== 'reaction');
    if (!forwardable.length) return;
    // Templates need their approved definition and the window rules; send one from the chat instead.
    const contents = forwardable.filter((m) => m.content?.type !== 'template').map((m) => m.content);
    if (!contents.length) return showAlert(t('inbox.cantForwardTemplate'), t('inbox.cantForwardTemplateBody'));
    if (contents.length < forwardable.length) showAlert(t('inbox.cantForwardTemplate'), t('inbox.cantForwardTemplateBody'));
    // In the order they were sent.
    const ok = await sendContents(acct, to, channelFor(acct, to.id), contents).then(
      () => true,
      (e: unknown) => {
        showAlert(t('inbox.actionFailed'), describeCrmError(e));
        return false;
      },
    );
    if (ok) showAlert(t('inbox.forwarded', { name: nameOf(to) }));
  };

  return (
    <Sheet open onClose={onClose} title={t('inbox.forwardTo')} subtitle={messages.length > 1 ? t('inbox.nMessages', { count: messages.length }) : undefined}>
      <View style={{ gap: 8 }}>
        <SearchField value={q} onChangeText={setQ} placeholder={t('inbox.search')} />
        {list.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => void send(c)}
            style={({ pressed }) => [styles.chat, { borderRadius: radius.md, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' }]}
          >
            <Avatar name={nameOf(c)} uri={c.profile?.whatsapp?.profile_pic} size={36} />
            <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
              {nameOf(c)}
            </Text>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '31%', flexGrow: 1, alignItems: 'center', gap: 6, paddingVertical: 14 },
  errBox: { padding: 12, gap: 6 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  chat: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8 },
});

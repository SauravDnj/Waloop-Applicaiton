/**
 * Something shared into the app from another app (text, a link, photos,
 * videos, files): pick the chat to send it to. Files go first (checked and
 * converted like attachments picked in a chat), then the text, which can be
 * edited before sending. The chat opens afterwards so its delivery shows.
 */
import type { Chat } from '@ab-ecosystem/cpaas';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { clearSharedPayloads as dropShared, useIncomingShare } from 'expo-sharing';
import { FileText, Share2, Video as VideoIcon, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Avatar, EmptyState, Screen, SearchField, Text } from '@/components/ui';
import { showAlert } from '@/lib/dialog';
import { formatPhone } from '@/lib/phone';
import { describeCrmError } from '@/services/crm/client';
import { searchChats } from '@/services/inbox/manager';
import { prepareAll } from '@/services/inbox/media';
import { channelFor, identifierOf, sendFiles, sendText } from '@/services/inbox/send';
import { useAccountInbox } from '@/services/inbox/store';
import { useAccountsStore } from '@/stores/accounts';
import { useCan } from '@/stores/auth';
import { P } from '@/lib/permissions';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/tokens';

const nameOf = (c: Chat) => [c.name?.first_name, c.name?.last_name].filter(Boolean).join(' ') || formatPhone(identifierOf(c));

export default function ShareScreen() {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const acct = useAccountsStore((s) => s.activeId);
  const inbox = useAccountInbox(acct);
  const canSend = useCan(P.chats.send);
  const { resolvedSharedPayloads: payloads, isResolving, clearSharedPayloads } = useIncomingShare();
  // A file on the phone is sent as a file; anything else (text, a web link, even one that
  // points at a picture) goes as text.
  const isFile = (p: (typeof payloads)[number]) =>
    !!p.contentType && p.contentType !== 'text' && p.contentType !== 'website' && /^(file|content):/.test(p.contentUri ?? '');
  const files = payloads.filter(isFile);
  const shared = payloads
    .filter((p) => !isFile(p))
    .map((p) => p.value)
    .filter(Boolean)
    .join('\n');
  const [text, setText] = useState('');
  const [textFor, setTextFor] = useState('');
  if (shared !== textFor) {
    setTextFor(shared);
    setText(shared);
  }
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Chat[] | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const seq = useRef(0);
  // Leaving without sending drops what was shared, so it never turns up later.
  useEffect(() => () => dropShared(), []);

  // Searched as you type, a moment after the last key; under 2 letters the recent chats show.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const search = (v: string) => {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    const term = v.trim();
    const n = (seq.current += 1);
    if (!acct || term.length < 2) return setFound(null);
    timer.current = setTimeout(() => void searchChats(acct, term).then((r) => n === seq.current && setFound(r)), 300);
  };

  const send = async (chat: Chat) => {
    if (!acct || sending) return;
    setSending(chat.id);
    try {
      const channel = channelFor(acct, chat.id);
      if (files.length) {
        const { accepted, rejected } = await prepareAll(
          files.map((f) => ({ uri: f.contentUri!, name: f.originalName || f.contentUri!.split('/').pop() || 'file', mimeType: f.contentMimeType ?? '', size: f.contentSize ?? 0 })),
        );
        if (rejected.length) showAlert(t('inbox.cannotSend'), rejected.map((r) => `• ${r.name}`).join('\n'));
        if (accepted.length) await sendFiles(acct, chat, channel, accepted);
      }
      if (text.trim()) await sendText(acct, chat, channel, text.trim());
      clearSharedPayloads();
      router.replace({ pathname: '/(app)/chat/[id]', params: { id: chat.id } });
    } catch (e) {
      showAlert(t('inbox.actionFailed'), describeCrmError(e));
    } finally {
      setSending(null);
    }
  };

  const chats = found ?? inbox.chats.slice(0, 40);
  const nothing = !isResolving && !files.length && !shared;

  return (
    <Screen title={t('share.title')} back>
      {isResolving ? (
        <ActivityIndicator color={colors.primary} style={{ padding: 24 }} />
      ) : nothing ? (
        <EmptyState icon={<Share2 size={26} color="#fff" />} title={t('share.emptyTitle')} body={t('share.emptyBody')} />
      ) : !canSend ? (
        <Text tone="muted">{t('perm.cantSend')}</Text>
      ) : (
        <View style={{ flex: 1, gap: 12, marginTop: 8 }}>
          {files.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ flexGrow: 0 }}>
              {files.map((f, i) => (
                <View key={`${f.contentUri}-${i}`} style={[styles.thumb, { backgroundColor: colors.surfaceAlt, borderRadius: radius.sm }]}>
                  {f.contentType === 'image' ? (
                    <Image source={{ uri: f.contentUri! }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  ) : f.contentType === 'video' ? (
                    <VideoIcon size={24} color={colors.textMuted} />
                  ) : (
                    <>
                      <FileText size={22} color={colors.textMuted} />
                      <Text variant="micro" tone="muted" numberOfLines={2} center style={{ letterSpacing: 0, paddingHorizontal: 4 }}>
                        {f.originalName ?? ''}
                      </Text>
                    </>
                  )}
                </View>
              ))}
            </ScrollView>
          ) : null}
          {shared || files.length ? (
            <View style={[styles.textBox, { borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.md }]}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={t('share.addMessage')}
                placeholderTextColor={colors.textFaint}
                multiline
                style={[styles.input, { color: colors.text, fontFamily: fonts.regular }]}
              />
              {text ? (
                <Pressable onPress={() => setText('')} hitSlop={10}>
                  <X size={16} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </View>
          ) : null}
          <Text variant="bodyStrong">{t('share.sendTo')}</Text>
          <SearchField value={q} onChangeText={search} placeholder={t('inbox.search')} />
          <FlatList
            data={chats}
            keyExtractor={(c) => c.id}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text tone="muted" center style={{ padding: 16 }}>
                {t('share.noChats')}
              </Text>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => void send(item)}
                disabled={!!sending}
                style={({ pressed }) => [styles.chat, { borderRadius: radius.md, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' }]}
              >
                <Avatar name={nameOf(item)} uri={item.profile?.whatsapp?.profile_pic} size={38} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {nameOf(item)}
                  </Text>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {formatPhone(identifierOf(item))}
                  </Text>
                </View>
                {sending === item.id ? <ActivityIndicator color={colors.primary} /> : null}
              </Pressable>
            )}
          />
          <Text variant="caption" tone="faint" center>
            {t('share.windowNote')}
          </Text>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  thumb: { width: 72, height: 72, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: 4 },
  textBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, borderWidth: 1 },
  input: { flex: 1, fontSize: 15, lineHeight: 20, maxHeight: 120, padding: 0 },
  chat: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8 },
});

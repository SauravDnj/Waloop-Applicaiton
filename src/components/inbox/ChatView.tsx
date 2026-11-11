/**
 * One WhatsApp conversation, live over the inbox socket. Older history loads
 * as you scroll up; long-press a message to reply to it. Outside WhatsApp's
 * 24-hour reply window only templates can be sent, so the composer locks and
 * offers the template sender instead. A long press selects messages (then tap
 * more) to forward, copy, save or delete them together, or (one message) to
 * react with an emoji; reactions show under their message. 4+ photos in a row show
 * as one album. Messages are grouped under day chips
 * (Today, Yesterday, the date) like WhatsApp, and each one shows the channel
 * it came over, since one contact can write on several.
 */
import type { Template } from '@ab-ecosystem/cpaas';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import {
  ArrowLeft,
  Bot,
  CircleCheckBig,
  Clock,
  Copy,
  Download,
  EllipsisVertical,
  FileText,
  Forward,
  Reply,
  Trash2,
  UserRoundCog,
  X,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, BackHandler, FlatList, Platform, Pressable, StyleSheet, View, type ListViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView, useKeyboardState } from 'react-native-keyboard-controller';

import { Composer } from '@/components/inbox/Composer';
import { MediaViewer, type ViewerState } from '@/components/inbox/MediaViewer';
import { ChatActionsSheet } from '@/components/inbox/ChatActionsSheet';
import { MessageBubble, type MessageChannel } from '@/components/inbox/MessageBubble';
import { ChannelIcon } from '@/components/channels/ChannelBits';
import { ContactChips } from '@/components/leads/ContactChips';
import { copyableText, ForwardSheet, MessageInfo, MessageMenu, saveMessagesMedia, savableMedia } from '@/components/inbox/MessageSheets';
import { MediaAlbum } from '@/components/inbox/MediaAlbum';
import { ReactionBar, ReactionSheet } from '@/components/inbox/Reactions';
import { collectReactions, myReaction, reactionOf, type Reaction } from '@/services/inbox/reactions';
import { groupAlbums, rowMessages, rowTime, type ThreadRow } from '@/services/inbox/albums';
import { confirmAction, showAlert } from '@/lib/dialog';
import { describeCrmError } from '@/services/crm/client';
import { useTabBarInset } from '@/components/navigation/FloatingTabBar';
import { Avatar, Button, Sheet, Text } from '@/components/ui';
import { goBack } from '@/lib/nav';
import { formatPhone } from '@/lib/phone';
import { automationState, closeChat, deleteMessage, inboxFor, loadThread, openChat } from '@/services/inbox/manager';
import { useNow } from '@/hooks/useNow';
import { useChannels } from '@/hooks/channels';
import { channelColor, channelName, channelType } from '@/services/crm/channels';
import { chatDayLabel, dayjs } from '@/lib/time';
import { useTemplates, useWaChannels } from '@/hooks/queries';
import { cachedTemplates } from '@/services/crm/whatsapp';
import { channelFor, identifierOf, sendReaction } from '@/services/inbox/send';
import { renderContent, templateMedia, type Rendered } from '@/services/inbox/render';
import { useAccountInbox, type ChatMessage } from '@/services/inbox/store';
import { useAccountsStore } from '@/stores/accounts';
import { useTheme } from '@/theme/ThemeProvider';
import { useCan } from '@/stores/auth';
import { isWebPreview } from '@/lib/webPreview';
import { P } from '@/lib/permissions';
import { rtlFlip } from '@/lib/rtl';
import { openContact } from '@/stores/contactPanel';

const DAY = 24 * 3600;
const dayKey = (ts: number) => dayjs(ts * 1000).format('YYYY-MM-DD');

function DayChip({ label }: { label: string }) {
  const { colors, scheme } = useTheme();
  return (
    <View style={[styles.dayChip, { backgroundColor: scheme === 'dark' ? '#182229' : '#FFFFFF', shadowColor: colors.text }]}>
      <Text variant="caption" style={{ color: scheme === 'dark' ? '#8696A0' : '#54656F', fontWeight: '600' }}>
        {label}
      </Text>
    </View>
  );
}

/**
 * One conversation. Full screen on phones (route `/chat/[id]`); on desktop web
 * it is the right pane of the Inbox (`embedded`: no back button).
 */
export function ChatView({ id, embedded = false }: { id: string; embedded?: boolean }) {
  const { t, i18n } = useTranslation();
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const bar = useTabBarInset();
  const qc = useQueryClient();
  const acct = useAccountsStore((s) => s.activeId);
  const inbox = useAccountInbox(acct);
  const chat = inbox.chats.find((c) => c.id === id);
  const thread = useMemo(() => inbox.threads[id] ?? [], [inbox.threads, id]);
  const [loading, setLoading] = useState(!thread.length);
  const [older, setOlder] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [viewer, setViewer] = useState<ViewerState>(null);
  const now = useNow(60_000) / 1000;
  // The composer rides above the keyboard (edge-to-edge Android doesn't resize the window).
  const keyboardOpen = useKeyboardState((s) => s.isVisible);

  useEffect(() => {
    if (!acct || !id) return;
    void openChat(acct, id);
    void loadThread(acct, id)
      .catch(() => undefined) // the thread shows what is cached; a pull or reconnect loads it again
      .finally(() => setLoading(false));
    return () => closeChat(acct, id);
  }, [acct, id]);

  // This chat's channel templates (from the phone, downloaded once if missing), so sent
  // templates show their full text with the values filled in.
  // One 24-hour window per channel: reply on the channel the contact wrote on most recently.
  // Re-read only when the contact writes (that is what moves a window), keeping the old answer meanwhile.
  const lastInboundId = [...thread].reverse().find((m) => m.direction === 'inbound')?.id ?? '';
  const sessions = useQuery({
    queryKey: ['inbox', 'sessions', acct, id, lastInboundId],
    placeholderData: keepPreviousData,
    // Local web preview has no socket: the sample chat's own time stands for its session.
    queryFn: () => (isWebPreview() ? [{ channel: 'preview-wa', last_seen: chat?.last_seen ?? 0 }] : (inboxFor(acct)?.sessions(id) ?? [])),
    enabled: !!acct && !!id && inbox.state === 'connected',
    staleTime: 60_000,
  });
  // The user can switch; otherwise the contact's most recent channel.
  const [pickedChannel, setPickedChannel] = useState<string | null>(null);
  const channelId = pickedChannel || sessions.data?.[0]?.channel || (acct && id ? channelFor(acct, id) : '');
  const [menuFor, setMenuFor] = useState<ChatMessage | null>(null);
  const [infoFor, setInfoFor] = useState<ChatMessage | null>(null);
  const [forwardFor, setForwardFor] = useState<ChatMessage[] | null>(null);
  // The message whose full emoji list is open.
  const [reactFor, setReactFor] = useState<ChatMessage | null>(null);
  // Selected messages (long press, then tap more), by id, in thread order when acted on.
  const [selected, setSelected] = useState<Map<string, ChatMessage>>(new Map());
  const [selectedFor, setSelectedFor] = useState(id);
  if (selectedFor !== id) {
    setSelectedFor(id);
    setSelected(new Map());
  }
  const [channelPicker, setChannelPicker] = useState(false);
  // The ⋮ menu, or one of the header shortcuts: status (done / close / archive / unread) and assign.
  const [chatMenu, setChatMenu] = useState<false | 'all' | 'status' | 'assign'>(false);
  const canUpdate = useCan(P.chats.update);
  const canTransfer = useCan(P.chats.transfer);
  const templates = useTemplates(channelId || null);
  const waChannels = useWaChannels();
  // Every channel (WhatsApp, Instagram, RCS…) by id, for the per-message badge. Roles that can't
  // list all channels still get their WhatsApp numbers.
  const allChannels = useChannels();
  const channelMap = useMemo(() => {
    const map = new Map<string, MessageChannel>();
    for (const c of waChannels.data ?? []) map.set(c.id, { kind: 'whatsapp', color: c.color, name: c.name });
    for (const c of allChannels.data ?? []) map.set(c.id, { kind: channelType(c), color: channelColor(c), name: channelName(c) });
    return map;
  }, [waChannels.data, allChannels.data]);
  const replyChannel = channelMap.get(channelId);
  const lookup = useCallback(
    (name: string, language: string): Template | undefined => {
      const match = (x: Template) => x.name === name && (!language || x.language === language);
      for (const [, data] of qc.getQueriesData<Template[]>({ queryKey: ['wa', 'templates'] })) {
        const hit = data?.find(match);
        if (hit) return hit;
      }
      for (const ch of waChannels.data ?? []) {
        const hit = cachedTemplates(ch.id)?.templates.find(match);
        if (hit) return hit;
      }
      return undefined;
    },
    // `dataUpdatedAt`: a new identity once templates arrive, so bubbles re-render with them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, waChannels.data, templates.dataUpdatedAt],
  );

  // A template not on the phone yet (created after the last download): fetch the list once.
  const unknownTemplate = thread.some((m) => {
    const r = renderContent(m.content, lookup);
    return r.kind === 'template' && !r.parsed;
  });
  const refetchTemplates = templates.refetch;
  const [refetchedFor, setRefetchedFor] = useState('');
  if (unknownTemplate && channelId && refetchedFor !== channelId && !templates.isFetching) {
    setRefetchedFor(channelId);
    void refetchTemplates();
  }

  const byProviderId = useMemo(() => new Map(thread.filter((m) => m.message_id).map((m) => [m.message_id, m])), [thread]);
  // Reactions sit under the message they react to, not in the list.
  const { reactions, rest } = useMemo(() => collectReactions(thread), [thread]);
  const reactionsOf = (ms: ChatMessage[]): Reaction[] | undefined => {
    // One message: the list itself, unchanged between renders (bubbles are memoized).
    if (ms.length === 1) return ms[0].message_id ? reactions.get(ms[0].message_id) : undefined;
    const all = ms.flatMap((m) => (m.message_id ? (reactions.get(m.message_id) ?? []) : []));
    return all.length ? all : undefined;
  };
  // Newest first for the inverted list; runs of photos become albums.
  const data = useMemo(() => groupAlbums(rest).reverse(), [rest]);
  const dayLabel = (ts: number) => chatDayLabel(ts * 1000, { today: t('inbox.today'), yesterday: t('inbox.yesterday') }, i18n.language);
  // While scrolling, the day of the oldest message on screen floats at the top (as on WhatsApp).
  const [floatingDay, setFloatingDay] = useState<number | null>(null);
  const [scrolling, setScrolling] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Stable: FlatList doesn't allow this handler to change between renders.
  const onViewable = useCallback(({ viewableItems }: { viewableItems: ListViewToken[] }) => {
    // Inverted: the highest index on screen is the topmost message.
    const top = viewableItems.reduce<ListViewToken | null>((a, v) => (!a || (v.index ?? 0) > (a.index ?? 0) ? v : a), null);
    if (top?.item) setFloatingDay(rowTime(top.item as ThreadRow));
  }, []);
  const scrollActive = () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    setScrolling(true);
  };
  const scrollIdle = () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setScrolling(false), 1500);
  };
  useEffect(() => () => void (idleTimer.current && clearTimeout(idleTimer.current)), []);
  const name = chat ? [chat.name?.first_name, chat.name?.last_name].filter(Boolean).join(' ') || formatPhone(identifierOf(chat)) : '…';
  const phone = chat ? identifierOf(chat) : '';
  const lastInbound = sessions.data ? (sessions.data.find((x) => x.channel === channelId)?.last_seen ?? 0) : (chat?.last_seen ?? 0);
  const expired = !!chat && (!lastInbound || now - lastInbound > DAY);
  const canSend = useCan(P.chats.send);

  const loadOlder = async () => {
    if (!acct || older) return;
    setOlder(true);
    await loadThread(acct, id, true).catch(() => undefined);
    setOlder(false);
  };

  // Every image in the thread, oldest first, so the lightbox can swipe through them.
  const images = useMemo(
    () =>
      thread
        // A template's image header counts too.
        .map((m) => {
          const r = renderContent(m.content);
          return r.kind === 'template' ? templateMedia(r) : r;
        })
        .filter(
          (r): r is Extract<Rendered, { kind: 'media' }> =>
            !!r && r.kind === 'media' && (r.media === 'image' || r.media === 'sticker') && /^https?:/.test(r.link),
        )
        .map((r) => r.link),
    [thread],
  );
  const openMedia = (r: Rendered) => {
    if (r.kind !== 'media' || !r.link) return;
    if (r.media === 'image' || r.media === 'sticker') {
      // Not among the thread's photos (still uploading): just this one.
      const at = images.indexOf(r.link);
      setViewer(at < 0 ? { kind: 'images', links: [r.link], index: 0 } : { kind: 'images', links: images, index: at });
    } else if (r.media === 'video') setViewer({ kind: 'video', link: r.link });
    else if (r.media === 'document') setViewer({ kind: 'document', link: r.link, name: r.filename });
  };

  /** Selects these messages, or unselects them when they all already are. Unsent ones can't be selected. */
  const toggle = useCallback((all: ChatMessage[]) => {
    const ms = all.filter((m) => !m.pending && !m.id.startsWith('local-'));
    if (!ms.length) return;
    setSelected((cur) => {
      const next = new Map(cur);
      if (ms.every((m) => next.has(m.id))) ms.forEach((m) => next.delete(m.id));
      else ms.forEach((m) => next.set(m.id, m));
      return next;
    });
  }, []);
  const toggleOne = useCallback((m: ChatMessage) => toggle([m]), [toggle]);
  // What is selected and still in the thread (a message can be deleted or replaced meanwhile).
  const selectedList = useMemo(() => thread.filter((m) => selected.has(m.id)), [thread, selected]);
  const selecting = selectedList.length > 0;
  const picked = () => selectedList;
  const clearSelection = () => setSelected(new Map());
  // Android back clears the selection first, as in WhatsApp.
  useEffect(() => {
    if (!selecting) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setSelected(new Map());
      return true;
    });
    return () => sub.remove();
  }, [selecting]);
  const canDelete = useCan(P.chats.delete);
  const deleteSelected = async () => {
    const ms = picked();
    const ok = await confirmAction({
      title: t('inbox.deleteMsgsQ', { count: ms.length }),
      message: t('inbox.deleteMsgBody'),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      destructive: true,
    });
    if (!ok || !acct) return;
    clearSelection();
    const results = await Promise.allSettled(ms.map((m) => deleteMessage(acct, id, m.id)));
    const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed) showAlert(t('inbox.actionFailed'), describeCrmError(failed.reason));
  };

  // One message selected, sent (it has a provider id) and not itself a reaction: it can be reacted to.
  const reactTarget = selectedList.length === 1 && canSend && !expired && selectedList[0].message_id && !reactionOf(selectedList[0]) ? selectedList[0] : null;
  const react = (target: ChatMessage, emoji: string) => {
    clearSelection();
    setReactFor(null);
    if (!acct || !chat) return;
    sendReaction(acct, chat, channelId, target, emoji).catch((e: unknown) => showAlert(t('inbox.actionFailed'), describeCrmError(e)));
  };

  const quotedOf = (m: ChatMessage) => {
    const c = (m.context ?? {}) as { id?: string; message_id?: string };
    const ref = c.message_id ?? c.id;
    return ref ? byProviderId.get(ref) : undefined;
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'web' ? undefined : 'padding'}
      style={{ flex: 1, backgroundColor: scheme === 'dark' ? '#0B141A' : '#EFE7DE' }}
    >
      {selecting ? (
        <View
          style={[
            styles.header,
            {
              paddingTop: embedded ? 12 : insets.top + 8,
              backgroundColor: colors.surface,
              borderBottomColor: colors.border,
              minHeight: (embedded ? 12 : insets.top + 8) + 48,
            },
          ]}
        >
          <Pressable onPress={clearSelection} hitSlop={10} style={styles.hbtn} accessibilityLabel={t('common.cancel')}>
            <X size={22} color={colors.text} />
          </Pressable>
          <Text variant="h3" style={{ flex: 1 }}>
            {selectedList.length}
          </Text>
          {selectedList.length === 1 && canSend ? (
            <Pressable
              onPress={() => {
                setReplyTo(selectedList[0]);
                clearSelection();
              }}
              hitSlop={8}
              style={styles.hbtn}
              accessibilityLabel={t('inbox.reply')}
            >
              <Reply size={20} color={colors.text} />
            </Pressable>
          ) : null}
          {selectedList.some((m) => copyableText(m)) ? (
            <Pressable
              onPress={() => {
                void Clipboard.setStringAsync(picked().map(copyableText).filter(Boolean).join('\n\n'));
                clearSelection();
              }}
              hitSlop={8}
              style={styles.hbtn}
              accessibilityLabel={t('common.copy')}
            >
              <Copy size={20} color={colors.text} />
            </Pressable>
          ) : null}
          {selectedList.some((m) => savableMedia(m)) ? (
            <Pressable
              onPress={() => {
                const ms = picked();
                clearSelection();
                void saveMessagesMedia(ms, t);
              }}
              hitSlop={8}
              style={styles.hbtn}
              accessibilityLabel={t('inbox.saveToPhone')}
            >
              <Download size={20} color={colors.text} />
            </Pressable>
          ) : null}
          {canSend ? (
            <Pressable
              onPress={() => {
                setForwardFor(picked());
                clearSelection();
              }}
              hitSlop={8}
              style={styles.hbtn}
              accessibilityLabel={t('inbox.forward')}
            >
              <Forward size={20} color={colors.text} />
            </Pressable>
          ) : null}
          {canDelete ? (
            <Pressable onPress={() => void deleteSelected()} hitSlop={8} style={styles.hbtn} accessibilityLabel={t('common.delete')}>
              <Trash2 size={20} color={colors.danger} />
            </Pressable>
          ) : null}
          {selectedList.length === 1 ? (
            // Info, retry download and the rest of one message's options.
            <Pressable
              onPress={() => {
                setMenuFor(selectedList[0]);
                clearSelection();
              }}
              hitSlop={8}
              style={styles.hbtn}
              accessibilityLabel={t('leads.moreActions')}
            >
              <EllipsisVertical size={20} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={[styles.header, { paddingTop: embedded ? 12 : insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          {embedded ? null : (
            <Pressable onPress={() => goBack('/(app)/(tabs)/inbox')} hitSlop={10} style={styles.hbtn}>
              <ArrowLeft size={22} color={colors.text} style={rtlFlip()} />
            </Pressable>
          )}
          <Avatar name={name} uri={chat?.profile?.whatsapp?.profile_pic} size={38} />
          <Pressable style={{ flex: 1 }} onPress={() => openContact(id)}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {name}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text variant="caption" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
                {inbox.state === 'connected' ? (phone ? formatPhone(phone) : '') : t('inbox.reconnecting')}
              </Text>
              {/* Only a working bot/automation gets a mark; paused or none shows nothing. */}
              {inbox.state === 'connected' && chat && automationState(chat) === 'running' ? (
                <View accessibilityLabel={t('inbox.auto.running')} style={[styles.botMark, { backgroundColor: colors.successSoft }]}>
                  <Bot size={12} color={colors.success} />
                </View>
              ) : null}
            </View>
            {chat ? <ContactChips hash={chat.custom_field_hash as Record<string, unknown> | undefined} tags={chat.tags} scroll /> : null}
          </Pressable>
          {/* Tapping the name opens the contact; these are quick actions on the chat itself. */}
          {chat && canUpdate ? (
            <Pressable
              onPress={() => setChatMenu('status')}
              hitSlop={8}
              style={styles.hbtn}
              accessibilityRole="button"
              accessibilityLabel={t('inbox.quickStatus')}
            >
              <CircleCheckBig size={20} color={chat.chat_metadata?.marked_as_done || chat.chat_metadata?.closed ? colors.success : colors.textMuted} />
            </Pressable>
          ) : null}
          {chat && canTransfer ? (
            <Pressable
              onPress={() => setChatMenu('assign')}
              hitSlop={8}
              style={styles.hbtn}
              accessibilityRole="button"
              accessibilityLabel={t('inbox.transfer')}
            >
              <UserRoundCog size={20} color={chat.agent ? colors.primary : colors.textMuted} />
            </Pressable>
          ) : null}
          {chat ? (
            <Pressable
              onPress={() => setChatMenu('all')}
              hitSlop={8}
              style={styles.hbtn}
              accessibilityRole="button"
              accessibilityLabel={t('leads.moreActions')}
            >
              <EllipsisVertical size={20} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      )}
      {reactTarget ? (
        <ReactionBar
          current={myReaction(reactions.get(reactTarget.message_id))}
          onReact={(e) => react(reactTarget, e)}
          onMore={() => {
            setReactFor(reactTarget);
            clearSelection();
          }}
        />
      ) : null}

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
      ) : !data.length ? (
        // Outside the inverted list, so the text isn't drawn upside down / mirrored.
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text tone="muted" center style={{ padding: 24 }}>
            {t('inbox.noMessages')}
          </Text>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <FlatList
            // Re-render bubbles once templates or channels arrive.
            // Re-render on new templates / channels, selection, and a new day (Today → Yesterday).
            extraData={`${templates.dataUpdatedAt}:${channelMap.size}:${selectedList.length}:${dayKey(now)}`}
            data={data}
            inverted
            keyExtractor={(row) => row.key}
            renderItem={({ item, index }) => {
              // Inverted, newest first: the next item is the older neighbour. A new day starts above this one.
              const olderRow = data[index + 1];
              const ts = rowTime(item);
              const newDay = !olderRow || dayKey(rowTime(olderRow)) !== dayKey(ts);
              const ms = rowMessages(item);
              const isSelected = ms.every((m) => selected.has(m.id));
              const first = ms[0];
              return (
                <View>
                  {newDay ? <DayChip label={dayLabel(ts)} /> : null}
                  <View style={isSelected ? { backgroundColor: `${colors.primary}26` } : undefined}>
                    {item.kind === 'album' ? (
                      <MediaAlbum
                        items={item.items}
                        channel={first.channel ? channelMap.get(first.channel) : undefined}
                        onOpen={openMedia}
                        onLongPress={() => toggle(item.items)}
                        onInfo={setInfoFor}
                        onForward={canSend && !selecting ? setForwardFor : undefined}
                        onSave={selecting ? undefined : (items) => void saveMessagesMedia(items, t)}
                        reactions={reactionsOf(item.items)}
                      />
                    ) : (
                      <MessageBubble
                        m={item.m}
                        quoted={quotedOf(item.m)}
                        // A long press selects (WhatsApp-style); the options for one message are under ⋮.
                        onMenu={toggleOne}
                        onInfo={setInfoFor}
                        lookup={lookup}
                        onOpen={openMedia}
                        channel={item.m.channel ? channelMap.get(item.m.channel) : undefined}
                        reactions={reactionsOf([item.m])}
                      />
                    )}
                    {/* While selecting, a tap anywhere on the row selects / unselects it instead of opening media. */}
                    {selecting ? (
                      <Pressable
                        style={StyleSheet.absoluteFill}
                        onPress={() => toggle(ms)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: isSelected }}
                      />
                    ) : null}
                  </View>
                </View>
              );
            }}
            onEndReached={() => void loadOlder()}
            onEndReachedThreshold={0.3}
            ListFooterComponent={older ? <ActivityIndicator style={{ padding: 12 }} color={colors.primary} /> : undefined}
            contentContainerStyle={{ paddingVertical: 10 }}
            onViewableItemsChanged={onViewable}
            viewabilityConfig={VIEWABILITY}
            onScrollBeginDrag={scrollActive}
            onMomentumScrollBegin={scrollActive}
            onScrollEndDrag={scrollIdle}
            onMomentumScrollEnd={scrollIdle}
          />
          {scrolling && floatingDay ? (
            <View pointerEvents="none" style={styles.floatingDay}>
              <DayChip label={dayLabel(floatingDay)} />
            </View>
          ) : null}
        </View>
      )}

      {expired ? (
        <View style={[styles.expired, { backgroundColor: colors.warningSoft }]}>
          <Clock size={16} color={colors.warning} />
          <Text variant="caption" style={{ flex: 1, color: colors.text }}>
            {t('inbox.sessionExpired')}
          </Text>
          {canSend ? (
            <Button
              title={t('inbox.sendTemplate')}
              size="sm"
              icon={<FileText size={14} color="#fff" />}
              onPress={() => router.push({ pathname: '/(app)/whatsapp/send', params: { leadId: id } })}
            />
          ) : null}
        </View>
      ) : null}

      {(waChannels.data?.length ?? 0) > 1 ? (
        <Pressable onPress={() => setChannelPicker(true)} style={[styles.via, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          {replyChannel ? (
            <ChannelIcon type={replyChannel.kind} color={replyChannel.color} size={18} />
          ) : (
            <View style={[styles.dot, { backgroundColor: colors.success }]} />
          )}
          <Text variant="caption" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
            {t('inbox.replyingVia', { name: replyChannel?.name ?? '—' })}
          </Text>
          <Text variant="caption" tone="primary" style={{ fontWeight: '700' }}>
            {t('inbox.switch')}
          </Text>
        </Pressable>
      ) : null}

      {chat && acct ? (
        <View style={{ paddingBottom: keyboardOpen ? 4 : bar ? bar + 4 : Math.max(insets.bottom, 8) }}>
          {canSend ? (
            <Composer acct={acct} chat={chat} channel={channelId} replyTo={replyTo} onClearReply={() => setReplyTo(null)} disabled={expired} />
          ) : (
            // Read-only for a role that can't send: say so rather than offer a box that fails.
            <Text variant="caption" tone="muted" center style={{ padding: 14 }}>
              {t('perm.cantSend')}
            </Text>
          )}
        </View>
      ) : null}
      <MediaViewer state={viewer} onClose={() => setViewer(null)} />
      {menuFor && acct ? (
        <MessageMenu
          acct={acct}
          chatId={id}
          m={menuFor}
          onClose={() => setMenuFor(null)}
          onReply={() => {
            setReplyTo(menuFor);
            setMenuFor(null);
          }}
          onForward={() => {
            setForwardFor([menuFor]);
            setMenuFor(null);
          }}
          onInfo={() => {
            setInfoFor(menuFor);
            setMenuFor(null);
          }}
        />
      ) : null}
      {infoFor ? <MessageInfo m={infoFor} channelName={channelMap.get(infoFor.channel)?.name} onClose={() => setInfoFor(null)} /> : null}
      {reactFor ? (
        <ReactionSheet current={myReaction(reactions.get(reactFor.message_id))} onReact={(e) => react(reactFor, e)} onClose={() => setReactFor(null)} />
      ) : null}
      {forwardFor && acct ? <ForwardSheet acct={acct} messages={forwardFor} onClose={() => setForwardFor(null)} /> : null}
      {chatMenu && chat && acct ? (
        <ChatActionsSheet
          acct={acct}
          chat={chat}
          title={chatMenu === 'status' ? t('inbox.quickStatus') : name}
          only={chatMenu === 'all' ? undefined : chatMenu}
          onClose={() => setChatMenu(false)}
        />
      ) : null}
      {channelPicker ? (
        <Sheet open onClose={() => setChannelPicker(false)} title={t('inbox.pickChannel')}>
          <View style={{ gap: 4 }}>
            {(waChannels.data ?? []).map((ch) => {
              const seen = sessions.data?.find((x) => x.channel === ch.id)?.last_seen ?? 0;
              const open = !!seen && now - seen < DAY;
              return (
                <Pressable
                  key={ch.id}
                  onPress={() => {
                    setPickedChannel(ch.id);
                    setChannelPicker(false);
                  }}
                  style={[styles.chRow, { backgroundColor: ch.id === channelId ? colors.primarySoft : 'transparent' }]}
                >
                  <View style={[styles.dot, { backgroundColor: ch.color }]} />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">{ch.name}</Text>
                    <Text variant="caption" tone={open ? 'success' : 'muted'}>
                      {ch.number ? `${formatPhone(ch.number)} · ` : ''}
                      {open ? t('inbox.windowOpen') : t('inbox.windowClosed')}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Sheet>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const VIEWABILITY = { itemVisiblePercentThreshold: 10 };

const styles = StyleSheet.create({
  dayChip: {
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    marginVertical: 8,
    shadowOpacity: 0.08,
    shadowRadius: 1,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  floatingDay: { position: 'absolute', top: 2, start: 0, end: 0, alignItems: 'center' },
  botMark: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  hbtn: { padding: 6 },
  expired: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  via: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 7, borderTopWidth: StyleSheet.hairlineWidth },
  dot: { width: 10, height: 10, borderRadius: 5 },
  chRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 12 },
});

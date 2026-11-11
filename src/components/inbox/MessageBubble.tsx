/**
 * One message in a WhatsApp thread. Draws every kind the inbox receives:
 * text, image / video / audio / voice / document / sticker (with captions),
 * location, contacts, templates (variables filled in), interactive messages
 * and the exact button or list item a lead tapped. Reactions show as pills
 * under the message they react to (a sticker, like a reaction, has no bubble). Shows the
 * quoted message for replies, delivery ticks for outgoing ones, and which
 * channel (WhatsApp number, Instagram, RCS…) the message travelled over.
 */
import type { Template } from '@ab-ecosystem/cpaas';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { Check, CheckCheck, CircleAlert, Clock, FileText, MapPin, MousePointerClick, Pause, Play, User, Video as VideoIcon } from 'lucide-react-native';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';

import { ChannelIcon } from '@/components/channels/ChannelBits';
import { Text } from '@/components/ui';
import { TemplatePreview } from '@/components/whatsapp/TemplatePreview';
import { LinkText } from './LinkText';
import { ReactionPills } from './Reactions';
import { previewText, renderContent, templateButtonUrl, templateMedia, type Rendered } from '@/services/inbox/render';
import type { ChatMessage } from '@/services/inbox/store';
import type { Reaction } from '@/services/inbox/reactions';
import { isMine } from '@/services/inbox/albums';
import { useTheme } from '@/theme/ThemeProvider';

const open = (url: string) => {
  if (!url || url.startsWith('file:') || url.startsWith('content:')) return;
  void WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url));
};

/** The channel a message came or went over, for its badge. */
export type MessageChannel = { kind: string; color: string; name: string };

const time = (ts: number) => new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** A bubble's colours, shared with the album card. */
export const useBubbleColors = (mine: boolean) => {
  const { colors, scheme } = useTheme();
  const dark = scheme === 'dark';
  return {
    bg: mine ? (dark ? '#005C4B' : '#D9FDD3') : dark ? '#202C33' : '#FFFFFF',
    meta: mine ? (dark ? 'rgba(255,255,255,0.6)' : '#667781') : colors.textFaint,
  };
};

/** Channel icon, time and ticks (or "not sent"), bottom right of a bubble. */
export function MessageMeta({
  m,
  mine,
  color,
  channel,
  onInfo,
}: {
  m: ChatMessage;
  mine: boolean;
  color: string;
  channel?: MessageChannel;
  onInfo: (m: ChatMessage) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={styles.meta}>
      {channel ? (
        <View accessibilityLabel={channel.name} style={styles.channel}>
          <ChannelIcon type={channel.kind} color={channel.color} size={15} />
        </View>
      ) : null}
      <Text style={{ color, fontSize: 11 }}>{time(m.timestamp)}</Text>
      {m.status === 'failed' ? (
        // Just the icon here; the reason opens on tap.
        <Pressable onPress={() => onInfo(m)} hitSlop={12} style={styles.failed}>
          <CircleAlert size={14} color={colors.danger} />
          <Text style={{ color: colors.danger, fontSize: 11, fontWeight: '600' }}>{t('inbox.notSent')}</Text>
        </Pressable>
      ) : mine ? (
        <Ticks m={m} color={color} />
      ) : null}
    </View>
  );
}

function Ticks({ m, color }: { m: ChatMessage; color: string }) {
  const { colors } = useTheme();
  if (m.pending) return <Clock size={12} color={color} />;
  if (m.status === 'failed') return <CircleAlert size={13} color={colors.danger} />;
  if (m.status === 'read') return <CheckCheck size={14} color="#53BDEB" />;
  if (m.status === 'delivered') return <CheckCheck size={14} color={color} />;
  return <Check size={14} color={color} />;
}

/** Over media that is still uploading. */
function UploadSpinner() {
  return (
    <View pointerEvents="none" style={styles.uploading}>
      <ActivityIndicator color="#fff" />
    </View>
  );
}

function AudioChip({ link, tint }: { link: string; tint: string }) {
  const player = useAudioPlayer(link || null);
  const status = useAudioPlayerStatus(player);
  const pct = status.duration ? Math.min(1, status.currentTime / status.duration) : 0;
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  return (
    <View style={styles.audio}>
      <Pressable
        onPress={() => {
          if (status.playing) player.pause();
          else {
            if (status.didJustFinish || (status.duration && status.currentTime >= status.duration)) void player.seekTo(0);
            player.play();
          }
        }}
        style={[styles.play, { backgroundColor: tint }]}
        hitSlop={6}
      >
        {status.playing ? <Pause size={16} color="#fff" fill="#fff" /> : <Play size={16} color="#fff" fill="#fff" />}
      </Pressable>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={[styles.track, { backgroundColor: `${tint}33` }]}>
          <View style={[styles.trackFill, { width: `${pct * 100}%`, backgroundColor: tint }]} />
        </View>
        <Text variant="micro" tone="muted" style={{ letterSpacing: 0 }}>
          {mmss(status.playing || status.currentTime ? status.currentTime : status.duration || 0)}
        </Text>
      </View>
    </View>
  );
}

function Body({
  r,
  mine,
  lookup,
  onOpen,
  onLongPress,
  meta,
  localUri,
  uploading,
}: {
  r: Rendered;
  mine: boolean;
  /** The file this was sent from: shown until the uploaded copy has loaded. */
  localUri?: string;
  /** Still uploading: a spinner over the media. */
  uploading?: boolean;
  /** A sent template draws the time and ticks itself, above its buttons. */
  meta?: React.ReactNode;
  lookup?: (name: string, language: string) => Template | undefined;
  onOpen?: (r: Rendered) => void;
  /** Media, documents and links take the tap; a long press still opens the message options. */
  onLongPress?: () => void;
}) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const text = mine ? '#0E0E11' : colors.text;
  const muted = mine ? '#4B5563' : colors.textMuted;
  const link = mine ? '#027EB5' : colors.primary;
  void lookup;

  switch (r.kind) {
    case 'text':
      return <LinkText text={r.text} style={{ color: text, fontSize: 15, lineHeight: 21 }} linkColor={link} />;
    case 'media':
      return (
        <View style={{ gap: 6 }}>
          {r.media === 'image' || r.media === 'sticker' ? (
            <Pressable onLongPress={onLongPress} delayLongPress={250} onPress={() => (onOpen ? onOpen(r) : open(r.link))}>
              <Image
                source={{ uri: r.link }}
                placeholder={localUri ? { uri: localUri } : undefined}
                placeholderContentFit="cover"
                transition={localUri ? 0 : 150}
                style={r.media === 'sticker' ? styles.sticker : [styles.image, { borderRadius: radius.sm }]}
                contentFit={r.media === 'sticker' ? 'contain' : 'cover'}
              />
              {uploading ? <UploadSpinner /> : null}
            </Pressable>
          ) : r.media === 'video' ? (
            <Pressable
              onLongPress={onLongPress}
              delayLongPress={250}
              onPress={() => (onOpen ? onOpen(r) : open(r.link))}
              style={[styles.image, styles.videoTile, { borderRadius: radius.sm }]}
            >
              {uploading ? (
                <UploadSpinner />
              ) : (
                <View style={styles.videoPlay}>
                  <Play size={22} color="#fff" fill="#fff" />
                </View>
              )}
              <VideoIcon size={14} color="#fff" style={{ position: 'absolute', start: 10, bottom: 10 }} />
            </Pressable>
          ) : r.media === 'audio' || r.media === 'voice' ? (
            <View>
              <AudioChip link={r.link} tint={mine ? '#128C7E' : colors.primary} />
              {uploading ? <UploadSpinner /> : null}
            </View>
          ) : (
            <Pressable
              onLongPress={onLongPress}
              delayLongPress={250}
              onPress={() => (onOpen ? onOpen(r) : open(r.link))}
              style={[styles.doc, { backgroundColor: mine ? 'rgba(0,0,0,0.06)' : colors.surfaceAlt, borderRadius: radius.sm }]}
            >
              {uploading ? <ActivityIndicator color={mine ? '#128C7E' : colors.primary} /> : <FileText size={22} color={mine ? '#128C7E' : colors.primary} />}
              <Text numberOfLines={2} style={{ flex: 1, color: text, fontWeight: '500' }}>
                {r.filename || t('inbox.document')}
              </Text>
            </Pressable>
          )}
          {r.caption ? <LinkText text={r.caption} style={{ color: text, fontSize: 15, lineHeight: 21 }} linkColor={link} /> : null}
        </View>
      );
    case 'location':
      return (
        <Pressable
          onLongPress={onLongPress}
          delayLongPress={250}
          onPress={() => void Linking.openURL(`https://maps.google.com/?q=${r.lat},${r.lng}`)}
          style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}
        >
          <MapPin size={20} color={colors.danger} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: text, fontWeight: '600' }}>{r.name || t('inbox.location')}</Text>
            {r.address ? <Text style={{ color: muted, fontSize: 13 }}>{r.address}</Text> : null}
          </View>
        </Pressable>
      );
    case 'contacts':
      return (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <User size={18} color={muted} />
          <Text style={{ color: text }}>{r.names.join(', ')}</Text>
        </View>
      );
    case 'template': {
      // The media header opens in the viewer like any other photo, video or document.
      const headerMedia = templateMedia(r);
      const openHeader = headerMedia ? () => (onOpen ? onOpen(headerMedia) : open(headerMedia.kind === 'media' ? headerMedia.link : '')) : undefined;
      // The header opens the media; each button does what it does for the lead (link, call).
      return r.parsed ? (
        <TemplatePreview
          bare
          template={r.parsed}
          values={(n) => r.values[n]}
          headerValues={(n) => r.headerValues[n]}
          mediaUri={r.mediaLink || undefined}
          mediaName={r.filename || undefined}
          meta={meta}
          onMediaPress={openHeader}
          onLongPress={onLongPress}
          onButtonPress={(b, i) => {
            if (b.type === 'URL') open(templateButtonUrl(r, b.url, i));
            else if (b.type === 'PHONE_NUMBER' && b.phone) void Linking.openURL(`tel:${b.phone.replace(/[^\d+]/g, '')}`);
          }}
        />
      ) : (
        <View style={{ gap: 4 }}>
          <Text variant="micro" style={{ color: muted, letterSpacing: 0 }}>
            📋 {r.name}
          </Text>
          {headerMedia ? (
            <Pressable onLongPress={onLongPress} delayLongPress={250} onPress={openHeader}>
              <Text style={{ color: link, fontWeight: '600' }}>
                {{ image: '📷', video: '🎬', document: '📄' }[r.media as string] ?? '📎'} {r.filename || r.media}
              </Text>
            </Pressable>
          ) : null}
          <Text style={{ color: text, fontSize: 15, lineHeight: 21 }}>{r.fallback || Object.values(r.values).join(' · ')}</Text>
        </View>
      );
    }
    case 'interactive':
      return (
        <View style={{ gap: 6 }}>
          {r.header ? <Text style={{ color: text, fontWeight: '700' }}>{r.header}</Text> : null}
          {r.body ? <LinkText text={r.body} style={{ color: text, fontSize: 15, lineHeight: 21 }} linkColor={link} /> : null}
          {r.footer ? <Text style={{ color: muted, fontSize: 12 }}>{r.footer}</Text> : null}
          {r.buttons.map((b, i) => (
            <View key={i} style={[styles.ibtn, { borderTopColor: mine ? 'rgba(0,0,0,0.08)' : colors.border }]}>
              <Text style={{ color: '#027EB5', fontWeight: '600' }}>{b}</Text>
            </View>
          ))}
        </View>
      );
    case 'reply':
      return (
        <View style={{ gap: 4 }}>
          <View style={[styles.clicked, { backgroundColor: mine ? 'rgba(0,0,0,0.06)' : colors.primarySoft }]}>
            <MousePointerClick size={14} color={mine ? '#128C7E' : colors.primary} />
            <Text variant="micro" style={{ color: mine ? '#128C7E' : colors.primary, letterSpacing: 0 }}>
              {r.via === 'list' ? t('inbox.pickedFromList') : t('inbox.tappedButton')}
            </Text>
          </View>
          <Text style={{ color: text, fontSize: 15, fontWeight: '600' }}>{r.title}</Text>
          {r.description ? <Text style={{ color: muted, fontSize: 13 }}>{r.description}</Text> : null}
        </View>
      );
    case 'reaction':
      // Only when the message it reacts to isn't loaded (otherwise it sits under that message).
      return r.emoji ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 22 }}>{r.emoji}</Text>
          <Text style={{ color: muted, fontStyle: 'italic', fontSize: 13 }}>{t('inbox.reactedToMessage')}</Text>
        </View>
      ) : (
        <Text style={{ color: muted, fontStyle: 'italic', fontSize: 13 }}>{t('inbox.reactionRemoved')}</Text>
      );
    default:
      return <Text style={{ color: muted, fontStyle: 'italic' }}>{t('inbox.unsupported', { type: r.type })}</Text>;
  }
}

function MessageBubbleInner({
  m,
  quoted,
  onMenu,
  onInfo,
  lookup,
  onOpen,
  channel,
  reactions,
}: {
  m: ChatMessage;
  quoted?: ChatMessage;
  /** Reactions to this message, drawn under it. */
  reactions?: Reaction[];
  /** Shown as a small icon by the time, so a contact writing on several channels is easy to follow. */
  channel?: MessageChannel;
  /** Long press: reply, forward, copy, info… */
  onMenu: (m: ChatMessage) => void;
  /** The failed icon: why it wasn't delivered. */
  onInfo: (m: ChatMessage) => void;
  lookup?: (name: string, language: string) => Template | undefined;
  /** Opens media in the in-app viewer. */
  onOpen?: (r: Rendered, m: ChatMessage) => void;
}) {
  const { colors, scheme } = useTheme();
  const mine = isMine(m);
  const r = useMemo(() => renderContent(m.content, lookup), [m.content, lookup]);
  const dark = scheme === 'dark';
  const { bg, meta: metaColor } = useBubbleColors(mine);
  // A sticker floats on the wallpaper, as on WhatsApp; its time sits on a small pill.
  const bare = r.kind === 'media' && r.media === 'sticker';
  const meta = bare ? colors.textMuted : metaColor;
  const wide = r.kind === 'template' || r.kind === 'media';
  const metaRow = bare ? (
    <View style={[styles.bareMeta, { backgroundColor: colors.surface }]}>
      <MessageMeta m={m} mine={mine} color={meta} channel={channel} onInfo={onInfo} />
    </View>
  ) : (
    <MessageMeta m={m} mine={mine} color={meta} channel={channel} onInfo={onInfo} />
  );
  // A drawn template carries the time itself (above its buttons, as WhatsApp does).
  const metaInside = r.kind === 'template' && !!r.parsed;

  return (
    <View style={[styles.row, { alignItems: mine ? 'flex-end' : 'flex-start' }]}>
      <Pressable
        onLongPress={() => !m.pending && onMenu(m)}
        delayLongPress={250}
        style={[
          styles.bubble,
          { backgroundColor: bg, borderTopEndRadius: mine ? 4 : 16, borderTopStartRadius: mine ? 16 : 4, maxWidth: wide ? '82%' : '80%' },
          bare && { backgroundColor: 'transparent', paddingHorizontal: 0 },
        ]}
      >
        {quoted ? (
          <View style={[styles.quote, { borderStartColor: colors.primary, backgroundColor: mine ? 'rgba(0,0,0,0.05)' : colors.surfaceAlt }]}>
            <Text variant="micro" style={{ color: colors.primary, letterSpacing: 0 }}>
              {quoted.direction === 'outbound' || quoted.status !== 'received' ? '↩ You' : '↩'}
            </Text>
            <Text numberOfLines={2} style={{ color: mine && !dark ? '#4B5563' : colors.textMuted, fontSize: 13 }}>
              {previewText(quoted.content)}
            </Text>
          </View>
        ) : null}
        <Body
          r={r}
          mine={mine && !dark}
          lookup={lookup}
          onOpen={onOpen ? (x) => onOpen(x, m) : undefined}
          onLongPress={m.pending ? undefined : () => onMenu(m)}
          meta={metaInside ? metaRow : undefined}
          localUri={m.localUri}
          // Only while the file uploads; then the clock tick says it's on its way.
          uploading={m.pending && !m.sentLink}
        />
        {metaInside ? null : metaRow}
      </Pressable>
      {reactions?.length ? <ReactionPills reactions={reactions} mine={mine} /> : null}
    </View>
  );
}

export const MessageBubble = memo(MessageBubbleInner);

const styles = StyleSheet.create({
  row: { paddingHorizontal: 10, marginVertical: 2 },
  bareMeta: { alignSelf: 'flex-end', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  bubble: { borderRadius: 16, paddingHorizontal: 10, paddingVertical: 7, gap: 4 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end' },
  channel: { opacity: 0.9 },
  failed: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  quote: { borderStartWidth: 3, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, gap: 1 },
  image: { width: 240, height: 240 },
  sticker: { width: 130, height: 130 },
  uploading: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    start: 0,
    end: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 8,
  },
  videoTile: { backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' },
  videoPlay: { width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  doc: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, minWidth: 200 },
  audio: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 210 },
  play: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  trackFill: { height: 4 },
  ibtn: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6, alignItems: 'center' },
  clicked: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
});

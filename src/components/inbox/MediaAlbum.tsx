/**
 * Several photos / videos sent in a row, drawn as one bubble like WhatsApp: a
 * 2×2 grid, the last tile showing "+N" for the rest. A tile opens that item in
 * the viewer (which swipes through all of them). Beside it, forward and save
 * the whole album in one tap; a long press selects it with other messages.
 */
import { Image } from 'expo-image';
import { Download, Forward, Play } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { isMine } from '@/services/inbox/albums';
import { renderContent, type Rendered } from '@/services/inbox/render';
import type { ChatMessage } from '@/services/inbox/store';
import type { Reaction } from '@/services/inbox/reactions';
import { MessageMeta, useBubbleColors, type MessageChannel } from './MessageBubble';
import { ReactionPills } from './Reactions';

const TILE = 118;
const GAP = 3;

function MediaAlbumInner({
  items,
  channel,
  onOpen,
  onLongPress,
  onInfo,
  onForward,
  onSave,
  reactions,
}: {
  /** Oldest first. */
  items: ChatMessage[];
  /** Reactions to any of its photos, together under the album. */
  reactions?: Reaction[];
  channel?: MessageChannel;
  onOpen: (r: Rendered, m: ChatMessage) => void;
  onLongPress: () => void;
  onInfo: (m: ChatMessage) => void;
  /** The whole album; hidden while any of it is still uploading. */
  onForward?: (items: ChatMessage[]) => void;
  onSave?: (items: ChatMessage[]) => void;
}) {
  const { t } = useTranslation();
  const last = items[items.length - 1];
  const mine = isMine(last);
  const { bg, meta } = useBubbleColors(mine);
  const shown = items.slice(0, 4);
  const rest = items.length - shown.length;
  const sent = !items.some((m) => m.pending);
  const actions =
    sent && (onForward || onSave) ? (
      <View style={styles.actions}>
        {onForward ? (
          <Pressable onPress={() => onForward(items)} hitSlop={6} style={styles.action} accessibilityLabel={t('inbox.forward')}>
            <Forward size={16} color="#fff" />
          </Pressable>
        ) : null}
        {onSave ? (
          <Pressable onPress={() => onSave(items)} hitSlop={6} style={styles.action} accessibilityLabel={t('inbox.saveToPhone')}>
            <Download size={16} color="#fff" />
          </Pressable>
        ) : null}
      </View>
    ) : null;

  return (
    <View style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
      <View style={[styles.row, { justifyContent: mine ? 'flex-end' : 'flex-start' }]}>
        {mine ? actions : null}
        <Pressable
          onLongPress={onLongPress}
          delayLongPress={250}
          style={[styles.bubble, { backgroundColor: bg, borderTopEndRadius: mine ? 4 : 16, borderTopStartRadius: mine ? 16 : 4 }]}
        >
          <View style={styles.grid}>
            {shown.map((m, i) => {
              const r = renderContent(m.content);
              const link = r.kind === 'media' ? r.link : '';
              const video = r.kind === 'media' && r.media === 'video';
              return (
                <Pressable key={m.localKey ?? m.id} onPress={() => onOpen(r, m)} onLongPress={onLongPress} delayLongPress={250} style={styles.tile}>
                  {video ? (
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#111' }]} />
                  ) : (
                    <Image
                      source={{ uri: link }}
                      placeholder={m.localUri ? { uri: m.localUri } : undefined}
                      placeholderContentFit="cover"
                      transition={m.localUri ? 0 : 150}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                    />
                  )}
                  {m.pending && !m.sentLink ? (
                    <View pointerEvents="none" style={styles.more}>
                      <ActivityIndicator color="#fff" />
                    </View>
                  ) : video ? (
                    <View style={styles.play}>
                      <Play size={18} color="#fff" fill="#fff" />
                    </View>
                  ) : null}
                  {i === shown.length - 1 && rest > 0 ? (
                    <View style={styles.more}>
                      <Text style={{ color: '#fff', fontSize: 26, fontWeight: '700' }}>+{rest}</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
          <View style={{ paddingHorizontal: 6, paddingBottom: 2 }}>
            <MessageMeta m={last} mine={mine} color={meta} channel={channel} onInfo={onInfo} />
          </View>
        </Pressable>
        {mine ? null : actions}
      </View>
      {reactions?.length ? <ReactionPills reactions={reactions} mine={mine} /> : null}
    </View>
  );
}

export const MediaAlbum = memo(MediaAlbumInner);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, marginVertical: 2 },
  actions: { gap: 8 },
  action: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  bubble: { borderRadius: 16, padding: 3, gap: 3 },
  grid: { width: TILE * 2 + GAP, flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  tile: { width: TILE, height: TILE, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  play: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  more: { position: 'absolute', top: 0, bottom: 0, start: 0, end: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
});

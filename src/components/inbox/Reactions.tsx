/**
 * Reactions in a chat: the pills under a message (whose they are, the
 * business's own marked), the quick bar shown while one message is selected
 * (tap the emoji already chosen to take it back) and a sheet with more emoji.
 */
import { Plus } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Sheet, Text } from '@/components/ui';
import { QUICK_REACTIONS, type Reaction } from '@/services/inbox/reactions';
import { useTheme } from '@/theme/ThemeProvider';

const MORE = [
  '👍',
  '❤️',
  '😂',
  '😮',
  '😢',
  '🙏',
  '👏',
  '🔥',
  '🎉',
  '💯',
  '✅',
  '❌',
  '😀',
  '😁',
  '😊',
  '😍',
  '🥰',
  '😘',
  '😎',
  '🤩',
  '🤔',
  '🙄',
  '😅',
  '🤣',
  '😇',
  '🙂',
  '😉',
  '😌',
  '😴',
  '🤗',
  '🤝',
  '👌',
  '✌️',
  '🤞',
  '💪',
  '👀',
  '😡',
  '😤',
  '😱',
  '😭',
  '🥺',
  '😬',
  '🤯',
  '🤦',
  '🤷',
  '💔',
  '💙',
  '💚',
  '⭐',
  '🌟',
  '⚡',
  '🎁',
  '🚀',
  '📌',
  '📞',
  '💰',
  '🛒',
  '📦',
  '⏰',
  '👋',
];

/** The reactions under a bubble; on your own side for your messages, as WhatsApp does. */
export function ReactionPills({ reactions, mine }: { reactions: Reaction[]; mine: boolean }) {
  const { colors, scheme } = useTheme();
  if (!reactions.length) return null;
  return (
    <View style={[styles.pills, { alignSelf: mine ? 'flex-end' : 'flex-start' }]}>
      <View
        style={[styles.pill, { backgroundColor: scheme === 'dark' ? '#202C33' : '#FFFFFF', borderColor: scheme === 'dark' ? '#0B141A' : '#EFE7DE' }]}
        accessibilityLabel={reactions.map((r) => r.emoji).join(' ')}
      >
        {reactions.map((r, i) => (
          <Text key={i} style={{ fontSize: 15, opacity: r.pending ? 0.5 : 1 }}>
            {r.emoji}
          </Text>
        ))}
        {reactions.length > 1 ? (
          <Text variant="caption" style={{ color: colors.textMuted, marginStart: 2 }}>
            {reactions.length}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** Quick reactions for the selected message; the current one is highlighted. */
export function ReactionBar({ current, onReact, onMore }: { current: string; onReact: (emoji: string) => void; onMore: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={[styles.bar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      {QUICK_REACTIONS.map((e) => (
        <Pressable
          key={e}
          onPress={() => onReact(e === current ? '' : e)}
          hitSlop={4}
          style={[styles.quick, e === current && { backgroundColor: colors.primarySoft }]}
          accessibilityRole="button"
          accessibilityLabel={e === current ? t('inbox.removeReaction') : t('inbox.reactWith', { emoji: e })}
          accessibilityState={{ selected: e === current }}
        >
          <Text style={{ fontSize: 24 }}>{e}</Text>
        </Pressable>
      ))}
      <Pressable onPress={onMore} hitSlop={4} style={[styles.quick, { backgroundColor: colors.surfaceAlt }]} accessibilityLabel={t('inbox.moreReactions')}>
        <Plus size={20} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

export function ReactionSheet({ current, onReact, onClose }: { current: string; onReact: (emoji: string) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Sheet open onClose={onClose} title={t('inbox.react')}>
      <View style={styles.grid}>
        {MORE.map((e) => (
          <Pressable
            key={e}
            onPress={() => onReact(e === current ? '' : e)}
            style={[styles.cell, e === current && { backgroundColor: colors.primarySoft }]}
            accessibilityLabel={t('inbox.reactWith', { emoji: e })}
          >
            <Text style={{ fontSize: 26 }}>{e}</Text>
          </Pressable>
        ))}
      </View>
      {current ? (
        <Pressable onPress={() => onReact('')} style={styles.remove}>
          <Text tone="danger" style={{ fontWeight: '600' }}>
            {t('inbox.removeReaction')} {current}
          </Text>
        </Pressable>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  pills: { marginTop: -6, marginHorizontal: 18, marginBottom: 2 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 12, borderWidth: 2 },
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  quick: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  cell: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  remove: { alignItems: 'center', padding: 14 },
});

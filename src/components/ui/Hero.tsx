/**
 * Deep-ink header used at the top of the main screens. Content sits on
 * the gradient in white; an optional `overlap` child (e.g. a stats card or a
 * search bar) floats half over the bottom edge for a layered, modern look.
 */
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDesktop } from '@/hooks/useDesktop';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

type Props = {
  title?: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
  /** Floats over the bottom edge of the gradient. */
  overlap?: ReactNode;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
  /** Rendered above the title row (e.g. the account pill). */
  top?: ReactNode;
};

export function Hero({ title, subtitle, left, right, children, overlap, style, compact, top }: Props) {
  const { colors, radius } = useTheme();
  // The theme already tints the header with the active account's colour.
  const gradient: [string, string] = [colors.heroFrom, colors.heroTo];
  const insets = useSafeAreaInsets();
  // Desktop web: a flat band under the sidebar, not a rounded phone header.
  const desktop = useDesktop();
  const round = desktop ? 0 : radius.xl;
  return (
    <View style={style}>
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.gradient,
          {
            paddingTop: insets.top + (compact ? 8 : 14),
            paddingBottom: overlap ? 44 : compact ? 16 : 22,
            borderBottomLeftRadius: round,
            borderBottomRightRadius: round,
          },
        ]}
      >
        {top}
        {title || left || right ? (
          <View style={styles.row}>
            {left}
            <View style={{ flex: 1 }}>
              {title ? (
                <Text variant={compact ? 'h2' : 'h1'} style={{ color: colors.onHero }} numberOfLines={1}>
                  {title}
                </Text>
              ) : null}
              {subtitle ? (
                <Text variant="caption" style={{ color: colors.onHeroMuted }} numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            {right}
          </View>
        ) : null}
        {children ? <View style={{ marginTop: 16 }}>{children}</View> : null}
      </LinearGradient>
      {overlap ? <View style={styles.overlap}>{overlap}</View> : null}
    </View>
  );
}

/** A translucent round button for use on the gradient. */
export function HeroButton({
  children,
  onPress,
  label,
}: {
  children: ReactNode;
  onPress?: () => void;
  /** What it does, for screen readers (it shows only an icon). */ label?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.heroBtn, { backgroundColor: colors.heroGlass, opacity: pressed ? 0.7 : 1 }]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  gradient: { paddingHorizontal: 20, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  overlap: { marginTop: -32, paddingHorizontal: 16 },
  heroBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

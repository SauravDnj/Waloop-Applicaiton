import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'accent' | 'whatsapp';

export type ChipProps = {
  label: string;
  selected?: boolean;
  tone?: Tone;
  icon?: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
  /** Custom colour (e.g. a tag colour). Overrides tone. */
  color?: string;
};

export function Chip({ label, selected, tone = 'neutral', icon, onPress, style, small, color }: ChipProps) {
  const { colors, radius } = useTheme();
  const tones: Record<Tone, { bg: string; fg: string }> = {
    neutral: { bg: colors.surface, fg: colors.text },
    primary: { bg: colors.primarySoft, fg: colors.primary },
    success: { bg: colors.successSoft, fg: colors.success },
    warning: { bg: colors.warningSoft, fg: colors.warning },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
    accent: { bg: colors.accentSoft, fg: colors.accent },
    whatsapp: { bg: colors.whatsappSoft, fg: '#128C7E' },
  };
  let { bg, fg } = tones[tone];
  if (color) {
    bg = `${color}22`;
    fg = color;
  }
  let border = tone === 'neutral' && !color ? colors.border : 'transparent';
  if (selected) {
    bg = colors.primarySoft;
    fg = colors.primary;
    border = colors.primary;
  }
  return (
    <Pressable
      disabled={!onPress}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: bg,
          borderColor: border,
          borderRadius: small ? 8 : radius.sm,
          paddingVertical: small ? 4 : 7,
          paddingHorizontal: small ? 8 : 12,
          opacity: pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {icon}
      <Text variant={small ? 'micro' : 'caption'} style={{ color: fg, fontWeight: '500', letterSpacing: 0 }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    borderWidth: 1,
  },
});

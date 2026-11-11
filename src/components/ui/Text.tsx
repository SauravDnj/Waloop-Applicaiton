import { Text as RNText, StyleSheet, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { fontForWeight, type typography } from '@/theme/tokens';

type Variant = keyof typeof typography;
type Tone = 'default' | 'muted' | 'faint' | 'primary' | 'success' | 'warning' | 'danger' | 'onPrimary' | 'accent';

export type TextProps = RNTextProps & {
  variant?: Variant;
  tone?: Tone;
  center?: boolean;
  weight?: TextStyle['fontWeight'];
};

export function Text({ variant = 'body', tone = 'default', center, weight, style, ...rest }: TextProps) {
  const { colors, type } = useTheme();
  const color = {
    default: colors.text,
    muted: colors.textMuted,
    faint: colors.textFaint,
    primary: colors.primary,
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
    onPrimary: colors.onPrimary,
    accent: colors.accent,
  }[tone];
  // A custom fontSize keeps the variant's lineHeight unless told otherwise, and a
  // line shorter than the glyphs clips them top and bottom (big dial numbers).
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  const base = type[variant] as TextStyle;
  const fix =
    flat?.fontSize && flat.lineHeight == null && flat.fontSize * 1.2 > (base.lineHeight ?? 0) ? { lineHeight: Math.round(flat.fontSize * 1.25) } : null;
  // Inter ships one file per weight: pick the family from the final weight and
  // drop fontWeight so Android does not fake-bold an already bold face.
  const finalWeight = weight ?? flat?.fontWeight ?? base.fontWeight;
  const face = { fontFamily: flat?.fontFamily ?? fontForWeight(finalWeight), fontWeight: undefined };
  return <RNText {...rest} style={[base, { color }, center && { textAlign: 'center' }, style, fix, face]} />;
}

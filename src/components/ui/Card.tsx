import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

type Props = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  onLongPress?: () => void;
  padded?: boolean;
  elevated?: boolean;
}>;

export function Card({ children, style, onPress, onLongPress, padded = true, elevated = true }: Props) {
  const { colors, radius, shadow } = useTheme();
  const base = [
    styles.card,
    {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderColor: colors.border,
    },
    elevated && shadow.card,
    padded && { padding: 16 },
    style,
  ];
  if (onPress || onLongPress) {
    return (
      <Pressable onPress={onPress} onLongPress={onLongPress} style={({ pressed }) => [base, pressed && { backgroundColor: colors.surfaceAlt }]}>
        {children}
      </Pressable>
    );
  }
  return <View style={base}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { borderWidth: 1 },
});

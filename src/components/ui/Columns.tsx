/**
 * Desktop web: children side by side, each its own column. Phones and narrow
 * windows: stacked in order, so a page reads the same top to bottom.
 *
 * `widths` fixes a column's width (e.g. a 360px summary beside a flexible
 * main column); columns without one share the rest.
 */
import { Children, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useDesktop } from '@/hooks/useDesktop';

export function Columns({
  children,
  gap = 16,
  widths,
  style,
}: {
  children: ReactNode;
  gap?: number;
  widths?: (number | undefined)[];
  style?: StyleProp<ViewStyle>;
}) {
  const desktop = useDesktop();
  const items = Children.toArray(children);
  if (!desktop) return <View style={[{ gap }, style]}>{items}</View>;
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'flex-start', gap }, style]}>
      {items.map((child, i) => {
        const w = widths?.[i];
        return (
          <View key={i} style={w ? { width: w, flexShrink: 0, gap } : { flex: 1, minWidth: 0, gap }}>
            {child}
          </View>
        );
      })}
    </View>
  );
}

/** A column's contents, spaced like the rest of the page. */
export function Stack({ children, gap = 14, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ gap }, style]}>{children}</View>;
}

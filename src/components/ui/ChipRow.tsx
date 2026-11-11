/**
 * Filter chips in one line that scrolls sideways, instead of wrapping onto a
 * second line on a phone. It runs to the screen's edges (inside a padded
 * Screen), so a chip cut at the edge shows there is more to scroll to.
 */
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

export function ChipRow({ children, bleed = 16 }: { children: ReactNode; bleed?: number }) {
  return (
    <ScrollView
      horizontal
      // A chip under a text box takes the first tap (instead of only closing the keyboard).
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -bleed, flexGrow: 0 }}
      contentContainerStyle={[styles.row, { paddingHorizontal: bleed }]}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 6 } });

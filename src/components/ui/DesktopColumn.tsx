/** Desktop web: keeps a page's content in a centred, readable column. Elsewhere it is a plain flex container. */
import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

import { useDesktop } from '@/hooks/useDesktop';

export function DesktopColumn({ children, width = 880 }: PropsWithChildren<{ width?: number }>) {
  const desktop = useDesktop();
  return <View style={[styles.fill, desktop && { maxWidth: width, width: '100%', alignSelf: 'center' }]}>{children}</View>;
}

const styles = StyleSheet.create({ fill: { flex: 1 } });

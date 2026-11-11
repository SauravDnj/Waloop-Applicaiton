/**
 * Desktop web: the contact page sliding in from the right over the current
 * screen (Contacts, Inbox, Board, Search…). Esc or the backdrop closes it.
 */
import { useEffect, useState } from 'react';
import { usePathname } from 'expo-router';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';

import { LeadView } from '@/components/leads/LeadView';
import { useContactPanel } from '@/stores/contactPanel';
import { useTheme } from '@/theme/ThemeProvider';

const WIDTH = 460;

export function ContactPanel() {
  const { colors, shadow } = useTheme();
  const id = useContactPanel((s) => s.id);
  const close = useContactPanel((s) => s.close);
  const [slide] = useState(() => new Animated.Value(0));
  // Any navigation (Edit, New message, a settings link…) leaves the panel: the page it opens must be visible.
  const pathname = usePathname();
  const [openedOn, setOpenedOn] = useState<{ id: string | null; path: string }>({ id: null, path: pathname });
  if (openedOn.id !== id) setOpenedOn({ id, path: pathname });
  useEffect(() => {
    if (id && pathname !== openedOn.path) close();
  }, [pathname, id, openedOn.path, close]);

  useEffect(() => {
    if (!id) return;
    slide.setValue(0);
    Animated.timing(slide, { toValue: 1, duration: 220, useNativeDriver: false }).start();
  }, [id, slide]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !id) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id, close]);

  if (!id) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity: slide.interpolate({ inputRange: [0, 1], outputRange: [0, 0.6] }) }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View
        style={[
          styles.panel,
          shadow.floating,
          { backgroundColor: colors.background, borderColor: colors.border, transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [WIDTH, 0] }) }] },
        ]}
      >
        <LeadView key={id} id={id} onClose={close} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { position: 'absolute', top: 0, bottom: 0, end: 0, width: WIDTH, maxWidth: '100%', borderStartWidth: StyleSheet.hairlineWidth },
});

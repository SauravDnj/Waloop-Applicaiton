/**
 * Shared frame for every auth screen: gradient top with the app logo and
 * a headline, then a white card that rises over it holding the form.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { goBack } from '@/lib/nav';
import { ArrowLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandLogo } from '@/components/Brand';
import { Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { rtlFlip } from '@/lib/rtl';

type Props = {
  title: string;
  subtitle?: string;
  back?: boolean;
  /** Runs instead of plain `goBack()` (e.g. to cancel adding an account). */
  onBack?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  showLogo?: boolean;
};

export function AuthShell({ title, subtitle, back, onBack, children, footer, showLogo = true }: Props) {
  const { colors, radius, shadow } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={[colors.heroFrom, colors.heroTo]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.top, { paddingTop: insets.top + 14 }]}
        >
          <View pointerEvents="none" style={[styles.orb, { width: 260, height: 260, top: -110, end: -80 }]} />
          <View pointerEvents="none" style={[styles.orb, { width: 160, height: 160, bottom: -40, start: -50 }]} />
          <View style={styles.topRow}>
            {back ? (
              <Pressable onPress={onBack ?? (() => goBack())} hitSlop={10} style={[styles.back, { backgroundColor: colors.heroGlass }]}>
                <ArrowLeft size={20} color="#fff" style={rtlFlip()} />
              </Pressable>
            ) : null}
          </View>
          {showLogo ? <BrandLogo height={40} light /> : null}
          <Text variant="display" style={{ color: '#fff', marginTop: 18 }}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={{ color: colors.onHeroMuted, marginTop: 6 }} variant="body">
              {subtitle}
            </Text>
          ) : null}
        </LinearGradient>
        <View style={[styles.card, shadow.floating, { backgroundColor: colors.surface, borderRadius: radius.xl }]}>{children}</View>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: 24, paddingBottom: 64, overflow: 'hidden' },
  topRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center' },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  card: { marginHorizontal: 16, marginTop: -40, padding: 20, gap: 14 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingTop: 24,
    paddingHorizontal: 24,
    flexWrap: 'wrap',
  },
});

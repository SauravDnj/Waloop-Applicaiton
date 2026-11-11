import { createContext, useContext, type PropsWithChildren, type ReactNode } from 'react';
import { Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { usePathname } from 'expo-router';
import { goBack } from '@/lib/nav';

import { useTabBarInset } from '@/components/navigation/FloatingTabBar';
import { usePullRefresh } from '@/hooks/usePullRefresh';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';
import { rtlFlip } from '@/lib/rtl';
import { useDesktop } from '@/hooks/useDesktop';

type Props = PropsWithChildren<{
  title?: string;
  subtitle?: string;
  back?: boolean;
  right?: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  /** Desktop web: use the full width (boards, tables) instead of a centred column. */
  wide?: boolean;
  /** Desktop web: the centred column's width (default 880; detail pages with columns use more). */
  maxWidth?: number;
  style?: StyleProp<ViewStyle>;
  /** Content pinned to the bottom (CTA bar). */
  footer?: ReactNode;
  /** Pull-to-refresh on a scrolling screen. */
  onRefresh?: () => unknown;
  edges?: ('top' | 'bottom')[];
}>;

/** Set by a layout that already offers the way out (the desktop settings menu): pages under it drop their back button. */
export const HideBackContext = createContext(false);

/** Desktop web: the pages the sidebar links to. They are top level there, so they need no back button. */
export const SidebarRootsContext = createContext<string[]>([]);

/** Page chrome: safe area, optional header with back button, optional scroll. */
export function Screen({
  title,
  subtitle,
  back,
  right,
  scroll,
  padded = true,
  wide = false,
  maxWidth,
  style,
  footer,
  children,
  edges = ['top'],
  onRefresh,
}: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const hideBack = useContext(HideBackContext);
  const roots = useContext(SidebarRootsContext);
  const pathname = usePathname();
  const desktop = useDesktop();
  const showBack = back && !hideBack && !(desktop && roots.includes(pathname));
  const pull = usePullRefresh(onRefresh ?? (() => undefined));
  // The app-wide bottom bar sits over every screen; keep a little air above it.
  const bar = useTabBarInset();
  const clear = bar ? bar + 8 : 0;
  // Desktop web: pages keep a readable width, centred (`wide` pages such as boards use it all).
  const cap = desktop && !wide ? [styles.cap, maxWidth ? { maxWidth } : null] : null;
  const body = (
    <View style={[padded && styles.padded, styles.body, cap, style, !scroll && !footer && clear ? { paddingBottom: clear } : null]}>{children}</View>
  );
  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.background,
          paddingTop: edges.includes('top') ? insets.top : 0,
          paddingBottom: edges.includes('bottom') ? insets.bottom : 0,
        },
      ]}
    >
      {title || showBack || right ? (
        <View style={[styles.header, cap]}>
          {showBack ? (
            <Pressable
              onPress={() => goBack()}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
              style={({ hovered }: { hovered?: boolean }) => [
                styles.backBtn,
                desktop && styles.backBtnDesktop,
                { backgroundColor: desktop && !hovered ? 'transparent' : colors.surface, borderColor: desktop && !hovered ? 'transparent' : colors.border },
              ]}
            >
              <ArrowLeft size={desktop ? 18 : 20} color={colors.text} style={rtlFlip()} />
            </Pressable>
          ) : null}
          <View style={{ flex: 1 }}>
            {title ? (
              // Phones: one line, shrinking a little beside a header button instead of wrapping (the web can't shrink to fit, so it wraps).
              <Text variant="h1" numberOfLines={Platform.OS === 'web' ? undefined : 1} adjustsFontSizeToFit minimumFontScale={0.75} accessibilityRole="header">
                {title}
              </Text>
            ) : null}
            {subtitle ? (
              <Text variant="caption" tone="muted">
                {subtitle}
              </Text>
            ) : null}
          </View>
          {right}
        </View>
      ) : null}
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: footer ? 32 : clear + 32 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={pull.refreshing} onRefresh={() => void pull.onRefresh()} tintColor={colors.primary} colors={[colors.primary]} />
            ) : undefined
          }
        >
          {body}
        </ScrollView>
      ) : (
        body
      )}
      {footer ? (
        <View
          style={[
            styles.footer,
            {
              paddingBottom: clear ? clear + 8 : Math.max(insets.bottom, 12),
              backgroundColor: colors.background,
              borderTopColor: colors.border,
            },
          ]}
        >
          {/* Desktop: an action bar, its buttons at the end at a normal width, not across the page. */}
          <View style={[cap, desktop && styles.footerDesktop]}>
            <View style={desktop ? styles.footerActions : undefined}>{footer}</View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  cap: { width: '100%', maxWidth: 880, alignSelf: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
  },
  backBtnDesktop: { width: 36, height: 36, borderRadius: 10 },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1 },
  padded: { paddingHorizontal: 16 },
  footerDesktop: { alignItems: 'flex-end' },
  footerActions: { width: 380, maxWidth: '100%' },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});

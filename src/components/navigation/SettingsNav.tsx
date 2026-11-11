/**
 * Desktop web: the settings menu beside every settings page, so moving between
 * them is one click instead of back-then-forward through the More page.
 * Phones keep the More page for this.
 */
import { router, usePathname, type Href } from 'expo-router';
import { Bell, Building2, Info, Languages, LogOut, Moon, Sliders, Tags, User, Zap, type LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { confirmAction } from '@/lib/dialog';
import { P } from '@/lib/permissions';
import { useAuthStore, useCanAny } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { useTheme } from '@/theme/ThemeProvider';

type NavItem = { path: string; label: string; Icon: LucideIcon; show?: boolean };

/** The settings pages the menu lists, by group. A page listed here needs no back button on desktop. */
export const useSettingsNav = () => {
  const { t } = useTranslation();
  const canFields = useCanAny([P.fields.create, P.fields.update, P.fields.delete]);
  const groups: { title: string; items: NavItem[] }[] = [
    {
      title: t('settings.navAccount'),
      items: [
        { path: '/settings/profile', label: t('settings.profile'), Icon: User },
        { path: '/settings/accounts', label: t('accounts.manage'), Icon: Building2 },
        { path: '/settings/language', label: t('more.language'), Icon: Languages },
        { path: '/settings/notifications', label: t('more.notifications'), Icon: Bell },
      ],
    },
    {
      title: t('more.contactsData'),
      items: [
        { path: '/settings/fields', label: t('more.fields'), Icon: Sliders, show: canFields },
        { path: '/settings/tags', label: t('more.tags'), Icon: Tags },
        { path: '/settings/quick-replies', label: t('quick.title'), Icon: Zap },
      ],
    },
    {
      title: t('more.workspace'),
      items: [{ path: '/settings/about', label: t('more.about'), Icon: Info }],
    },
  ];
  return groups.map((g) => ({ ...g, items: g.items.filter((i) => i.show !== false) })).filter((g) => g.items.length);
};

export function SettingsNav() {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const pathname = usePathname();
  const groups = useSettingsNav();
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const signOut = useAuthStore((s) => s.signOut);

  const item = (i: NavItem) => {
    const active = pathname === i.path || pathname.startsWith(`${i.path}/`);
    return (
      <Pressable
        key={i.path}
        onPress={() => router.navigate(i.path as Href)}
        accessibilityRole="link"
        accessibilityState={{ selected: active }}
        style={({ hovered }: { hovered?: boolean }) => [
          styles.item,
          { borderRadius: radius.md, backgroundColor: active ? colors.primarySoft : hovered ? colors.surfaceAlt : 'transparent' },
        ]}
      >
        <i.Icon size={17} color={active ? colors.primary : colors.textMuted} />
        <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1, color: active ? colors.primary : colors.text, fontWeight: active ? '700' : '500' }}>
          {i.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.nav, { borderEndColor: colors.border, backgroundColor: colors.surface }]}>
      <Text variant="h2" style={styles.title} accessibilityRole="header">
        {t('more.settings')}
      </Text>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 16, gap: 16 }} showsVerticalScrollIndicator={false}>
        {groups.map((g) => (
          <View key={g.title} style={{ gap: 2 }}>
            <Text variant="micro" tone="faint" style={styles.group}>
              {g.title.toUpperCase()}
            </Text>
            {g.items.map(item)}
          </View>
        ))}
      </ScrollView>
      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <Pressable
          onPress={() => setTheme(theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system')}
          accessibilityRole="button"
          style={({ hovered }: { hovered?: boolean }) => [
            styles.item,
            { borderRadius: radius.md, backgroundColor: hovered ? colors.surfaceAlt : 'transparent' },
          ]}
        >
          <Moon size={17} color={colors.textMuted} />
          <Text variant="bodyStrong" style={{ flex: 1, fontWeight: '500' }}>
            {t('more.appearance')}
          </Text>
          <Text variant="caption" tone="muted">
            {theme === 'system' ? t('more.followsDevice') : theme === 'dark' ? t('more.dark') : t('more.light')}
          </Text>
        </Pressable>
        <Pressable
          onPress={() =>
            void confirmAction({
              title: t('auth.signOutConfirmTitle'),
              message: t('auth.signOutConfirmBody'),
              confirmText: t('auth.signOut'),
              cancelText: t('common.cancel'),
              destructive: true,
            }).then((ok) => {
              if (ok) void signOut();
            })
          }
          accessibilityRole="button"
          style={({ hovered }: { hovered?: boolean }) => [
            styles.item,
            { borderRadius: radius.md, backgroundColor: hovered ? colors.dangerSoft : 'transparent' },
          ]}
        >
          <LogOut size={17} color={colors.danger} />
          <Text variant="bodyStrong" tone="danger" style={{ fontWeight: '500' }}>
            {t('auth.signOut')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  nav: { width: 260, borderEndWidth: StyleSheet.hairlineWidth },
  title: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 12 },
  group: { paddingHorizontal: 10, paddingTop: 4, paddingBottom: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 38, paddingHorizontal: 10 },
  footer: { padding: 10, gap: 2, borderTopWidth: StyleSheet.hairlineWidth },
});

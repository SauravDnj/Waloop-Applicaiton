/**
 * Web shell around every signed-in page.
 *
 * Desktop (≥ 900 px): a dark sidebar with the account switcher, search, the
 * work sections, and settings + profile at the bottom;
 * contacts open in a panel that slides in from the right. Narrow windows get
 * the phone-style bottom strip. `flexDirection: 'row'` mirrors under RTL.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, Stack, usePathname, useRouter, type Href } from 'expo-router';
import { Columns3, Ellipsis, Megaphone, MessageCircle, Radio, Search, Settings, Users, type LucideIcon } from 'lucide-react-native';
import { useEffect } from 'react';

import { SidebarRootsContext } from '@/components/ui/Screen';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AccountPill } from '@/components/accounts/AccountSwitcher';
import { BrandLogo } from '@/components/Brand';
import { ContactPanel } from '@/components/leads/ContactPanel';
import { HIDDEN } from '@/components/navigation/FloatingTabBar';
import { AppLockGate } from '@/components/accounts/AppLock';
import { Avatar, Text } from '@/components/ui';
import { useDesktop } from '@/hooks/useDesktop';
import { useAccountFromLink, useAppGuard, useEndAddingOutsideAuth } from '@/lib/authGuard';
import { useDefaultChannelSync } from '@/hooks/queries';
import { useAuthStore, useCan, useCanAny, useMyName } from '@/stores/auth';
import { P } from '@/lib/permissions';
import { useTheme } from '@/theme/ThemeProvider';

type Item = { href: Href; match: string[]; label: string; Icon: LucideIcon; show: boolean };

const isActive = (path: string, match: string[]) => match.some((m) => (m === '/' ? path === '/' : path === m || path.startsWith(`${m}/`)));

export default function AppLayoutWeb() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const wide = useDesktop();
  const pathname = usePathname();
  const router = useRouter();
  // A member sees the sections their role can open.
  const can = {
    contacts: useCan(P.contacts.list),
    chats: useCan(P.chats.list),
    campaigns: useCan(P.campaigns.list),
    channels: useCanAny([...P.channelsAny]),
  };
  const name = useMyName();
  const profile = useAuthStore((s) => s.profile);
  const guard = useAppGuard();
  useEndAddingOutsideAuth();
  useDefaultChannelSync();
  useAccountFromLink();

  const work: Item[] = [
    { href: '/(app)/(tabs)/inbox', match: ['/inbox', '/chat', '/'], label: t('tabs.inbox'), Icon: MessageCircle, show: can.chats },
    {
      href: '/(app)/(tabs)/contacts',
      match: ['/contacts', '/lead', '/trash'],
      label: t('tabs.leads'),
      Icon: Users,
      show: can.contacts,
    },
    { href: '/(app)/(tabs)/board', match: ['/board'], label: t('tabs.board'), Icon: Columns3, show: can.contacts },
    { href: '/(app)/campaigns', match: ['/campaigns'], label: t('tabs.campaigns'), Icon: Megaphone, show: can.campaigns },
  ];
  const whatsapp: Item[] = [{ href: '/(app)/channels', match: ['/channels', '/whatsapp'], label: t('channels.title'), Icon: Radio, show: can.channels }];
  const settings: Item = {
    // Wide windows open the settings layout directly; the bottom strip's More page stays the phone way in.
    href: wide ? '/(app)/settings/profile' : '/(app)/(tabs)/more',
    match: ['/more', '/settings'],
    label: t('more.settings'),
    Icon: Settings,
    show: true,
  };

  // The browser tab names the section you are in.
  const section = [...work, ...whatsapp].find((i) => i.show && isActive(pathname, i.match)) ?? (isActive(pathname, settings.match) ? settings : null);
  const sectionLabel = section?.label;
  useEffect(() => {
    if (typeof document !== 'undefined') document.title = sectionLabel ? `${sectionLabel} · Inbox And Campaigns` : 'Inbox And Campaigns';
  }, [sectionLabel]);

  const row = (i: Item) => {
    // The more specific items above win over Settings' broad "/settings" match.
    const claimed = [...work, ...whatsapp].some((x) => x !== i && x.show && isActive(pathname, x.match));
    const active = isActive(pathname, i.match) && !(i === settings && claimed);
    return (
      <Pressable
        key={i.label}
        onPress={() => router.navigate(i.href)}
        style={({ hovered }: { hovered?: boolean }) => [styles.sideItem, active ? styles.sideActive : hovered ? styles.sideHover : null]}
      >
        <i.Icon size={18} color={active ? '#FFFFFF' : 'rgba(255,255,255,0.62)'} />
        <Text variant="bodyStrong" numberOfLines={1} style={{ color: active ? '#FFFFFF' : 'rgba(255,255,255,0.72)', flex: 1 }}>
          {i.label}
        </Text>
      </Pressable>
    );
  };
  const group = (title: string, items: Item[]) => {
    const shown = items.filter((i) => i.show);
    if (!shown.length) return null;
    return (
      <View style={{ gap: 2 }}>
        <Text variant="micro" style={styles.sectionTitle}>
          {title.toUpperCase()}
        </Text>
        {shown.map(row)}
      </View>
    );
  };

  if (guard.redirect) return <Redirect href={guard.redirect} />;
  if (!guard.ready) return null;

  const roots = [...work, ...whatsapp].filter((i) => i.show).map((i) => i.match[0]);
  const stack = (
    <SidebarRootsContext.Provider value={wide ? roots : []}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
    </SidebarRootsContext.Provider>
  );

  if (!wide) {
    // Phone-sized window: the main sections as a bottom strip, the rest under More.
    // The same tabs as the phone app: Inbox, Contacts, Boards, Campaigns, More.
    const main = work.filter((i) => i.show);
    const bottom = [...main, { ...settings, label: t('tabs.more'), Icon: Ellipsis }];
    return (
      <AppLockGate>
        <View style={[styles.root, { backgroundColor: colors.background }]}>
          <View style={styles.content}>{stack}</View>
          {/* Full-screen pages (an open chat) hide the strip, as on phones. */}
          {HIDDEN.some((h) => pathname.startsWith(h)) ? null : (
            <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {bottom.map((i) => {
                const active = isActive(pathname, i.match);
                return (
                  <Pressable
                    key={i.label}
                    onPress={() => router.navigate(i.href)}
                    style={[styles.bottomItem, active && { backgroundColor: colors.primarySoft }]}
                  >
                    <i.Icon size={22} color={active ? colors.primary : colors.textMuted} />
                    <Text variant="micro" tone={active ? 'primary' : 'muted'} numberOfLines={1}>
                      {i.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </AppLockGate>
    );
  }

  return (
    <AppLockGate>
      <View style={[styles.root, { backgroundColor: colors.background, flexDirection: 'row' }]}>
        <LinearGradient colors={[colors.heroFrom, colors.heroTo]} start={{ x: 0, y: 0 }} end={{ x: 0.4, y: 1 }} style={styles.sidebar}>
          <View style={styles.brand}>
            <BrandLogo height={30} light />
          </View>
          <View style={{ paddingHorizontal: 12, gap: 10 }}>
            <AccountPill />
            {can.contacts ? (
              <Pressable
                onPress={() => router.navigate('/(app)/search')}
                style={({ hovered }: { hovered?: boolean }) => [styles.search, hovered && { backgroundColor: 'rgba(255,255,255,0.12)' }]}
              >
                <Search size={16} color="rgba(255,255,255,0.7)" />
                <Text variant="caption" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  {t('common.search')}
                </Text>
              </Pressable>
            ) : null}
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 14, gap: 18 }} showsVerticalScrollIndicator={false}>
            {group(t('more.work'), work)}
            {group(t('more.whatsapp'), whatsapp)}
          </ScrollView>
          <View style={styles.footer}>
            {row(settings)}
            <Pressable
              onPress={() => router.navigate('/(app)/settings/profile')}
              style={({ hovered }: { hovered?: boolean }) => [styles.profile, hovered && styles.sideHover]}
            >
              <Avatar name={name} uri={profile?.avatarUrl} size={34} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong" numberOfLines={1} style={{ color: '#fff' }}>
                  {name}
                </Text>
                <Text variant="micro" numberOfLines={1} style={{ color: 'rgba(255,255,255,0.55)', letterSpacing: 0 }}>
                  {profile?.email}
                </Text>
              </View>
            </Pressable>
          </View>
        </LinearGradient>
        {/* Pages use the full width; each one caps its own reading width where it helps. */}
        <View style={styles.content}>
          {stack}
          <ContactPanel />
        </View>
      </View>
    </AppLockGate>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1, position: 'relative', overflow: 'hidden' },
  sidebar: { width: 252 },
  brand: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 16 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  sectionTitle: { color: 'rgba(255,255,255,0.42)', paddingHorizontal: 12, marginBottom: 4, letterSpacing: 0.8 },
  sideItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10 },
  sideActive: { backgroundColor: 'rgba(129,140,248,0.28)' },
  sideHover: { backgroundColor: 'rgba(255,255,255,0.07)' },
  footer: { padding: 10, gap: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.1)' },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: 10 },
  bottomBar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 6 },
  bottomItem: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 6, borderRadius: 10, marginHorizontal: 4 },
});

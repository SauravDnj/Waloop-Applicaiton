/**
 * Bottom tab bar, shown on every screen of the app (not just the tabs): it is
 * drawn once by the app layout and reads the current route itself.
 *
 * Inbox · Contacts · Boards · Campaigns · More
 *
 * A flat bar with a hairline top border and a solid surface; the active tab
 * gets a tinted icon and label.
 */
import * as Haptics from 'expo-haptics';
import { router, usePathname, type Href } from 'expo-router';
import { Columns3, Ellipsis, Megaphone, MessageCircle, Users } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/Text';
import { unreadCount, useAccountInbox } from '@/services/inbox/store';
import { useAccountsStore } from '@/stores/accounts';
import { useCan } from '@/stores/auth';
import { P } from '@/lib/permissions';
import { useTheme } from '@/theme/ThemeProvider';

type TabName = 'inbox' | 'contacts' | 'board' | 'campaigns' | 'more';

/** Full-screen pages (a chat with its composer): no bottom bar (phones, and narrow web windows). */
export const HIDDEN = ['/chat/'];

/** Height the bar covers at the bottom; screens pad by this so nothing hides behind it. */
export const useTabBarInset = () => {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  if (Platform.OS === 'web' || HIDDEN.some((h) => pathname.startsWith(h))) return 0;
  return 62 + Math.max(insets.bottom, 8);
};

const ICONS: Record<TabName, typeof Users> = {
  inbox: MessageCircle,
  contacts: Users,
  board: Columns3,
  campaigns: Megaphone,
  more: Ellipsis,
};

const HREF: Record<TabName, Href> = {
  inbox: '/(app)/(tabs)/inbox',
  contacts: '/(app)/(tabs)/contacts',
  board: '/(app)/(tabs)/board',
  campaigns: '/(app)/campaigns',
  more: '/(app)/(tabs)/more',
};

const LABEL: Record<TabName, string> = {
  inbox: 'tabs.inbox',
  contacts: 'tabs.leads',
  board: 'tabs.board',
  campaigns: 'tabs.campaigns',
  more: 'tabs.more',
};

export const TAB_BAR_SPACE = 96;

/** Which tab a path belongs to, so detail screens keep their section lit. */
const tabFor = (path: string): TabName | null => {
  if (path === '/' || path.startsWith('/inbox') || path.startsWith('/chat/')) return 'inbox';
  if (path.startsWith('/contacts') || path.startsWith('/lead/') || path.startsWith('/search') || path.startsWith('/trash'))
    return 'contacts';
  if (path.startsWith('/board')) return 'board';
  if (path.startsWith('/campaigns')) return 'campaigns';
  if (path.startsWith('/more') || path.startsWith('/settings') || path.startsWith('/channels') || path.startsWith('/whatsapp'))
    return 'more';
  return null;
};

export function FloatingTabBar() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const acct = useAccountsStore((s) => s.activeId);
  const unread = unreadCount(useAccountInbox(acct));
  const canContacts = useCan(P.contacts.list);
  const canChats = useCan(P.chats.list);
  const canCampaigns = useCan(P.campaigns.list);
  if (HIDDEN.some((h) => pathname.startsWith(h))) return null;
  const activeName = tabFor(pathname);
  // A member sees the sections their role can open.
  const tabs: TabName[] = [
    ...(canChats ? (['inbox'] as const) : []),
    ...(canContacts ? (['contacts', 'board'] as const) : []),
    ...(canCampaigns ? (['campaigns'] as const) : []),
    'more',
  ];
  const bottom = Math.max(insets.bottom, 8);

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <View style={[styles.bar, { backgroundColor: colors.tabBar, borderTopColor: colors.border, paddingBottom: bottom }]}>
        {tabs.map((name) => {
          const Icon = ICONS[name];
          const focused = activeName === name;
          return (
            <Pressable
              key={name}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              onPress={() => {
                void Haptics.selectionAsync();
                if (pathname !== `/${name}`) router.navigate(HREF[name]);
              }}
              style={styles.tab}
            >
              <View>
                <Icon size={22} color={focused ? colors.primary : colors.textFaint} strokeWidth={focused ? 2.2 : 1.8} />
                {name === 'inbox' && unread > 0 ? (
                  <View style={[styles.badge, { backgroundColor: colors.danger, borderColor: colors.tabBar }]}>
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{unread > 99 ? '99+' : unread}</Text>
                  </View>
                ) : null}
              </View>
              <Text
                variant="micro"
                style={{ color: focused ? colors.primary : colors.textMuted, fontWeight: focused ? '600' : '500', letterSpacing: 0 }}
                numberOfLines={1}
              >
                {t(LABEL[name])}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', start: 0, end: 0, bottom: 0 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    paddingHorizontal: 8,
  },
  tab: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 2 },
  badge: {
    position: 'absolute',
    top: -5,
    end: -10,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
});

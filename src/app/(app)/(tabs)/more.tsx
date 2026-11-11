/**
 * More. Profile hero card, then grouped settings rows with coloured icons.
 */
import * as Application from 'expo-application';
import { Redirect, router, type Href } from 'expo-router';
import { Bell, BookUser, Building2, ChevronRight, Info, Languages, LogOut, Moon, Palette, Radio, Sliders, Tags, Trash2, Zap } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AccountPill, ColorThemeSheet } from '@/components/accounts/AccountSwitcher';
import { BrandMark } from '@/components/Brand';
import { TAB_BAR_SPACE } from '@/components/navigation/FloatingTabBar';
import { Avatar, Group, GroupRow, Hero, Row, StatusPill, Text } from '@/components/ui';
import { LANGUAGES } from '@/i18n';
import { confirmAction } from '@/lib/dialog';
import { useAccountsStore, useActiveSession } from '@/stores/accounts';
import { useAuthStore, useCanAny, useIsOwner, useMyName } from '@/stores/auth';
import { P } from '@/lib/permissions';
import { useSettingsStore } from '@/stores/settings';
import { useTheme } from '@/theme/ThemeProvider';
import { rtlFlip } from '@/lib/rtl';
import { useDesktop } from '@/hooks/useDesktop';

export default function MoreScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const profile = useAuthStore((s) => s.profile);
  const context = useAuthStore((s) => s.context);
  const session = useActiveSession();
  const sessionCount = useAccountsStore((s) => s.sessions.length);
  const [colorOpen, setColorOpen] = useState(false);
  const signOut = useAuthStore((s) => s.signOut);
  const isOwner = useIsOwner();
  // A member sees what their role allows.
  const can = {
    trash: useCanAny([P.contacts.update, P.contacts.delete]),
    channels: useCanAny([...P.channelsAny]),
    fields: useCanAny([P.fields.create, P.fields.update, P.fields.delete]),
    // Syncing the phone's contacts adds contacts; phones only.
    phoneSync: useCanAny([P.contacts.create]) && Platform.OS !== 'web',
  };
  const name = useMyName();
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const language = useSettingsStore((s) => s.language);
  const go = (href: Href) => () => router.push(href);
  // Desktop: the groups in two columns.
  const desktop = useDesktop();
  const half = desktop ? styles.half : undefined;
  type Item = { key: string; icon: ReactNode; tint: string; title: string; subtitle?: string; href: Href };
  // Rows of a group, skipping the ones switched off (false); the last one gets no divider.
  const rows = (items: (Item | false)[]) => {
    const shown = items.filter((x): x is Item => !!x);
    return shown.map((x, i) => (
      <GroupRow key={x.key} last={i === shown.length - 1} icon={x.icon} tint={x.tint} title={x.title} subtitle={x.subtitle} onPress={go(x.href)} />
    ));
  };

  // Desktop has the settings layout (menu beside each page) instead of this list.
  if (desktop) return <Redirect href="/(app)/settings/profile" />;

  const confirmSignOut = () =>
    void confirmAction({
      title: t('auth.signOutConfirmTitle'),
      message: t('auth.signOutConfirmBody'),
      confirmText: t('auth.signOut'),
      cancelText: t('common.cancel'),
      destructive: true,
    }).then((ok) => {
      if (ok) void signOut();
    });

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: TAB_BAR_SPACE + 24 }}
      showsVerticalScrollIndicator={false}
    >
      <Hero top={<AccountPill inPage />}>
        <Pressable onPress={go('/(app)/settings/profile')} style={styles.profile}>
          <View style={styles.avatarRing}>
            <Avatar name={name} uri={profile?.avatarUrl} size={60} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text variant="h2" style={{ color: '#fff' }} numberOfLines={1}>
              {name}
            </Text>
            <Text variant="caption" style={{ color: colors.onHeroMuted }} numberOfLines={1}>
              {profile?.email}
            </Text>
            <Row gap={6}>
              <StatusPill label={context?.accountName || t('more.myWorkspace')} color="#fff" onHero />
              <StatusPill label={isOwner ? t('common.owner') : context?.role?.title || t('common.member')} color="#fff" onHero />
            </Row>
          </View>
          <ChevronRight size={20} color="#fff" style={rtlFlip()} />
        </Pressable>
      </Hero>

      <View style={[styles.body, desktop && styles.bodyWide]}>
        <Group style={half}>
          <GroupRow
            last
            icon={<Building2 size={18} color={session?.color ?? colors.primary} />}
            tint={session?.color ?? colors.primary}
            title={t('accounts.manage')}
            subtitle={t('accounts.signedIn', { count: sessionCount })}
            onPress={go('/(app)/settings/accounts')}
          />
        </Group>

        {/* The contact data: its fields, labels, replies, and where contacts come from. */}
        <Group style={half} title={t('more.contactsData')}>
          {rows([
            can.fields && {
              key: 'fields',
              icon: <Sliders size={18} color={colors.sms} />,
              tint: colors.sms,
              title: t('more.fields'),
              subtitle: t('more.fieldsSub'),
              href: '/(app)/settings/fields',
            },
            {
              key: 'tags',
              icon: <Tags size={18} color={colors.accent} />,
              tint: colors.accent,
              title: t('more.tags'),
              subtitle: t('more.tagsSub'),
              href: '/(app)/settings/tags',
            },
            {
              key: 'quick',
              icon: <Zap size={18} color={colors.warning} />,
              tint: colors.warning,
              title: t('quick.title'),
              subtitle: t('quick.moreSub'),
              href: '/(app)/settings/quick-replies',
            },
            can.phoneSync && {
              key: 'phoneSync',
              icon: <BookUser size={18} color={colors.primary} />,
              tint: colors.primary,
              title: t('phoneSync.title'),
              subtitle: t('phoneSync.moreSub', { workspace: session?.workspaceName ?? '' }),
              href: '/(app)/settings/phone-contacts',
            },
            can.trash && {
              key: 'trash',
              icon: <Trash2 size={18} color={colors.danger} />,
              tint: colors.danger,
              title: t('trash.title'),
              subtitle: t('more.trashSub'),
              href: '/(app)/trash',
            },
          ])}
        </Group>

        {/* WhatsApp API channels and their templates. */}
        {can.channels ? (
          <Group style={half} title={t('more.whatsapp')}>
            <GroupRow
              last
              icon={<Radio size={18} color={colors.success} />}
              tint={colors.success}
              title={t('channels.title')}
              subtitle={t('channels.moreSub')}
              onPress={go('/(app)/channels')}
            />
          </Group>
        ) : null}

        <Group style={half} title={t('more.preferences')}>
          <GroupRow
            icon={<Bell size={18} color={colors.warning} />}
            tint={colors.warning}
            title={t('more.notifications')}
            subtitle={t('more.notificationsSub')}
            onPress={go('/(app)/settings/notifications')}
          />
          <GroupRow
            icon={<Languages size={18} color={colors.accent} />}
            tint={colors.accent}
            title={t('more.language')}
            subtitle={LANGUAGES.find((l) => l.code === language)?.native ?? 'English'}
            onPress={go('/(app)/settings/language')}
          />
          <GroupRow
            icon={<Palette size={18} color={colors.primary} />}
            tint={colors.primary}
            title={t('accounts.color')}
            subtitle={session?.workspaceName}
            right={<View style={[styles.swatchDot, { backgroundColor: session?.color ?? colors.primary }]} />}
            onPress={() => setColorOpen(true)}
          />
          <GroupRow
            last
            icon={<Moon size={18} color={colors.textMuted} />}
            tint={colors.textMuted}
            title={t('more.appearance')}
            subtitle={theme === 'system' ? t('more.followsDevice') : theme === 'dark' ? t('more.dark') : t('more.light')}
            onPress={() => setTheme(theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system')}
          />
        </Group>

        <Group style={half} title={t('more.workspace')}>
          <GroupRow
            last
            icon={<Info size={18} color={colors.textMuted} />}
            tint={colors.textMuted}
            title={t('more.about')}
            subtitle={t('more.version', {
              version: Application.nativeApplicationVersion ?? '1.0.0',
            })}
            onPress={go('/(app)/settings/about')}
          />
        </Group>

        <Group style={half}>
          <GroupRow
            last
            danger
            icon={<LogOut size={18} color={colors.danger} />}
            tint={colors.danger}
            title={t('auth.signOut')}
            onPress={confirmSignOut}
            right={<View />}
          />
        </Group>

        <ColorThemeSheet open={colorOpen} onClose={() => setColorOpen(false)} />
        <View style={[styles.footer, { width: '100%' }]}>
          <BrandMark size={26} />
          <Text variant="micro" tone="faint">
            Inbox And Campaigns
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarRing: {
    padding: 3,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  body: { paddingHorizontal: 16, gap: 20, marginTop: 20 },
  bodyWide: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' },
  half: { flexBasis: '45%', flexGrow: 1 },
  footer: { alignItems: 'center', gap: 6, opacity: 0.6, marginTop: 4 },
  swatchDot: { width: 22, height: 22, borderRadius: 7 },
});

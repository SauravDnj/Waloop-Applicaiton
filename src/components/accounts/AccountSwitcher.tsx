/**
 * Account switcher: a pill on the hero showing the active account in its
 * colour, and a sheet listing every signed-in account. All accounts stay
 * signed in and keep syncing calls; switching only changes what is on screen.
 */
import { router } from 'expo-router';
import { Building2, Check, ChevronDown, Plus, Settings2 } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Sheet, Text } from '@/components/ui';
import { showAlert } from '@/lib/dialog';
import { withAlpha } from '@/lib/color';
import { ACCOUNT_COLORS, sessionId, useAccountsStore, useActiveSession, type AccountSession } from '@/stores/accounts';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { useDesktop } from '@/hooks/useDesktop';
import { ACCESS_LOCKED } from '@/services/accessId';

/** Round initials badge in the account's colour. */
export function AccountBadge({ session, size = 36 }: { session: Pick<AccountSession, 'workspaceName' | 'color'>; size?: number }) {
  const initials =
    session.workspaceName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?';
  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size * 0.32, backgroundColor: session.color }]}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.38 }}>{initials}</Text>
    </View>
  );
}

/** Hero pill: colour dot, workspace name, chevron. Opens the switcher. */
/** `inPage`: a page header's copy, left out on desktop where the sidebar has one. */
export function AccountPill({ inPage = false }: { inPage?: boolean }) {
  const session = useActiveSession();
  const desktop = useDesktop();
  const count = useAccountsStore((s) => s.sessions.length);
  const [open, setOpen] = useState(false);
  if (!session || (inPage && desktop)) return null;
  return (
    <>
      <Pressable onPress={() => setOpen(true)} hitSlop={6} style={({ pressed }) => [styles.pill, { opacity: pressed ? 0.75 : 1 }]}>
        <View style={[styles.dot, { backgroundColor: session.color }]} />
        <Text variant="caption" style={{ color: '#fff', fontWeight: '700', maxWidth: 180 }} numberOfLines={1}>
          {session.workspaceName}
        </Text>
        {count > 1 ? (
          <View style={styles.count}>
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{count}</Text>
          </View>
        ) : null}
        <ChevronDown size={14} color="#fff" />
      </Pressable>
      <AccountSwitcherSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function AccountSwitcherSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const sessions = useAccountsStore((s) => s.sessions);
  const activeId = useAccountsStore((s) => s.activeId);
  const active = sessions.find((s) => s.id === activeId);
  const workspaces = useAuthStore((s) => s.accounts);
  const switchSession = useAuthStore((s) => s.switchSession);
  const addWorkspace = useAuthStore((s) => s.addWorkspace);
  const beginAddAccount = useAuthStore((s) => s.beginAddAccount);
  const [busy, setBusy] = useState<string | null>(null);

  // Other workspaces of the active login that are not signed in yet.
  const others = active ? workspaces.filter((w) => !sessions.some((s) => s.id === sessionId(active.userId, w.account_id))) : [];

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
      onClose();
    } catch (err) {
      showAlert(t('accounts.couldNotSwitch'), err instanceof Error ? err.message : '');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('accounts.title')} subtitle={t('accounts.subtitle')}>
      <View style={{ gap: 8 }}>
        {sessions.map((s) => {
          const on = s.id === activeId;
          return (
            <Pressable
              key={s.id}
              onPress={() => (on ? onClose() : void run(s.id, () => switchSession(s.id)))}
              style={({ pressed }) => [
                styles.row,
                {
                  borderRadius: radius.md,
                  backgroundColor: on ? withAlpha(s.color, 0.12) : pressed ? colors.surfaceAlt : 'transparent',
                  borderColor: on ? s.color : colors.border,
                },
              ]}
            >
              <AccountBadge session={s} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {s.workspaceName}
                </Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {s.email}
                </Text>
              </View>
              {busy === s.id ? <ActivityIndicator color={s.color} /> : on ? <Check size={20} color={s.color} /> : null}
            </Pressable>
          );
        })}

        {others.length ? (
          <Text variant="micro" tone="faint" style={{ marginTop: 8, marginStart: 4 }}>
            {t('accounts.otherWorkspaces').toUpperCase()}
          </Text>
        ) : null}
        {others.map((w) => (
          <Pressable
            key={w.account_id}
            onPress={() => void run(w.account_id, () => addWorkspace(w.account_id))}
            style={({ pressed }) => [
              styles.row,
              { borderRadius: radius.md, borderColor: colors.border, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' },
            ]}
          >
            <View style={[styles.iconBox, { backgroundColor: colors.surfaceAlt, borderRadius: 12 }]}>
              <Building2 size={18} color={colors.textMuted} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {w.name}
              </Text>
              <Text variant="caption" tone="muted">
                {w.is_owner ? t('common.owner') : w.role || t('common.member')}
              </Text>
            </View>
            {busy === w.account_id ? <ActivityIndicator color={colors.primary} /> : <Plus size={18} color={colors.primary} />}
          </Pressable>
        ))}

        <View style={[styles.actions, { borderTopColor: colors.border }]}>
          <Pressable
            style={styles.action}
            onPress={() => {
              onClose();
              beginAddAccount();
              router.push(ACCESS_LOCKED ? '/(auth)/login' : '/(auth)/access');
            }}
          >
            <Plus size={18} color={colors.primary} />
            <Text variant="bodyStrong" style={{ color: colors.primary }}>
              {t('accounts.add')}
            </Text>
          </Pressable>
          <Pressable
            style={styles.action}
            onPress={() => {
              onClose();
              router.push('/(app)/settings/accounts');
            }}
          >
            <Settings2 size={18} color={colors.textMuted} />
            <Text variant="bodyStrong" tone="muted">
              {t('accounts.manage')}
            </Text>
          </Pressable>
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
    marginBottom: 10,
  },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: '#fff' },
  count: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1 },
  iconBox: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, marginTop: 8, paddingTop: 12 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 6 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', paddingVertical: 8 },
  swatch: { width: 48, height: 48, borderRadius: 14, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
});

/** 15 colour swatches; the pick becomes the active account's app theme. */
export function ColorThemeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const session = useActiveSession();
  const setColor = useAccountsStore((s) => s.setColor);
  if (!session) return null;
  return (
    <Sheet open={open} onClose={onClose} title={t('accounts.color')} subtitle={t('accounts.colorHint')}>
      <View style={styles.swatches}>
        {ACCOUNT_COLORS.map((c) => {
          const on = session.color === c;
          return (
            <Pressable
              key={c}
              accessibilityLabel={c}
              accessibilityState={{ selected: on }}
              onPress={() => setColor(session.id, c)}
              style={[styles.swatch, { backgroundColor: c, borderColor: on ? colors.text : 'transparent' }]}
            >
              {on ? <Check size={18} color="#fff" /> : null}
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

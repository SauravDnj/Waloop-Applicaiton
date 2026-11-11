import { HOME } from '@/lib/nav';
import { router } from 'expo-router';
import { Check, Crown } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import { AuthShell } from '@/components/AuthShell';
import { Button, ListRow, Loading, StatusPill, Text } from '@/components/ui';
import { hasChosenAccessId } from '@/services/accessId';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Both halves of the multi-account flow: the picker after login (ticket mode)
 * and the "access to this account was revoked" recovery (session mode).
 */
export default function AccountsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const pending = useAuthStore((s) => s.pending);
  const status = useAuthStore((s) => s.status);
  const sessionAccounts = useAuthStore((s) => s.accounts);
  const context = useAuthStore((s) => s.context);
  const chooseAccount = useAuthStore((s) => s.chooseAccount);
  const switchAccount = useAuthStore((s) => s.switchAccount);
  const signOut = useAuthStore((s) => s.signOut);
  const error = useAuthStore((s) => s.error);
  const [busy, setBusy] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const ticketMode = pending?.kind === 'account';
  const accounts = ticketMode ? pending.accounts : sessionAccounts;

  const pick = async (id: string) => {
    setBusy(id);
    setLocalError(null);
    try {
      if (ticketMode) await chooseAccount(id);
      else await switchAccount(id);
      router.replace(HOME);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : t('common.errorTitle'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <AuthShell
      title={t('auth.chooseAccount')}
      subtitle={status === 'accountLost' ? error || t('auth.accessEnded') : t('auth.chooseAccountSubtitle')}
      back={ticketMode || status === 'signedIn'}
    >
      {!accounts.length ? <Loading label={t('common.loading')} /> : null}
      <View style={{ marginHorizontal: -20 }}>
        {accounts.map((a) => {
          const current = context?.accountId === a.account_id;
          return (
            <ListRow
              key={a.account_id}
              title={a.name}
              avatarName={a.name}
              subtitle={a.access_expiry ? new Date(a.access_expiry).toLocaleDateString() : undefined}
              meta={
                <View style={{ marginTop: 4 }}>
                  <StatusPill label={a.is_owner ? t('common.owner') : a.role || t('common.member')} color={a.is_owner ? colors.warning : colors.primary} />
                </View>
              }
              onPress={() => void pick(a.account_id)}
              selected={current}
              trailing={
                busy === a.account_id ? (
                  <ActivityIndicator color={colors.primary} />
                ) : current ? (
                  <Check size={20} color={colors.primary} />
                ) : a.is_owner ? (
                  <Crown size={18} color={colors.warning} />
                ) : undefined
              }
            />
          );
        })}
      </View>
      {localError ? (
        <Text variant="caption" tone="danger" center>
          {localError}
        </Text>
      ) : null}
      {ticketMode ? (
        <Text variant="caption" tone="faint" center>
          {t('auth.choiceExpires')}
        </Text>
      ) : (
        <Button
          title={t('auth.signOut')}
          variant="ghost"
          onPress={() =>
            void signOut().then(() => {
              // The last account is gone: nothing else will move us off this screen.
              if (useAuthStore.getState().status === 'signedOut') router.replace(hasChosenAccessId() ? '/(auth)/login' : '/(auth)/access');
            })
          }
          style={{ alignSelf: 'center' }}
        />
      )}
    </AuthShell>
  );
}

/**
 * The app lock's screens: the PIN pad, setting / checking a PIN, resetting a
 * forgotten one with the account's password, the full-screen lock over a
 * locked account, and the per-account switch in Manage accounts.
 */
import * as Haptics from 'expo-haptics';
import { Delete, KeyRound, Lock } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccountBadge } from '@/components/accounts/AccountSwitcher';
import { useCaptchaField } from '@/components/captcha/useCaptchaField';
import { Button, Input, Row, Sheet, Text } from '@/components/ui';
import { showAlert } from '@/lib/dialog';
import { checkPassword } from '@/services/sso/client';
import { checkPin, removePin, setPin, unlock, useCovered, useHasPin, useIsLocked } from '@/stores/appLock';
import { useAccountsStore, type AccountSession } from '@/stores/accounts';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme/ThemeProvider';

const LENGTH = 4;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '<'];

/** Dots for the digits typed, and a keypad. Calls `onFull` once all digits are in. */
function PinPad({
  onFull,
  message,
  tone = 'muted',
  disabled,
}: {
  onFull: (pin: string) => void;
  message?: string;
  tone?: 'muted' | 'danger';
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const [pin, setPinValue] = useState('');
  const press = (k: string) => {
    if (disabled) return;
    void Haptics.selectionAsync();
    if (k === '<') return setPinValue((p) => p.slice(0, -1));
    const next = (pin + k).slice(0, LENGTH);
    setPinValue(next);
    if (next.length === LENGTH) {
      // Cleared at once so a wrong PIN can be typed again straight away.
      setPinValue('');
      onFull(next);
    }
  };
  return (
    <View style={{ alignItems: 'center', gap: 18 }}>
      <Row gap={14}>
        {Array.from({ length: LENGTH }, (_, i) => (
          <View key={i} style={[styles.dot, { borderColor: colors.primary, backgroundColor: i < pin.length ? colors.primary : 'transparent' }]} />
        ))}
      </Row>
      <Text variant="caption" tone={tone} center style={{ minHeight: 18 }}>
        {message ?? ''}
      </Text>
      <View style={styles.pad}>
        {KEYS.map((k, i) =>
          k ? (
            <Pressable
              key={i}
              onPress={() => press(k)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={k === '<' ? 'Delete' : k}
              style={({ pressed }) => [
                styles.key,
                { backgroundColor: k === '<' ? 'transparent' : pressed ? colors.primarySoft : colors.surfaceAlt, opacity: disabled ? 0.4 : 1 },
              ]}
            >
              {k === '<' ? <Delete size={24} color={colors.text} /> : <Text style={{ fontSize: 26, fontWeight: '500', color: colors.text }}>{k}</Text>}
            </Pressable>
          ) : (
            <View key={i} style={styles.key} />
          ),
        )}
      </View>
    </View>
  );
}

/** A wrong PIN's message: wrong, or how long to wait after too many. */
const useWrongMessage = () => {
  const { t } = useTranslation();
  return (waitMs: number) => (waitMs ? t('lock.wait', { seconds: Math.ceil(waitMs / 1000) }) : t('lock.wrong'));
};

/** Set a new PIN: type it, then again to confirm. */
export function SetPinSheet({ session, subtitle, onClose, onDone }: { session: AccountSession; subtitle?: string; onClose: () => void; onDone?: () => void }) {
  const { t } = useTranslation();
  const [first, setFirst] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();
  return (
    <Sheet
      open
      onClose={onClose}
      title={first ? t('lock.confirmTitle') : t('lock.setTitle')}
      subtitle={subtitle ?? t('lock.setSub', { name: session.workspaceName })}
    >
      <PinPad
        key={first ?? 'first'}
        tone={error ? 'danger' : 'muted'}
        message={error}
        onFull={(pin) => {
          if (!first) {
            setError(undefined);
            return setFirst(pin);
          }
          if (pin !== first) {
            setFirst(null);
            return setError(t('lock.mismatch'));
          }
          void setPin(session.id, pin)
            .then(() => {
              onDone?.();
              onClose();
            })
            .catch((e: unknown) => showAlert(t('common.couldNotSave'), e instanceof Error ? e.message : ''));
        }}
      />
    </Sheet>
  );
}

/** Asks for the current PIN before changing or removing it; "Forgot" goes to the password. */
export function VerifyPinSheet({ session, title, onClose, onVerified }: { session: AccountSession; title: string; onClose: () => void; onVerified: () => void }) {
  const { t } = useTranslation();
  const wrong = useWrongMessage();
  const [error, setError] = useState<string | undefined>();
  const [forgot, setForgot] = useState(false);
  if (forgot) return <PasswordResetSheet session={session} onClose={onClose} />;
  return (
    <Sheet open onClose={onClose} title={title} subtitle={t('lock.enterTitle')}>
      <PinPad
        tone="danger"
        message={error}
        onFull={(pin) =>
          void checkPin(session.id, pin).then((r) => {
            if (r.ok) onVerified();
            else setError(wrong(r.waitMs));
          })
        }
      />
      <Button title={t('lock.forgot')} variant="ghost" onPress={() => setForgot(true)} style={{ marginTop: 8 }} />
    </Sheet>
  );
}

/**
 * A forgotten PIN: the account's password (checked with the server) removes it,
 * then a new one can be set, or the sheet closed to leave the lock off.
 */
export function PasswordResetSheet({ session, onClose }: { session: AccountSession; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const captcha = useCaptchaField('submit', session.accessId);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);

  if (verified) return <SetPinSheet session={session} subtitle={t('lock.newPin')} onClose={onClose} />;

  const submit = async () => {
    if (!password) return;
    setBusy(true);
    setError(null);
    try {
      await checkPassword(session.accessId, session.email, password, await captcha.getToken());
      await removePin(session.id);
      unlock(session.id);
      setVerified(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('auth.signInFailed'));
      captcha.reset();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title={t('lock.resetTitle')} subtitle={t('lock.resetSub', { email: session.email })} locked={busy}>
      <View style={{ gap: 12 }}>
        <Input
          label={t('auth.password')}
          placeholder="••••••••"
          secureTextEntry
          autoFocus
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={() => void submit()}
          left={<KeyRound size={18} color={colors.textFaint} />}
        />
        {captcha.element}
        {error ? (
          <Text variant="caption" tone="danger" center>
            {error}
          </Text>
        ) : null}
        <Button title={t('lock.verify')} onPress={() => void submit()} loading={busy || captcha.loading} disabled={!password} full />
      </View>
    </Sheet>
  );
}

/** Full screen over a locked account. */
function LockScreen({ session, onForgot }: { session: AccountSession; onForgot: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const wrong = useWrongMessage();
  const sessions = useAccountsStore((s) => s.sessions);
  const switchSession = useAuthStore((s) => s.switchSession);
  const [error, setError] = useState<string | undefined>();
  const [switching, setSwitching] = useState(false);
  const others = sessions.filter((s) => s.id !== session.id);

  return (
    <View style={[styles.screen, styles.lock, { backgroundColor: colors.background, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 16 }]}>
      <View style={{ alignItems: 'center', gap: 8 }}>
        <View>
          <AccountBadge session={session} size={64} />
          <View style={[styles.lockMark, { backgroundColor: colors.primary, borderColor: colors.background }]}>
            <Lock size={12} color="#fff" />
          </View>
        </View>
        <Text variant="h2" center numberOfLines={1}>
          {session.workspaceName}
        </Text>
        <Text variant="caption" tone="muted" center numberOfLines={1}>
          {session.email}
        </Text>
        <Text variant="bodyStrong" center style={{ marginTop: 10 }}>
          {t('lock.enterTitle')}
        </Text>
      </View>
      <PinPad
        tone="danger"
        message={error}
        onFull={(pin) =>
          void checkPin(session.id, pin).then((r) => {
            if (!r.ok) {
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              setError(wrong(r.waitMs));
            }
          })
        }
      />
      <View style={{ gap: 4 }}>
        <Button title={t('lock.forgot')} variant="ghost" onPress={onForgot} />
        {others.length ? <Button title={t('lock.switchAccount')} variant="ghost" onPress={() => setSwitching(true)} /> : null}
      </View>

      {switching ? (
        <Sheet open onClose={() => setSwitching(false)} title={t('lock.switchAccount')}>
          <View style={{ gap: 6 }}>
            {others.map((s) => (
              <Pressable
                key={s.id}
                onPress={() => {
                  setSwitching(false);
                  void switchSession(s.id).catch((e: unknown) => showAlert(t('accounts.couldNotSwitch'), e instanceof Error ? e.message : ''));
                }}
                style={({ pressed }) => [styles.accountRow, { backgroundColor: pressed ? colors.surfaceAlt : 'transparent' }]}
              >
                <AccountBadge session={s} size={36} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {s.workspaceName}
                  </Text>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {s.email}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        </Sheet>
      ) : null}
    </View>
  );
}

/**
 * Wraps every signed-in screen. While the account on screen is locked, its
 * screens (and any sheet or viewer they had open) are not rendered at all,
 * only the lock screen; while the app is in the background they are covered,
 * so the app switcher's snapshot shows nothing. Relocking itself is in
 * `stores/appLock`.
 */
export function AppLockGate({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const activeId = useAccountsStore((s) => s.activeId);
  const session = useAccountsStore((s) => s.sessions.find((x) => x.id === s.activeId));
  const locked = useIsLocked(activeId);
  const covered = useCovered(activeId);
  // Kept here, not in the lock screen: the password unlocks the account (which removes the
  // lock screen) and this sheet then goes on to set a new PIN.
  const [forgot, setForgot] = useState<AccountSession | null>(null);

  return (
    <>
      {locked && session ? <LockScreen key={session.id} session={session} onForgot={() => setForgot(session)} /> : children}
      {covered && !locked ? <View style={[StyleSheet.absoluteFill, styles.lock, { backgroundColor: colors.background }]} /> : null}
      {forgot ? <PasswordResetSheet session={forgot} onClose={() => setForgot(null)} /> : null}
    </>
  );
}

/** "PIN lock" on an account's card in Manage accounts: on, off (asks the PIN), change. */
export function AppLockSetting({ session }: { session: AccountSession }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const on = useHasPin(session.id);
  const [sheet, setSheet] = useState<null | 'set' | 'off' | 'change' | 'changeNew'>(null);

  return (
    <View style={{ gap: 6 }}>
      <Row gap={10}>
        <Lock size={16} color={colors.textMuted} />
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong">{t('lock.title')}</Text>
          <Text variant="micro" tone="faint" style={{ letterSpacing: 0 }}>
            {t('lock.settingHint')}
          </Text>
        </View>
        <Switch value={on} onValueChange={(v) => setSheet(v ? 'set' : 'off')} trackColor={{ true: colors.primary }} />
      </Row>
      {on ? <Button title={t('lock.change')} size="sm" variant="ghost" onPress={() => setSheet('change')} style={{ alignSelf: 'flex-start' }} /> : null}

      {sheet === 'set' || sheet === 'changeNew' ? <SetPinSheet session={session} onClose={() => setSheet(null)} /> : null}
      {sheet === 'off' ? (
        <VerifyPinSheet
          session={session}
          title={t('lock.turnOff')}
          onClose={() => setSheet(null)}
          onVerified={() => {
            setSheet(null);
            void removePin(session.id);
          }}
        />
      ) : null}
      {sheet === 'change' ? (
        <VerifyPinSheet session={session} title={t('lock.change')} onClose={() => setSheet(null)} onVerified={() => setSheet('changeNew')} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  lock: { zIndex: 1000, elevation: 1000, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24 },
  screen: { flex: 1 },
  lockMark: {
    position: 'absolute',
    end: -4,
    bottom: -4,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  pad: { width: 276, flexDirection: 'row', flexWrap: 'wrap', gap: 18, justifyContent: 'center' },
  key: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 12 },
});

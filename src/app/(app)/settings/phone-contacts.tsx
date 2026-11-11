/**
 * Phone contacts → CRM for the account on screen. Says plainly what leaves the
 * phone before asking for the permission (app stores require it), then:
 * off, automatic (everything, minus blocked contacts) or manual (pick and sync).
 * Blocked contacts are never added, in either mode.
 */
import { useQueryClient } from '@tanstack/react-query';
import { BookUser, Ban, RefreshCw, ShieldCheck, UserPlus, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, Platform, Pressable, View } from 'react-native';

import { RequireCan } from '@/components/RequireCan';
import { PhoneContactPicker } from '@/components/leads/PhoneContactPicker';
import { Button, Card, Row, Screen, SegmentedControl, Text } from '@/components/ui';
import { confirmAction, showAlert } from '@/lib/dialog';
import { P } from '@/lib/permissions';
import { formatWhen } from '@/lib/time';
import { describeCrmError } from '@/services/crm/client';
import {
  askContactsPermission,
  blockContacts,
  hasContactsPermission,
  readDeviceContacts,
  readSyncSettings,
  syncContacts,
  syncedNumbers,
  unblockContacts,
  writeSyncSettings,
  type DeviceContact,
  type SyncMode,
  type SyncResult,
} from '@/services/phoneContacts';
import { useAccountsStore } from '@/stores/accounts';
import { useTheme } from '@/theme/ThemeProvider';

function PhoneContactsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const acct = useAccountsStore((s) => s.activeId) ?? '';
  const workspace = useAccountsStore((s) => s.sessions.find((x) => x.id === s.activeId)?.workspaceName ?? '');
  const [settings, setSettings] = useState(() => readSyncSettings(acct));
  const [granted, setGranted] = useState<boolean | null>(null);
  const [contacts, setContacts] = useState<DeviceContact[] | null>(null);
  const [picker, setPicker] = useState<null | 'sync' | 'block'>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    void hasContactsPermission()
      .then(setGranted)
      .catch(() => setGranted(false));
  }, []);

  const save = (patch: Parameters<typeof writeSyncSettings>[1]) => setSettings(writeSyncSettings(acct, patch));

  /** Asks for the permission (only after the user chose to sync); `false` if refused. */
  const ensurePermission = async () => {
    if (granted) return true;
    const ok = await askContactsPermission().catch(() => false);
    setGranted(ok);
    if (!ok) showAlert(t('phoneSync.deniedTitle'), t('phoneSync.deniedBody'));
    return ok;
  };

  const load = async () => {
    if (contacts) return contacts;
    const list = await readDeviceContacts();
    setContacts(list);
    return list;
  };

  const report = (r: SyncResult) => {
    void qc.invalidateQueries({ queryKey: ['leads'] });
    setSettings(readSyncSettings(acct));
    if (r.error) return showAlert(t('phoneSync.failedTitle'), describeCrmError(r.error));
    showAlert(t('phoneSync.doneTitle'), t('phoneSync.doneBody', { added: r.added, existing: r.existing, failed: r.failed }));
  };

  const run = async (list: DeviceContact[]) => {
    setProgress({ done: 0, total: list.length });
    try {
      const res = await syncContacts(acct, list, (done, total) => setProgress({ done, total }));
      if (res.busy) return showAlert(t('phoneSync.busy'));
      report(res);
    } catch (e) {
      showAlert(t('phoneSync.failedTitle'), e instanceof Error ? e.message : '');
    } finally {
      setProgress(null);
    }
  };

  const pickMode = async (mode: SyncMode) => {
    if (mode === settings.mode) return;
    // Automatic sends every contact at once: say so, so contacts can be blocked first.
    if (
      mode === 'auto' &&
      !(await confirmAction({ title: t('phoneSync.autoConfirmTitle'), message: t('phoneSync.autoConfirmBody'), confirmText: t('phoneSync.auto'), cancelText: t('common.cancel') }))
    )
      return;
    if (mode !== 'off' && !(await ensurePermission())) return;
    save({ mode });
    if (mode === 'auto')
      await load()
        .then(run)
        .catch((e: unknown) => showAlert(t('phoneSync.failedTitle'), e instanceof Error ? e.message : ''));
  };

  const openPicker = async (which: 'sync' | 'block') => {
    if (!(await ensurePermission())) return;
    try {
      await load();
      setPicker(which);
    } catch (e) {
      showAlert(t('phoneSync.failedTitle'), e instanceof Error ? e.message : '');
    }
  };

  return (
    <Screen title={t('phoneSync.title')} subtitle={workspace} back scroll>
      <View style={{ gap: 14, marginTop: 8 }}>
        {/* What leaves the phone, before anything is read. */}
        <Card style={{ gap: 8 }}>
          <Row gap={8}>
            <ShieldCheck size={18} color={colors.primary} />
            <Text variant="h3">{t('phoneSync.whatTitle')}</Text>
          </Row>
          <Text variant="caption" tone="muted">
            {t('phoneSync.whatBody', { workspace })}
          </Text>
        </Card>

        <Card style={{ gap: 10 }}>
          <Text variant="h3">{t('phoneSync.mode')}</Text>
          <SegmentedControl
            value={settings.mode}
            onChange={(m) => void pickMode(m)}
            options={[
              { value: 'off', label: t('phoneSync.off') },
              { value: 'auto', label: t('phoneSync.auto') },
              { value: 'manual', label: t('phoneSync.manual') },
            ]}
          />
          <Text variant="caption" tone="muted">
            {settings.mode === 'auto' ? t('phoneSync.autoHint') : settings.mode === 'manual' ? t('phoneSync.manualHint') : t('phoneSync.offHint')}
          </Text>
          {granted === false && settings.mode !== 'off' ? (
            <Button title={t('phoneSync.openSettings')} variant="secondary" onPress={() => void Linking.openSettings()} />
          ) : null}
          {settings.lastRunAt ? (
            <Text variant="caption" tone="faint">
              {t('phoneSync.lastRun', { when: formatWhen(settings.lastRunAt), count: settings.lastAdded })}
            </Text>
          ) : null}
          {progress ? (
            <Row gap={8}>
              <ActivityIndicator color={colors.primary} />
              <Text variant="caption" tone="muted">
                {t('phoneSync.progress', { done: progress.done, total: progress.total })}
              </Text>
            </Row>
          ) : settings.mode === 'auto' ? (
            <Button
              title={t('phoneSync.syncNow')}
              variant="secondary"
              icon={<RefreshCw size={16} color={colors.primary} />}
              onPress={() => void load().then(run).catch((e: unknown) => showAlert(t('phoneSync.failedTitle'), e instanceof Error ? e.message : ''))}
            />
          ) : settings.mode === 'manual' ? (
            <Button title={t('phoneSync.choose')} icon={<UserPlus size={16} color="#fff" />} onPress={() => void openPicker('sync')} />
          ) : null}
        </Card>

        <Card style={{ gap: 10 }}>
          <Row gap={8}>
            <Ban size={18} color={colors.danger} />
            <Text variant="h3" style={{ flex: 1 }}>
              {t('phoneSync.blockedTitle', { count: settings.blocked.length })}
            </Text>
          </Row>
          <Text variant="caption" tone="muted">
            {t('phoneSync.blockedHint')}
          </Text>
          {settings.blocked.map((b) => (
            <Row key={b.id} gap={10}>
              <BookUser size={16} color={colors.textMuted} />
              <Text style={{ flex: 1 }} numberOfLines={1}>
                {b.name}
              </Text>
              <Pressable onPress={() => setSettings(unblockContacts(acct, [b.id]))} hitSlop={10} accessibilityLabel={t('phoneSync.unblock')}>
                <X size={16} color={colors.textMuted} />
              </Pressable>
            </Row>
          ))}
          <Button title={t('phoneSync.addBlocked')} variant="secondary" icon={<Ban size={16} color={colors.primary} />} onPress={() => void openPicker('block')} />
        </Card>
      </View>

      {picker && contacts ? (
        <PhoneContactPicker
          mode={picker}
          contacts={contacts}
          blocked={settings.blocked}
          synced={syncedNumbers(acct)}
          onClose={() => setPicker(null)}
          onDone={(picked) => {
            setPicker(null);
            if (picker === 'block') setSettings(blockContacts(acct, picked));
            else void run(picked);
          }}
        />
      ) : null}
    </Screen>
  );
}

/** A fresh screen per account: each has its own settings. */
function PhoneContactsForAccount() {
  const acct = useAccountsStore((s) => s.activeId) ?? '';
  return <PhoneContactsScreen key={acct} />;
}

/** Only on phones, and only for a role that can add contacts. */
export default function PhoneContactsGate() {
  const { t } = useTranslation();
  if (Platform.OS === 'web')
    return (
      <Screen title={t('phoneSync.title')} back>
        <Text tone="muted">{t('phoneSync.phoneOnly')}</Text>
      </Screen>
    );
  return (
    <RequireCan any={[P.contacts.create]}>
      <PhoneContactsForAccount />
    </RequireCan>
  );
}

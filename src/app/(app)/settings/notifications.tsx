import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Bell, CircleCheck, Smartphone } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { Linking, Platform, View } from 'react-native';

import { Button, Card, Row, Screen, Text } from '@/components/ui';
import { crm, describeCrmError } from '@/services/crm/client';
import { showAlert } from '@/lib/dialog';
import { ensureNotificationPermission, hasNotificationPermission, registerPushDevice } from '@/services/notifications';
import { useTheme } from '@/theme/ThemeProvider';

export default function NotificationsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [granted, setGranted] = useState<boolean | null>(null);
  const [registering, setRegistering] = useState(false);
  const [registered, setRegistered] = useState(false);
  const devices = useQuery({
    queryKey: ['devices'],
    queryFn: () => crm().notifications.devices({ rows: 20 }),
    retry: false,
  });

  /** Asks, and registers this device for push straight away; once the system won't ask again, opens Settings. */
  const allow = async () => {
    const ok = await ensureNotificationPermission();
    setGranted(ok);
    if (ok) {
      await registerPushDevice({ ask: false });
      void devices.refetch();
      return;
    }
    if (Platform.OS !== 'web') {
      const perm = await Notifications.getPermissionsAsync().catch(() => null);
      if (perm && !perm.canAskAgain) void Linking.openSettings();
    }
  };

  /** Registers for push and says how it went (it used to fail silently, so the button seemed dead). */
  const register = async () => {
    setRegistering(true);
    try {
      const res = await registerPushDevice({ ask: true });
      setGranted(await hasNotificationPermission().catch(() => false));
      if (res.ok) {
        setRegistered(true);
        void devices.refetch();
        showAlert(t('notif.registered'), t('notif.registeredBody'));
      } else if (res.reason === 'permission') showAlert(t('notif.failed'), t('notif.needPermission'));
      else if (res.reason === 'token') showAlert(t('notif.failed'), t('notif.noToken'));
      else showAlert(t('notif.failed'), describeCrmError(res.error));
    } finally {
      setRegistering(false);
    }
  };

  useEffect(() => {
    hasNotificationPermission()
      .then(setGranted)
      .catch(() => setGranted(false));
  }, []);

  return (
    <Screen title={t('settings.notifications')} back scroll>
      <View style={{ gap: 14, marginTop: 8 }}>
        <Card style={{ gap: 8 }}>
          <Row gap={8}>
            <Bell size={18} color={colors.warning} />
            <Text variant="h3">{t('notif.permission')}</Text>
          </Row>
          <Text variant="caption" tone="muted">
            {granted ? t('notif.enabled') : t('notif.allowBody')}
          </Text>
          {!granted ? <Button title={t('notif.allow')} onPress={() => void allow()} /> : null}
        </Card>
        <Card style={{ gap: 8 }}>
          <Row gap={8}>
            <Smartphone size={18} color={colors.primary} />
            <Text variant="h3">{t('notif.newMessages')}</Text>
          </Row>
          <Text variant="caption" tone="muted">
            {t('notif.newMessagesBody')}
          </Text>
          {devices.isError ? (
            <Text variant="caption" tone="warning">
              {t('notif.notConfigured')}
            </Text>
          ) : (
            (devices.data?.data ?? []).map((d) => (
              <Text key={d.id} variant="caption">
                {d.label || t('notif.thisDevice')} · {d.platform} · {t('notif.seen', { date: new Date(d.lastSeenAt).toLocaleDateString() })}
              </Text>
            ))
          )}
          {registered ? (
            <Row gap={6}>
              <CircleCheck size={16} color={colors.success} />
              <Text variant="caption" tone="success">
                {t('notif.registered')}
              </Text>
            </Row>
          ) : null}
          <Button
            title={registered ? t('notif.registerAgain') : t('notif.register')}
            variant="secondary"
            loading={registering}
            onPress={() => void register()}
          />
        </Card>
      </View>
    </Screen>
  );
}

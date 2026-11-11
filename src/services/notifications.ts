/**
 * Notification setup + push registration with the CPaaS
 * notifications resource. The FCM token comes from services/pushToken, one file
 * per platform; when it can't be had (no Firebase config, no VAPID key on web)
 * registration is skipped quietly.
 */
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

import { crm, crmFor } from '@/services/crm/client';
import { useInboxStore } from '@/services/inbox/store';
import { getPushToken } from '@/services/pushToken';

export const MESSAGE_CHANNEL = 'messages';

let configured = false;

export const configureNotifications = async () => {
  if (configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async (n) => {
      // While the app is open and a live inbox is connected, the socket already alerts for each
      // message (and stays quiet for the chat on screen): a server push for it would be a duplicate.
      const remote = (n.request.trigger as { type?: string } | null)?.type === 'push';
      const live = Object.values(useInboxStore.getState().byAccount).some((a) => a.state === 'connected');
      const show = !(remote && live);
      return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: false };
    },
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(MESSAGE_CHANNEL, {
      name: 'WhatsApp messages',
      importance: AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#4F3FE0',
    });
  }
};

export const hasNotificationPermission = async (): Promise<boolean> => {
  if (Platform.OS === 'web') return typeof Notification !== 'undefined' && Notification.permission === 'granted';
  return (await Notifications.getPermissionsAsync()).granted;
};

export const ensureNotificationPermission = async (): Promise<boolean> => {
  // expo-notifications has no permissions module on web.
  if (Platform.OS === 'web') {
    if (typeof Notification === 'undefined') return false;
    if (Notification.permission === 'default') await Notification.requestPermission();
    return Notification.permission === 'granted';
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const res = await Notifications.requestPermissionsAsync();
  return res.granted;
};

/** How a push registration went, so the Notifications screen can say so. */
export type PushRegistration = { ok: true } | { ok: false; reason: 'permission' | 'token' | 'error'; error?: unknown };

/**
 * Registers this device for CPaaS push (inbox messages). Never throws: the app start
 * calls it fire-and-forget, the Notifications screen shows the outcome. On web the
 * browser prompt is only shown when `ask` is set (from a button press): Safari
 * ignores prompts that don't come from a user gesture.
 */
export const registerPushDevice = async ({ ask = Platform.OS !== 'web' } = {}): Promise<PushRegistration> => {
  try {
    if (ask ? !(await ensureNotificationPermission()) : !(await hasNotificationPermission())) return { ok: false, reason: 'permission' };
    // No Firebase config (or a simulator) gives no token.
    const token = await getPushToken().catch(() => null);
    if (!token || token.length < 20) return { ok: false, reason: 'token' };
    await crm().notifications.subscribe({
      token,
      platform: Platform.OS === 'web' ? 'web' : Platform.OS === 'ios' ? 'ios' : 'android',
      device_label: `Inbox And Campaigns on ${Platform.OS}`,
    });
    return { ok: true };
  } catch (error) {
    // Push not enabled on the account, or offline.
    return { ok: false, reason: 'error', error };
  }
};

/**
 * Stops push for one account on this device (on sign-out), so a signed-out phone
 * no longer gets that workspace's messages. Best effort, and never holds up
 * sign-out for more than a few seconds.
 */
export const unregisterPushDevice = async (accountId: string): Promise<void> => {
  const work = (async () => {
    if (!(await hasNotificationPermission())) return;
    const token = await getPushToken();
    if (token) await crmFor(accountId).notifications.unsubscribe(token);
  })().catch(() => undefined);
  await Promise.race([work, new Promise((r) => setTimeout(r, 5000))]);
};

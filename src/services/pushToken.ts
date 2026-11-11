/**
 * The FCM registration token the CPaaS sends push through. On Android
 * expo-notifications' device token already is one. iOS and web have their own
 * files: iOS gives an APNs token here, which FCM does not accept.
 */
import * as Notifications from 'expo-notifications';

export const getPushToken = async (): Promise<string | null> => {
  const token = await Notifications.getDevicePushTokenAsync();
  return typeof token.data === 'string' ? token.data : null;
};

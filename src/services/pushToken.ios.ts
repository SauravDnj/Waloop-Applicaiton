/**
 * iOS: React Native Firebase registers with APNs and swaps that token for an
 * FCM one. Notification permission is still asked through expo-notifications.
 */
import { getMessaging, getToken } from '@react-native-firebase/messaging';

export const getPushToken = async (): Promise<string | null> => getToken(getMessaging());

/**
 * Web: Firebase Messaging token for this browser. Needs notification permission
 * already granted (asked from a user gesture, see ensureNotificationPermission)
 * and EXPO_PUBLIC_FIREBASE_VAPID_KEY. Background messages are shown by
 * public/firebase-messaging-sw.js; while the tab is open we show them here.
 */
import { router } from 'expo-router';
import { getApps, initializeApp } from 'firebase/app';
import { getMessaging, getToken, isSupported, onMessage, type Messaging } from 'firebase/messaging';

import { env } from '@/config/env';
import { firebaseWebConfig } from '@/config/firebase';

let listening = false;

const showForeground = (messaging: Messaging) => {
  if (listening) return;
  listening = true;
  onMessage(messaging, (payload) => {
    const title = payload.notification?.title;
    if (!title) return;
    const chat = payload.data?.chat;
    const n = new Notification(title, { body: payload.notification?.body, icon: '/icon-192.png', tag: chat });
    n.onclick = () => {
      window.focus();
      if (chat) router.push(`/chat/${chat}`);
      n.close();
    };
  });
};

export const getPushToken = async (): Promise<string | null> => {
  if (!env.firebaseVapidKey || !('Notification' in window) || Notification.permission !== 'granted') return null;
  if (!(await isSupported())) return null;
  const app = getApps()[0] ?? initializeApp(firebaseWebConfig);
  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  const messaging = getMessaging(app);
  showForeground(messaging);
  return getToken(messaging, { vapidKey: env.firebaseVapidKey, serviceWorkerRegistration: registration });
};

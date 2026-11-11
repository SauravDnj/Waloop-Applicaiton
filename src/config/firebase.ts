/**
 * Firebase web app config. These are public identifiers (the same ones shipped
 * in google-services.json / GoogleService-Info.plist), not secrets. Keep in
 * sync with public/firebase-messaging-sw.js, which can't import this file.
 */
export const firebaseWebConfig = {
  apiKey: 'AIzaSyDibLRBg4CRgwc3cCIDDGcZdBAur-Vek8U',
  authDomain: 'inbox-campaign-app.firebaseapp.com',
  projectId: 'inbox-campaign-app',
  storageBucket: 'inbox-campaign-app.firebasestorage.app',
  messagingSenderId: '266799455756',
  appId: '1:266799455756:web:2a33e76a08b46c6e31d829',
} as const;

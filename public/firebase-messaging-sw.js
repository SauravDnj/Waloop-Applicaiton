/* Firebase Messaging service worker: shows push notifications while the web app
 * is closed or in a background tab. Clicks open webpush.fcmOptions.link, which
 * the CPaaS sets. Config mirrors src/config/firebase.ts; keep the SDK version in
 * step with the `firebase` package. */
importScripts('https://www.gstatic.com/firebasejs/13.1.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/13.1.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDibLRBg4CRgwc3cCIDDGcZdBAur-Vek8U',
  authDomain: 'inbox-campaign-app.firebaseapp.com',
  projectId: 'inbox-campaign-app',
  storageBucket: 'inbox-campaign-app.firebasestorage.app',
  messagingSenderId: '266799455756',
  appId: '1:266799455756:web:2a33e76a08b46c6e31d829',
});

firebase.messaging();

/**
 * Runtime configuration. Every value comes from `EXPO_PUBLIC_*` variables in
 * `.env` (see `.env.example`), which Expo inlines at bundle time.
 *
 * Each variable is accessed statically (`process.env.EXPO_PUBLIC_X`) on
 * purpose: Expo's bundler replaces only literal member accesses, so a dynamic
 * `process.env[key]` would be empty in a real build.
 *
 * `missingEnv()` is checked once at startup so a misconfigured build fails
 * loudly on the first screen rather than with a confusing network error later.
 */
const clean = (value: string | undefined): string => (typeof value === 'string' && value.trim() ? value.trim().replace(/\/+$/, '') : '');

const raw = {
  EXPO_PUBLIC_SSO_URL: clean(process.env.EXPO_PUBLIC_SSO_URL),
  EXPO_PUBLIC_SSO_PROJECT_ID: clean(process.env.EXPO_PUBLIC_SSO_PROJECT_ID),
  EXPO_PUBLIC_CPASS_BASE_URL: clean(process.env.EXPO_PUBLIC_CPASS_BASE_URL),
  EXPO_PUBLIC_SDK_CLIENT_ID: clean(process.env.EXPO_PUBLIC_SDK_CLIENT_ID),
  EXPO_PUBLIC_ACCESS_ID: clean(process.env.EXPO_PUBLIC_ACCESS_ID),
  EXPO_PUBLIC_APP_ORIGIN: clean(process.env.EXPO_PUBLIC_APP_ORIGIN),
  EXPO_PUBLIC_INBOX_URL: clean(process.env.EXPO_PUBLIC_INBOX_URL),
  EXPO_PUBLIC_FIREBASE_VAPID_KEY: clean(process.env.EXPO_PUBLIC_FIREBASE_VAPID_KEY),
} as const;

// The project id is the user's "Access ID", chosen per account at sign-in
// (see services/accessId). One id serves both SDKs. A value here is only a
// default that pre-fills the Access ID screen; it may be left empty.
const projectId = raw.EXPO_PUBLIC_SDK_CLIENT_ID || raw.EXPO_PUBLIC_SSO_PROJECT_ID;

export const env = {
  /**
   * A fixed Access ID: the app serves this one workspace project only. Every account signs
   * in with it, and the Access ID screen never shows. Empty: users choose one per account.
   */
  fixedAccessId: raw.EXPO_PUBLIC_ACCESS_ID,
  ssoUrl: raw.EXPO_PUBLIC_SSO_URL,
  ssoProjectId: projectId,
  cpassBaseUrl: raw.EXPO_PUBLIC_CPASS_BASE_URL,
  clientId: projectId,
  appOrigin: raw.EXPO_PUBLIC_APP_ORIGIN,
  inboxUrl: raw.EXPO_PUBLIC_INBOX_URL,
  /** Web push only (Firebase Console > Cloud Messaging > Web Push certificates). */
  firebaseVapidKey: raw.EXPO_PUBLIC_FIREBASE_VAPID_KEY,
  /** Recorded on SSO sessions as the `client` of select-account. */
  ssoClientLabel: 'inbox-campaigns-app',
} as const;

export type MissingEnv = { key: keyof typeof raw; label: string };

/** Names every required variable that is empty or still a placeholder. */
export const missingEnv = (): MissingEnv[] => {
  const required: MissingEnv[] = [
    { key: 'EXPO_PUBLIC_SSO_URL', label: 'SSO URL' },
    { key: 'EXPO_PUBLIC_CPASS_BASE_URL', label: 'CPaaS base URL' },
    // The app is built around the live WhatsApp inbox.
    { key: 'EXPO_PUBLIC_INBOX_URL', label: 'Inbox socket URL' },
  ];
  const placeholder = /example\.com|your-project-id|tpc_x{4,}/i;
  return required.filter(({ key }) => {
    const value = raw[key];
    return !value || placeholder.test(value);
  });
};

/**
 * Links opened from outside the app. An Access ID QR scanned with the phone's
 * own camera (`inboxcampaign://access/<id>`) goes to the Access ID screen with
 * the id filled in. Something shared into the app from another app arrives as
 * `inboxcampaign://expo-sharing` and opens the share screen. Everything else is
 * routed as usual. (Old `crmdialer://` codes only work through the in-app scanner.)
 */
import { env } from '@/config/env';

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    if (/^(?:[a-z][\w+.-]*:\/\/)?\/?expo-sharing(?:[/?#]|$)/i.test(path)) return '/share';
    const m = path.match(/(?:^|\/)access\/([^/?#]+)/);
    // A build for one Access ID ignores the code's id: it just opens sign-in.
    if (m) return env.fixedAccessId ? '/login' : `/access?id=${encodeURIComponent(decodeURIComponent(m[1]))}`;
    return path;
  } catch {
    return path;
  }
}

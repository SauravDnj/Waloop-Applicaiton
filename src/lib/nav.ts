/**
 * Back navigation that never dead-ends. After a page refresh, a deep link or
 * a widget tap there may be no history, so `router.back()` does nothing; we
 * then go to a sensible screen instead (the app home by default).
 */
import { router, type Href } from 'expo-router';

/** Where a signed-in user lands: the WhatsApp inbox. */
export const HOME: Href = '/(app)/(tabs)/inbox';

export const goBack = (fallback: Href = HOME) => {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
};

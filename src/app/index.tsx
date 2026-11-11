import { Redirect } from 'expo-router';

import { HOME } from '@/lib/authGuard';

/** A direct hit on `/`: go home; the (app) layout sends signed-out users to sign in. */
export default function Index() {
  return <Redirect href={HOME} />;
}

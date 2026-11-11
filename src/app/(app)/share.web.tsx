/** Web: nothing is shared into a browser tab, so this goes to the inbox. */
import { Redirect } from 'expo-router';

export default function ShareScreen() {
  return <Redirect href="/(app)/(tabs)/inbox" />;
}

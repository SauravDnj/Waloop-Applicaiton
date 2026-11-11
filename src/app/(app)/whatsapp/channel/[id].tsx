/** Old address of a WhatsApp channel's page; channels now live under /channels. */
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function OldChannelRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={{ pathname: '/(app)/channels/[id]', params: { id } }} />;
}

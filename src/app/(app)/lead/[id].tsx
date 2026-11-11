/** A contact, full screen (phones; desktop web opens it in the side panel instead). */
import { useLocalSearchParams } from 'expo-router';

import { LeadView } from '@/components/leads/LeadView';

export default function LeadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <LeadView id={id} />;
}

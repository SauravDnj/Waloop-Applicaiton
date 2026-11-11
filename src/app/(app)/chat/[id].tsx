/** A conversation, full screen (desktop web shows it beside the Inbox list instead). */
import { useLocalSearchParams } from 'expo-router';

import { ChatView } from '@/components/inbox/ChatView';

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ChatView id={id} />;
}

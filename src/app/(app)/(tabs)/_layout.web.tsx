/** Web: the sections as plain tabs; the shell around them lives in the app layout. */
import { Tabs } from 'expo-router';

export default function TabsLayoutWeb() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}>
      <Tabs.Screen name="inbox" />
      <Tabs.Screen name="contacts" />
      <Tabs.Screen name="board" />
      <Tabs.Screen name="more" />
    </Tabs>
  );
}

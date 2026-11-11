import { Tabs } from 'expo-router';

import { useTheme } from '@/theme/ThemeProvider';

export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
      }}
      // The bar is drawn once by the app layout so it shows on every screen.
      tabBar={() => null}
    >
      <Tabs.Screen name="inbox" />
      <Tabs.Screen name="contacts" />
      <Tabs.Screen name="board" />
      <Tabs.Screen name="more" />
    </Tabs>
  );
}

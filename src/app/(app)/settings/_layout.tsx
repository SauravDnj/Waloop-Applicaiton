/**
 * Settings pages. Desktop web: the settings menu on the left and the page on
 * the right; a page the menu lists needs no back button there. Phones: a plain
 * stack, reached from the More page.
 */
import { Slot, Stack, usePathname } from 'expo-router';
import { View } from 'react-native';

import { SettingsNav, useSettingsNav } from '@/components/navigation/SettingsNav';
import { HideBackContext } from '@/components/ui/Screen';
import { useDesktop } from '@/hooks/useDesktop';
import { useTheme } from '@/theme/ThemeProvider';

export default function SettingsLayout() {
  const { colors } = useTheme();
  const desktop = useDesktop();
  const pathname = usePathname();
  const listed = useSettingsNav().some((g) => g.items.some((i) => i.path === pathname));

  if (!desktop) return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />;
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.background }}>
      <SettingsNav />
      <View style={{ flex: 1 }}>
        <HideBackContext.Provider value={listed}>
          <Slot />
        </HideBackContext.Provider>
      </View>
    </View>
  );
}

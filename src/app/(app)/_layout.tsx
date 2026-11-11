import { Redirect, Stack } from 'expo-router';
import { useAccountFromLink, useAppGuard, useEndAddingOutsideAuth } from '@/lib/authGuard';
import { useDefaultChannelSync } from '@/hooks/queries';
import { usePhoneContactsSync } from '@/hooks/usePhoneContactsSync';
import { View } from 'react-native';

import { AppLockGate } from '@/components/accounts/AppLock';
import { FloatingTabBar } from '@/components/navigation/FloatingTabBar';
import { useTheme } from '@/theme/ThemeProvider';

/** Every signed-in screen, with the bottom bar drawn over all of them. */
export default function AppLayout() {
  const { colors } = useTheme();
  const guard = useAppGuard();
  useEndAddingOutsideAuth();
  useDefaultChannelSync();
  useAccountFromLink();
  usePhoneContactsSync();
  if (guard.redirect) return <Redirect href={guard.redirect} />;
  if (!guard.ready) return null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* A locked account's screens aren't rendered at all: only its PIN screen. */}
      <AppLockGate>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="(tabs)" />
        </Stack>
        <FloatingTabBar />
      </AppLockGate>
    </View>
  );
}

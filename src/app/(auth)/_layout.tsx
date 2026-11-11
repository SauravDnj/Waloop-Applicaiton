import { Redirect, Stack } from 'expo-router';

import { useAuthGuard } from '@/lib/authGuard';
import { useTheme } from '@/theme/ThemeProvider';

export default function AuthLayout() {
  const { colors } = useTheme();
  const home = useAuthGuard();
  if (home) return <Redirect href={home} />;
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'fade_from_bottom',
      }}
    />
  );
}

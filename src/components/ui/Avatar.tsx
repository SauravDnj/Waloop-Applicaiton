import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { avatarColors } from '@/theme/tokens';
import { Text } from './Text';

type Props = { name: string; uri?: string; size?: number; ring?: string };

export function Avatar({ name, uri, size = 44, ring }: Props) {
  const { scheme } = useTheme();
  const initials =
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join('') || '#';
  const { bg, fg } = avatarColors(name || '?', scheme);
  const inner = uri ? (
    <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" transition={150} />
  ) : (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
        },
      ]}
    >
      <Text style={{ color: fg, fontSize: size * 0.38, fontWeight: '700' }}>{initials}</Text>
    </View>
  );
  if (!ring) return inner;
  return (
    <View
      style={{
        padding: 2,
        borderRadius: size,
        borderWidth: 2,
        borderColor: ring,
      }}
    >
      {inner}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
});

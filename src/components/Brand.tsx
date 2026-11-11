import { View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';

export const APP_NAME = 'Inbox And Campaigns';

/** The app mark: a chat bubble (inbox) with a megaphone badge (campaigns), on the brand gradient. */
export function BrandMark({ size = 64 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <Defs>
        <LinearGradient id="bm-g" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#6D5BFF" />
          <Stop offset="1" stopColor="#2E1FB8" />
        </LinearGradient>
        <LinearGradient id="bm-b" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#22D3A6" />
          <Stop offset="1" stopColor="#0EA371" />
        </LinearGradient>
      </Defs>
      <Rect width="1024" height="1024" rx="232" fill="url(#bm-g)" />
      <Path fill="#FFFFFF" d="M300 230h360a120 120 0 0 1 120 120v200a120 120 0 0 1-120 120H430l-130 104v-104a120 120 0 0 1-120-120V350a120 120 0 0 1 120-120z" />
      <Rect x="292" y="362" width="376" height="46" rx="23" fill="#4F3FE0" />
      <Rect x="292" y="446" width="250" height="46" rx="23" fill="#4F3FE0" opacity={0.55} />
      <Circle cx="742" cy="742" r="196" fill="url(#bm-b)" stroke="#FFFFFF" strokeWidth={28} />
      <Rect x="640" y="704" width="56" height="78" rx="18" fill="#FFFFFF" />
      <Path d="M690 704L808 650c12-5 22 2 22 15v156c0 13-10 20-22 15L690 782z" fill="#FFFFFF" />
      <Rect x="664" y="770" width="40" height="84" rx="18" fill="#FFFFFF" />
      <Path d="M856 708a46 46 0 0 1 0 72" fill="none" stroke="#FFFFFF" strokeWidth={20} strokeLinecap="round" />
    </Svg>
  );
}

/** Mark + wordmark. `light` forces white text (for use on the gradient). */
export function BrandLogo({ height = 44, light = false }: { height?: number; light?: boolean }) {
  const { colors } = useTheme();
  const color = light ? '#FFFFFF' : colors.text;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: height * 0.28 }}>
      <BrandMark size={height} />
      <View>
        <Text
          style={{
            color,
            fontSize: height * 0.5,
            lineHeight: height * 0.58,
            fontWeight: '800',
            letterSpacing: -0.5,
          }}
        >
          Inbox{' '}
          <Text
            style={{
              color: light ? '#C7C2FF' : colors.primary,
              fontSize: height * 0.5,
              fontWeight: '800',
            }}
          >
            & Campaigns
          </Text>
        </Text>
        <Text
          style={{
            color: light ? 'rgba(255,255,255,0.7)' : colors.textMuted,
            fontSize: height * 0.22,
            fontWeight: '600',
            letterSpacing: height * 0.04,
          }}
        >
          WHATSAPP · CONTACTS · CAMPAIGNS
        </Text>
      </View>
    </View>
  );
}

/** Compact header lockup used inside the app. */
export function AppTitle({ subtitle }: { subtitle?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <BrandMark size={34} />
      <View>
        <Text variant="h2">{APP_NAME}</Text>
        {subtitle ? (
          <Text variant="micro" tone="faint">
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

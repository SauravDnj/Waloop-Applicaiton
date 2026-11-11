/**
 * Design tokens. One source of truth for colour, spacing, radius and type so
 * every screen reads as one product. Semantic names only: components never
 * reach for a raw hex.
 */

export const palette = {
  blue50: '#EEEEFA',
  blue100: '#DCDAF5',
  blue200: '#B9B5EC',
  blue400: '#8B83FF',
  blue500: '#5B4CF0',
  blue600: '#4F3FE0',
  blue700: '#2E1FB8',
  blue900: '#0F0B3A',
  green50: '#E9F9F0',
  green500: '#16A34A',
  green600: '#15803D',
  amber50: '#FFF6E5',
  amber500: '#F59E0B',
  amber600: '#D97706',
  red50: '#FEECEC',
  red500: '#EF4444',
  red600: '#DC2626',
  violet50: '#F1EDFF',
  violet500: '#7C3AED',
  teal500: '#0D9488',
  pink500: '#DB2777',
  gray0: '#FFFFFF',
  gray50: '#F4F5FA',
  gray100: '#EEF1F7',
  gray200: '#E1E6EF',
  gray300: '#C9D1DF',
  gray400: '#9AA5B8',
  gray500: '#6B7790',
  gray600: '#4B5569',
  gray700: '#323B4D',
  gray800: '#1F2634',
  gray900: '#121826',
  gray950: '#0B0F18',
} as const;

export type ColorScheme = 'light' | 'dark';

export const buildColors = (scheme: ColorScheme) => {
  const dark = scheme === 'dark';
  return {
    scheme,
    /** App canvas: a quiet neutral, never pure white. */
    background: dark ? '#09090B' : '#F6F6F8',
    /** Cards, sheets, inputs. */
    surface: dark ? '#131316' : '#FFFFFF',
    /** Inset fill: inputs, chips, secondary buttons. */
    surfaceAlt: dark ? '#1C1C21' : '#F1F1F4',
    /** Pressed / hover fill. */
    surfacePressed: dark ? '#26262C' : '#E8E8EC',
    border: dark ? '#232329' : '#E7E7EC',
    borderStrong: dark ? '#36363E' : '#D4D4DB',
    text: dark ? '#F4F4F5' : '#0E0E11',
    textMuted: dark ? '#A1A1AA' : '#5F5F6B',
    textFaint: dark ? '#71717A' : '#9A9AA6',
    primary: dark ? '#818CF8' : '#4F46E5',
    primaryStrong: dark ? '#6366F1' : '#4338CA',
    primarySoft: dark ? '#1E1B3F' : '#EEF0FF',
    onPrimary: '#FFFFFF',
    success: dark ? '#34D399' : '#059669',
    successSoft: dark ? '#0D2A20' : '#E8F7F0',
    warning: dark ? '#FBBF24' : '#D97706',
    warningSoft: dark ? '#2E2208' : '#FEF5E6',
    danger: dark ? '#F87171' : '#DC2626',
    dangerSoft: dark ? '#331414' : '#FDEDED',
    accent: dark ? '#C084FC' : '#9333EA',
    accentSoft: dark ? '#26163A' : '#F5EDFE',
    whatsapp: '#25D366',
    whatsappSoft: dark ? '#0D2A20' : '#E8F8EE',
    sms: dark ? '#2DD4BF' : '#0D9488',
    smsSoft: dark ? '#0E2B29' : '#E6F6F4',
    overlay: dark ? 'rgba(0,0,0,0.6)' : 'rgba(10,10,15,0.45)',
    skeleton: dark ? '#1C1C21' : '#EDEDF1',
    tabBar: dark ? '#131316' : '#FFFFFF',
    /** Header: deep ink with a hint of indigo. Calm, professional, high contrast. */
    heroFrom: dark ? '#0B0B12' : '#0F0F1A',
    heroTo: dark ? '#1A1838' : '#211E4A',
    onHero: '#FFFFFF',
    onHeroMuted: 'rgba(255,255,255,0.64)',
    heroGlass: 'rgba(255,255,255,0.10)',
  } as const;
};

type RawColors = ReturnType<typeof buildColors>;
/** Colour roles; values are plain strings so an account theme can replace them. */
export type Colors = { [K in keyof RawColors]: K extends 'scheme' ? ColorScheme : string };

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

export const radius = {
  xs: 6,
  sm: 10,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

/**
 * Inter, loaded in the root layout. Android picks the face by family name, not
 * by `fontWeight`, so `Text` maps each weight to its family.
 */
export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
} as const;

export const fontForWeight = (w?: string | number): string => {
  const n = typeof w === 'number' ? w : w === 'bold' ? 700 : w === 'normal' || !w ? 400 : Number(w) || 400;
  return n >= 800 ? fonts.extrabold : n >= 700 ? fonts.bold : n >= 600 ? fonts.semibold : n >= 500 ? fonts.medium : fonts.regular;
};

export const typography = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: '700' as const, letterSpacing: -0.9 },
  h1: { fontSize: 26, lineHeight: 32, fontWeight: '700' as const, letterSpacing: -0.6 },
  h2: { fontSize: 19, lineHeight: 25, fontWeight: '600' as const, letterSpacing: -0.3 },
  h3: { fontSize: 16, lineHeight: 22, fontWeight: '600' as const, letterSpacing: -0.15 },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' as const, letterSpacing: -0.1 },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '500' as const, letterSpacing: -0.1 },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  micro: { fontSize: 11, lineHeight: 14, fontWeight: '600' as const, letterSpacing: 0.4 },
  mono: { fontSize: 15, lineHeight: 20, fontWeight: '500' as const, fontVariant: ['tabular-nums'] as const },
} as const;

export const shadow = {
  card: {
    shadowColor: '#0A0A14',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  floating: {
    shadowColor: '#0A0A14',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
} as const;

/** Stable colour for an avatar / tag from any string. */
export const hashHue = (seed: string): number => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
};

export const avatarColors = (seed: string, scheme: ColorScheme) => {
  const hue = hashHue(seed);
  return scheme === 'dark' ? { bg: `hsl(${hue} 30% 20%)`, fg: `hsl(${hue} 70% 78%)` } : { bg: `hsl(${hue} 60% 94%)`, fg: `hsl(${hue} 45% 36%)` };
};

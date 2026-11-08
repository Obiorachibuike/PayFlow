/**
 * PayFlow brand palette.
 *
 * Primary green  #39FF14   – actions, accents, focus
 * Dark canvas    #080B09   – dark-mode background
 * Dark surface   #111713   – dark-mode cards
 * Light canvas   #F7F9F7   – light-mode background
 * Light surface  #FFFFFF   – light-mode cards
 * Text           #101510   – primary text
 * Muted          #818B83   – secondary text
 *
 * No purple, violet or lavender appears anywhere in this file or the app.
 */
export const palette = {
  primary: '#39FF14',
  primaryDark: '#2BD10C',
  primarySoft: '#12331A',
  backgroundDark: '#080B09',
  surfaceDark: '#111713',
  surfaceDarkAlt: '#18201A',
  backgroundLight: '#F7F9F7',
  surfaceLight: '#FFFFFF',
  surfaceLightAlt: '#EEF2EE',
  text: '#101510',
  textLight: '#F7F9F7',
  muted: '#818B83',
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
  border: '#222C24',
  borderLight: '#E3E9E3',
  overlay: 'rgba(8, 11, 9, 0.72)',
} as const;

export type ThemeMode = 'light' | 'dark';

export interface ThemeColors {
  mode: ThemeMode;
  background: string;
  backgroundAlt: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  textInverse: string;
  primary: string;
  primaryContrast: string;
  primarySoft: string;
  success: string;
  warning: string;
  error: string;
  overlay: string;
  cardShadow: string;
  isDark: boolean;
}

export function createColors(mode: ThemeMode): ThemeColors {
  const dark = mode === 'dark';
  return {
    mode,
    background: dark ? palette.backgroundDark : palette.backgroundLight,
    backgroundAlt: dark ? palette.surfaceDarkAlt : palette.surfaceLightAlt,
    surface: dark ? palette.surfaceDark : palette.surfaceLight,
    surfaceAlt: dark ? palette.surfaceDarkAlt : palette.surfaceLightAlt,
    border: dark ? palette.border : palette.borderLight,
    text: dark ? palette.textLight : palette.text,
    textMuted: palette.muted,
    textInverse: dark ? palette.text : palette.textLight,
    primary: palette.primary,
    primaryContrast: palette.text,
    primarySoft: dark ? '#12331A' : '#E8FBE3',
    success: palette.success,
    warning: palette.warning,
    error: palette.error,
    overlay: palette.overlay,
    cardShadow: dark ? '#000000' : '#101510',
    isDark: dark,
  };
}

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 34, lineHeight: 41, fontWeight: '800' as const, letterSpacing: -0.5 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700' as const },
  subtitle: { fontSize: 18, lineHeight: 24, fontWeight: '600' as const },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' as const },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  micro: { fontSize: 11, lineHeight: 15, fontWeight: '600' as const, letterSpacing: 0.6 },
  amount: { fontSize: 40, lineHeight: 46, fontWeight: '800' as const, letterSpacing: -1 },
} as const;

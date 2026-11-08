import type { TextStyle, ViewStyle } from 'react-native';
import { createColors, palette, radius, spacing, typography, type ThemeColors, type ThemeMode } from './colors';

export * from './colors';

export interface Theme {
  mode: ThemeMode;
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  styles: {
    screen: ViewStyle;
    card: ViewStyle;
    row: ViewStyle;
    divider: ViewStyle;
    heading: TextStyle;
    body: TextStyle;
    caption: TextStyle;
  };
}

export function createTheme(mode: ThemeMode): Theme {
  const colors = createColors(mode);
  return {
    mode,
    colors,
    spacing,
    radius,
    typography,
    styles: {
      screen: { flex: 1, backgroundColor: colors.background },
      card: {
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.lg,
      },
      row: { flexDirection: 'row', alignItems: 'center' },
      divider: { height: 1, backgroundColor: colors.border },
      heading: { ...typography.title, color: colors.text },
      body: { ...typography.body, color: colors.text },
      caption: { ...typography.caption, color: colors.textMuted },
    },
  };
}

export const lightTheme = createTheme('light');
export const darkTheme = createTheme('dark');

export const brand = {
  name: 'PayFlow',
  tagline: 'Your money. Your control. Your flow.',
  currency: 'NGN',
  supportEmail: 'support@payflow.demo',
  accent: palette.primary,
} as const;

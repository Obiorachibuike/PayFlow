import { Appearance } from 'react-native';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setSystemTheme } from '../store/slices/settingsSlice';
import { createTheme, type Theme } from './index';
import type { ThemeMode } from './colors';
import { ReactNode, createContext, useContext, useEffect, useMemo } from 'react';

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const resolvedTheme = useAppSelector((state) => state.settings.resolvedTheme);
  const preference = useAppSelector((state) => state.settings.themePreference);

  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      dispatch(setSystemTheme(colorScheme === 'light' ? 'light' : 'dark'));
    });
    return () => subscription.remove();
  }, [dispatch]);

  const theme = useMemo(() => createTheme(resolvedTheme as ThemeMode), [resolvedTheme, preference]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used inside <ThemeProvider>');
  return theme;
}

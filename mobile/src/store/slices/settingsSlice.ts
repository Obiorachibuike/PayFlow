import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { ThemeMode } from '../../theme/colors';

export interface SettingsState {
  /** SYSTEM follows the OS; LIGHT/DARK are explicit user choices. */
  themePreference: 'SYSTEM' | 'LIGHT' | 'DARK';
  /** Resolved theme actually rendered (SYSTEM resolved at boot). */
  resolvedTheme: ThemeMode;
  biometricUnlockEnabled: boolean;
  hideBalances: boolean;
  hasAcknowledgedDemoNotice: boolean;
  quickAmountsMinor: number[];
}

const initialState: SettingsState = {
  themePreference: 'SYSTEM',
  resolvedTheme: 'dark',
  biometricUnlockEnabled: false,
  hideBalances: false,
  hasAcknowledgedDemoNotice: false,
  quickAmountsMinor: [1_000_00, 5_000_00, 10_000_00, 20_000_00],
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    setThemePreference(state, action: PayloadAction<'SYSTEM' | 'LIGHT' | 'DARK'>) {
      state.themePreference = action.payload;
      if (action.payload !== 'SYSTEM') {
        state.resolvedTheme = action.payload === 'LIGHT' ? 'light' : 'dark';
      }
    },
    setSystemTheme(state, action: PayloadAction<ThemeMode>) {
      if (state.themePreference === 'SYSTEM') state.resolvedTheme = action.payload;
    },
    setBiometricUnlock(state, action: PayloadAction<boolean>) {
      state.biometricUnlockEnabled = action.payload;
    },
    toggleHideBalances(state) {
      state.hideBalances = !state.hideBalances;
    },
    acknowledgeDemoNotice(state) {
      state.hasAcknowledgedDemoNotice = true;
    },
    hydrateSettings(state, action: PayloadAction<Partial<SettingsState>>) {
      return { ...state, ...action.payload };
    },
    resetSettings: () => initialState,
  },
});

export const {
  setThemePreference,
  setSystemTheme,
  setBiometricUnlock,
  toggleHideBalances,
  acknowledgeDemoNotice,
  hydrateSettings,
  resetSettings,
} = settingsSlice.actions;

export default settingsSlice.reducer;

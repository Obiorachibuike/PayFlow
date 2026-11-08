import type { ReactElement } from 'react';
import { render, type RenderOptions } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { createStore } from '../store';
import { ThemeProvider } from '../theme/ThemeProvider';

const initialWindowMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/**
 * Renders a screen the way the app does: Redux + safe area + theme.
 * RNTL's `render` is async, so every call must be awaited.
 */
export async function renderScreen(ui: ReactElement, options?: RenderOptions) {
  const store = createStore();
  const view = await render(
      <Provider store={store}>
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
          <ThemeProvider>{ui}</ThemeProvider>
        </SafeAreaProvider>
      </Provider>,
      options,
    );
  return { store, ...view };
}

export const navigationMock = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  reset: jest.fn(),
  setOptions: jest.fn(),
  dispatch: jest.fn(),
  isFocused: jest.fn(() => true),
  addListener: jest.fn(() => jest.fn()),
  getParent: jest.fn(),
};

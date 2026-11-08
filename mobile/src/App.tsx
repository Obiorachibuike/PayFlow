import { StatusBar, View } from 'react-native';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { store } from './store';
import { ThemeProvider } from './theme/ThemeProvider';
import { RootNavigator } from './navigation/RootNavigator';
import { useAppDispatch } from './store/hooks';
import { primeDeviceContext } from './services/device';
import { notificationsApi } from './services/api';
import { ApiError } from './services/client';
import { setSystemTheme } from './store/slices/settingsSlice';
import { hydrateSettings } from './store/slices/settingsSlice';
import { Appearance } from 'react-native';
import type { ThemeMode } from './theme/colors';
import { useEffect } from 'react';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function PushTokenRegistrar() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const permission = await Notifications.requestPermissionsAsync();
        if (cancelled || permission.status !== 'granted') return;
        const token = await Notifications.getExpoPushTokenAsync();
        if (cancelled) return;
        try {
          await notificationsApi.registerPushToken(token.data);
        } catch (error) {
          // Push registration is best-effort; the in-app feed still works.
          if (!(error instanceof ApiError)) throw error;
        }
      } catch {
        // Notifications are unavailable (simulator, web, no permission).
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  return null;
}

function AppBootstrap() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    // Resolve the SYSTEM theme once at boot and prime the device identifier.
    const scheme = Appearance.getColorScheme();
    dispatch(setSystemTheme(scheme === 'light' ? 'light' : ('dark' as ThemeMode)));
    dispatch(hydrateSettings({ resolvedTheme: scheme === 'light' ? 'light' : ('dark' as ThemeMode) }));
    void primeDeviceContext();
  }, [dispatch]);

  return null;
}

export default function App() {
  return (
    <Provider store={store}>
      <SafeAreaProvider>
        <ThemeProvider>
          <View style={{ flex: 1 }}>
            <StatusBar barStyle="light-content" />
            <AppBootstrap />
            <PushTokenRegistrar />
            <RootNavigator />
          </View>
        </ThemeProvider>
      </SafeAreaProvider>
    </Provider>
  );
}

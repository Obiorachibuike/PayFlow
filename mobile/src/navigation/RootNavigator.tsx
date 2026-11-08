import { NavigationContainer, type Theme as NavigationTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { hydrateSession } from '../store/slices/authSlice';
import { AuthNavigator } from './AuthNavigator';
import { MainNavigator } from './MainNavigator';
import { FundWalletScreen } from '../screens/wallet/FundWalletScreen';
import { SendMoneyScreen } from '../screens/wallet/SendMoneyScreen';
import { WithdrawScreen } from '../screens/wallet/WithdrawScreen';
import { AddBeneficiaryScreen } from '../screens/beneficiaries/AddBeneficiaryScreen';
import type { RootStackParamList } from './types';
import { useEffect } from 'react';

const RootStack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const status = useAppSelector((state) => state.auth.status);
  const hasTokens = Boolean(useAppSelector((state) => state.auth.tokens?.accessToken));

  useEffect(() => {
    void dispatch(hydrateSession());
  }, [dispatch]);

  const navigationTheme: NavigationTheme = {
    dark: theme.colors.isDark,
    colors: {
      primary: theme.colors.primary,
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.text,
      border: theme.colors.border,
      notification: theme.colors.warning,
    },
    fonts: {
      regular: { fontFamily: 'System', fontWeight: '400' },
      medium: { fontFamily: 'System', fontWeight: '500' },
      bold: { fontFamily: 'System', fontWeight: '700' },
      heavy: { fontFamily: 'System', fontWeight: '800' },
    },
  };

  if (status === 'idle') {
    return (
      <View style={[styles.loading, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {status === 'authenticated' && hasTokens ? (
          <>
            <RootStack.Screen name="Main" component={MainNavigator} />
            <RootStack.Screen
              name="FundWallet"
              component={FundWalletScreen}
              options={{ presentation: 'modal' }}
            />
            <RootStack.Screen name="SendMoney" component={SendMoneyScreen} options={{ presentation: 'modal' }} />
            <RootStack.Screen name="Withdraw" component={WithdrawScreen} options={{ presentation: 'modal' }} />
            <RootStack.Screen
              name="AddBeneficiary"
              component={AddBeneficiaryScreen}
              options={{ presentation: 'modal' }}
            />
          </>
        ) : (
          <RootStack.Screen name="Auth" component={AuthNavigator} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

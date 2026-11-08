import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Screen } from '../../components/Screen';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { DemoBanner } from '../../components/DemoBanner';
import { useTheme } from '../../theme/ThemeProvider';
import { typography } from '../../theme/colors';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { clearError, login } from '../../store/slices/authSlice';
import { isValidEmail } from '../../utils/validation';
import type { AuthStackParamList } from '../../navigation/types';
import { getDeviceContext } from '../../services/device';
import { DEMO_MODE } from '../../constants/config';
import { useState } from 'react';

export function LoginScreen() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const { loading, error, demoCode } = useAppSelector((state) => state.auth);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = async () => {
    setLocalError(null);
    if (!isValidEmail(email)) {
      setLocalError('Enter the email address you registered with.');
      return;
    }
    if (password.length < 8) {
      setLocalError('Enter your password (at least 8 characters).');
      return;
    }

    const result = await dispatch(login({ email: email.trim().toLowerCase(), password, device: getDeviceContext() }));
    if (login.rejected.match(result)) return;

    const unverified = result.payload as { user?: { emailVerified?: boolean } } | undefined;
    if (unverified?.user && unverified.user.emailVerified === false) {
      navigation.navigate('VerifyEmail', { email, demoCode: undefined });
    }
  };

  return (
    <Screen scroll contentContainerStyle={styles.content} testID="login-screen">
      <Text style={[styles.title, { color: theme.colors.text }]}>Welcome back</Text>
      <Text style={[typography.body, { color: theme.colors.textMuted, marginBottom: 20 }]}>
        Sign in to your PayFlow wallet.
      </Text>

      <DemoBanner compact />

      {demoCode ? (
        <View style={[styles.demoCode, { borderColor: theme.colors.primary }]}>
          <Text style={[typography.caption, { color: theme.colors.text }]}>
            Demo verification code: <Text style={{ fontWeight: '800' }}>{demoCode}</Text>
          </Text>
        </View>
      ) : null}

      <TextField
        testID="login-email"
        label="Email address"
        value={email}
        onChangeText={(value) => {
          setEmail(value);
          if (error) dispatch(clearError());
        }}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        placeholder="you@example.com"
      />

      <TextField
        testID="login-password"
        label="Password"
        value={password}
        onChangeText={(value) => {
          setPassword(value);
          if (error) dispatch(clearError());
        }}
        secureTextEntry
        secureToggle
        autoComplete="password"
        placeholder="Your password"
      />

      {error || localError ? (
        <Text testID="login-error" accessibilityRole="alert" style={[styles.error, { color: theme.colors.error }]}>
          {localError ?? error}
        </Text>
      ) : null}

      <Button
        testID="login-submit"
        label="Sign in"
        size="lg"
        loading={loading}
        onPress={() => void submit()}
      />

      <Pressable
        accessibilityRole="button"
        onPress={() => navigation.navigate('ForgotPassword')}
        style={styles.link}
      >
        <Text style={[typography.bodyStrong, { color: theme.colors.primary }]}>Forgot your password?</Text>
      </Pressable>

      <View style={styles.footer}>
        <Text style={[typography.body, { color: theme.colors.textMuted }]}>New to PayFlow?</Text>
        <Pressable accessibilityRole="button" onPress={() => navigation.navigate('Register')}>
          <Text style={[typography.bodyStrong, { color: theme.colors.primary }]}> Create an account</Text>
        </Pressable>
      </View>

      {DEMO_MODE ? (
        <View style={[styles.credentials, { borderColor: theme.colors.border }]}>
          <Text style={[typography.micro, { color: theme.colors.textMuted }]}>DEMO ACCOUNTS</Text>
          <Text style={[typography.caption, { color: theme.colors.text }]}>ada@payflow.demo · Flow1234 · PIN 1234</Text>
          <Text style={[typography.caption, { color: theme.colors.text }]}>
            tunde@payflow.demo · Flow1234 · PIN 1234
          </Text>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 24,
    gap: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  error: {
    marginBottom: 12,
  },
  link: {
    alignSelf: 'center',
    paddingVertical: 12,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 8,
  },
  demoCode: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginVertical: 12,
  },
  credentials: {
    marginTop: 24,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
});

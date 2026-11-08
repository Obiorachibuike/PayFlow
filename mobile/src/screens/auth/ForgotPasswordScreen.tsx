import { Pressable, StyleSheet, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '../../components/Screen';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { useTheme } from '../../theme/ThemeProvider';
import { typography } from '../../theme/colors';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { clearError, forgotPassword } from '../../store/slices/authSlice';
import { isValidEmail } from '../../utils/validation';
import type { AuthStackParamList } from '../../navigation/types';
import { useState } from 'react';

export function ForgotPasswordScreen() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const { loading, error, resetToken, demoCode, pendingEmail } = useAppSelector((state) => state.auth);

  const [email, setEmail] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = async () => {
    setLocalError(null);
    if (!isValidEmail(email)) {
      setLocalError('Enter the email address on your account.');
      return;
    }
    const result = await dispatch(forgotPassword(email.trim().toLowerCase()));
    if (forgotPassword.fulfilled.match(result) && result.payload.resetToken) {
      navigation.navigate('ResetPassword', { email: email.trim().toLowerCase(), token: result.payload.resetToken });
    }
  };

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: theme.colors.text }]}>Reset your password</Text>
      <Text style={[typography.body, { color: theme.colors.textMuted, marginBottom: 20 }]}>
        We’ll send a reset code to your email. Resetting signs every device out of your account.
      </Text>

      <TextField
        testID="forgot-email"
        label="Email address"
        value={email}
        onChangeText={(value) => {
          setEmail(value);
          if (error) dispatch(clearError());
        }}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="you@example.com"
      />

      {error || localError ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: theme.colors.error }]}>
          {localError ?? error}
        </Text>
      ) : null}

      <Button testID="forgot-submit" label="Send reset code" size="lg" loading={loading} onPress={() => void submit()} />

      {resetToken ? (
        <Pressable
          accessibilityRole="button"
          style={styles.link}
          onPress={() => navigation.navigate('ResetPassword', { email: pendingEmail ?? email, token: resetToken })}
        >
          <Text style={[typography.bodyStrong, { color: theme.colors.primary }]}>
            I have a code — continue
          </Text>
        </Pressable>
      ) : null}

      {demoCode ? (
        <Text testID="forgot-demo-code" style={[typography.caption, { color: theme.colors.textMuted }]}>
          Demo reset code: {demoCode}
        </Text>
      ) : null}

      <Pressable accessibilityRole="button" style={styles.link} onPress={() => navigation.goBack()}>
        <Text style={[typography.bodyStrong, { color: theme.colors.primary }]}>Back to sign in</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.6,
    marginBottom: 8,
  },
  error: {
    marginBottom: 12,
  },
  link: {
    alignSelf: 'center',
    paddingVertical: 14,
  },
});

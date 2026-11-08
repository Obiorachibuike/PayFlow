import { StyleSheet, Text } from 'react-native';
import { useNavigation, type RouteProp, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '../../components/Screen';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { useTheme } from '../../theme/ThemeProvider';
import { typography } from '../../theme/colors';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { clearError, resetPassword } from '../../store/slices/authSlice';
import { isStrongEnoughPassword, passwordStrength } from '../../utils/validation';
import type { AuthStackParamList } from '../../navigation/types';
import { useState } from 'react';

export function ResetPasswordScreen() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const route = useRoute<RouteProp<AuthStackParamList, 'ResetPassword'>>();
  const { loading, error } = useAppSelector((state) => state.auth);

  const [token, setToken] = useState(route.params?.token ?? '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const strength = passwordStrength(password);

  const submit = async () => {
    setLocalError(null);
    if (token.trim().length < 4) {
      setLocalError('Paste the reset code we sent you.');
      return;
    }
    if (!isStrongEnoughPassword(password)) {
      setLocalError('Use at least 8 characters with upper case, lower case and a number.');
      return;
    }
    if (password !== confirmPassword) {
      setLocalError('Both passwords must match.');
      return;
    }

    const result = await dispatch(
      resetPassword({ token: token.trim(), password, confirmPassword }),
    );
    if (resetPassword.fulfilled.match(result)) {
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    }
  };

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: theme.colors.text }]}>Choose a new password</Text>
      <Text style={[typography.body, { color: theme.colors.textMuted, marginBottom: 20 }]}>
        Make it long and unique to this account. Every signed-in device will be signed out.
      </Text>

      <TextField
        testID="reset-token"
        label="Reset code"
        value={token}
        onChangeText={setToken}
        autoCapitalize="characters"
        placeholder="ABC123"
      />
      <TextField
        testID="reset-password"
        label="New password"
        value={password}
        onChangeText={(value) => {
          setPassword(value);
          if (error) dispatch(clearError());
        }}
        secureTextEntry
        secureToggle
        placeholder="At least 8 characters"
        hint={password ? `Strength: ${strength.label}` : null}
      />
      <TextField
        testID="reset-confirm-password"
        label="Confirm new password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        secureToggle
        placeholder="Repeat your password"
      />

      {error || localError ? (
        <Text testID="reset-error" accessibilityRole="alert" style={[styles.error, { color: theme.colors.error }]}>
          {localError ?? error}
        </Text>
      ) : null}

      <Button
        testID="reset-submit"
        label="Update password"
        size="lg"
        loading={loading}
        onPress={() => void submit()}
      />
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
});

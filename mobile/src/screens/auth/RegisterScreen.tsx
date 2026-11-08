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
import { clearError, register } from '../../store/slices/authSlice';
import {
  isStrongEnoughPassword,
  isValidEmail,
  isValidFullName,
  isValidNigerianPhone,
  normaliseNigerianPhone,
  passwordStrength,
} from '../../utils/validation';
import type { AuthStackParamList } from '../../navigation/types';
import { getDeviceContext } from '../../services/device';
import { useMemo, useState } from 'react';

interface FieldErrors {
  fullName?: string;
  email?: string;
  phone?: string;
  password?: string;
  confirmPassword?: string;
}

export function RegisterScreen() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const { loading, error, user, demoCode } = useAppSelector((state) => state.auth);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const strength = useMemo(() => passwordStrength(password), [password]);

  const validate = (): boolean => {
    const errors: FieldErrors = {};
    if (!isValidFullName(fullName)) errors.fullName = 'Enter your full name (letters only).';
    if (!isValidEmail(email)) errors.email = 'Enter a valid email address.';
    if (!isValidNigerianPhone(phone)) errors.phone = 'Enter a Nigerian number, e.g. 0803 123 4567.';
    if (!isStrongEnoughPassword(password))
      errors.password = 'Use at least 8 characters with upper case, lower case and a number.';
    if (password !== confirmPassword) errors.confirmPassword = 'Both passwords must match.';

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    dispatch(clearError());

    const result = await dispatch(
      register({
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        phone: normaliseNigerianPhone(phone) ?? phone.trim(),
        password,
        confirmPassword,
        device: getDeviceContext(),
      }),
    );

    if (register.fulfilled.match(result)) {
      navigation.navigate('VerifyEmail', { email: email.trim().toLowerCase(), demoCode: demoCode ?? undefined });
    }
  };

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: theme.colors.text }]}>Create your wallet</Text>
      <Text style={[typography.body, { color: theme.colors.textMuted }]}>
        It takes about a minute. Your details stay on your device and in the PayFlow database — never with a card
        network.
      </Text>

      <DemoBanner compact />

      <TextField
        testID="register-name"
        label="Full name"
        value={fullName}
        onChangeText={setFullName}
        autoComplete="name"
        placeholder="Ada Obi"
        error={fieldErrors.fullName ?? null}
      />
      <TextField
        testID="register-email"
        label="Email address"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        placeholder="you@example.com"
        error={fieldErrors.email ?? null}
      />
      <TextField
        testID="register-phone"
        label="Phone number"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        autoComplete="tel"
        placeholder="0803 123 4567"
        prefix="+234"
        error={fieldErrors.phone ?? null}
      />
      <TextField
        testID="register-password"
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        secureToggle
        autoComplete="new-password"
        placeholder="At least 8 characters"
        error={fieldErrors.password ?? null}
        hint={password ? `Strength: ${strength.label}` : null}
      />
      <TextField
        testID="register-confirm-password"
        label="Confirm password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        secureToggle
        autoComplete="new-password"
        placeholder="Repeat your password"
        error={fieldErrors.confirmPassword ?? null}
      />

      {error ? (
        <Text testID="register-error" accessibilityRole="alert" style={[styles.error, { color: theme.colors.error }]}>
          {error}
        </Text>
      ) : null}

      <Button
        testID="register-submit"
        label="Create account"
        size="lg"
        loading={loading}
        onPress={() => void submit()}
      />

      <View style={styles.footer}>
        <Text style={[typography.body, { color: theme.colors.textMuted }]}>Already have an account?</Text>
        <Pressable accessibilityRole="button" onPress={() => navigation.navigate('Login')}>
          <Text style={[typography.bodyStrong, { color: theme.colors.primary }]}> Sign in</Text>
        </Pressable>
      </View>

      {user && demoCode ? (
        <View style={[styles.code, { borderColor: theme.colors.primary }]}>
          <Text style={[typography.caption, { color: theme.colors.text }]}>
            Demo verification code: <Text style={{ fontWeight: '800' }}>{demoCode}</Text>
          </Text>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
    marginBottom: 6,
  },
  error: {
    marginBottom: 12,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
  },
  code: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
});

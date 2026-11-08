import { StyleSheet, Text, View } from 'react-native';
import { useNavigation, type RouteProp, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '../../components/Screen';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { useTheme } from '../../theme/ThemeProvider';
import { typography } from '../../theme/colors';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { clearError, resendVerification, verifyEmail } from '../../store/slices/authSlice';
import { maskEmail } from '../../utils/format';
import type { AuthStackParamList } from '../../navigation/types';
import { useEffect, useState } from 'react';

export function VerifyEmailScreen() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const route = useRoute<RouteProp<AuthStackParamList, 'VerifyEmail'>>();
  const { loading, error, demoCode, user } = useAppSelector((state) => state.auth);

  const email = route.params?.email ?? user?.email ?? '';
  const [code, setCode] = useState('');

  useEffect(() => {
    // In demo mode the backend echoes the code so the flow can be completed offline.
    if (!code && demoCode) setCode(demoCode);
  }, [code, demoCode]);

  const submit = async () => {
    if (code.trim().length < 4) return;
    const result = await dispatch(verifyEmail(code.trim()));
    if (verifyEmail.fulfilled.match(result) && result.payload.verified) {
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    }
  };

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: theme.colors.text }]}>Verify your email</Text>
      <Text style={[typography.body, { color: theme.colors.textMuted }]}>
        We sent a 6-digit code to {maskEmail(email)}. Enter it below to unlock sending, withdrawals and higher
        limits.
      </Text>

      <View style={[styles.note, { borderColor: theme.colors.border }]}>
        <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
          Demo mode: the code is shown here instead of being emailed, and is also logged by the API in development
          only.
        </Text>
      </View>

      {demoCode ? (
        <View style={[styles.code, { borderColor: theme.colors.primary }]}>
          <Text testID="verify-demo-code" style={[typography.body, { color: theme.colors.text }]}>
            Your code: <Text style={{ fontWeight: '800' }}>{demoCode}</Text>
          </Text>
        </View>
      ) : null}

      <TextField
        testID="verify-code"
        label="Verification code"
        value={code}
        onChangeText={(value) => {
          setCode(value);
          if (error) dispatch(clearError());
        }}
        keyboardType="number-pad"
        maxLength={6}
        placeholder="123456"
      />

      {error ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: theme.colors.error }]}>
          {error}
        </Text>
      ) : null}

      <Button testID="verify-submit" label="Verify email" size="lg" loading={loading} onPress={() => void submit()} />

      <Button
        testID="verify-resend"
        label="Resend code"
        variant="ghost"
        onPress={() => void dispatch(resendVerification())}
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
  note: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginVertical: 16,
  },
  code: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  error: {
    marginBottom: 12,
  },
});

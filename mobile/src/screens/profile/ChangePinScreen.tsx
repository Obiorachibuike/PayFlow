import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { PinPad } from '../../components/PinPad';
import { useTheme } from '../../theme/ThemeProvider';
import { typography } from '../../theme/colors';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { changePin, clearProfileNotice, fetchProfile } from '../../store/slices/profileSlice';
import { isWeakPin, isValidTransactionPin } from '../../utils/validation';
import { useEffect, useState } from 'react';

export function ChangePinScreen() {
  const theme = useTheme();
  const dispatch = useAppDispatch();

  const saving = useAppSelector((state) => state.profile.saving);
  const error = useAppSelector((state) => state.profile.error);
  const notice = useAppSelector((state) => state.profile.notice);
  const pinConfigured = useAppSelector((state) => state.profile.profile?.security?.pinConfigured ?? false);

  const [currentPin, setCurrentPin] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [usePassword, setUsePassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    void dispatch(fetchProfile());
  }, [dispatch]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => dispatch(clearProfileNotice()), 3000);
    return () => clearTimeout(timer);
  }, [notice, dispatch]);

  const submit = async (newPin: string) => {
    setLocalError(null);
    if (isWeakPin(newPin)) {
      setLocalError('Avoid simple PINs like 1234, 0000 or 1111.');
      return;
    }
    if (!pinConfigured && !password) {
      setLocalError('Enter your account password to create a PIN.');
      return;
    }

    await dispatch(
      changePin({
        newPin,
        currentPin: currentPin ?? undefined,
        password: usePassword || !pinConfigured ? password : undefined,
      }),
    );
  };

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <Text style={[typography.body, { color: theme.colors.textMuted }]}>
        Your PIN authorises transfers and withdrawals. It is hashed with bcrypt on the server — PayFlow never
        stores it in plain text and it is never sent anywhere except over TLS.
      </Text>

      {pinConfigured ? (
        <View style={styles.modeRow}>
          <Button
            testID="pin-mode-current"
            label="Use current PIN"
            variant={usePassword ? 'secondary' : 'primary'}
            size="sm"
            onPress={() => setUsePassword(false)}
          />
          <Button
            testID="pin-mode-password"
            label="Use password"
            variant={usePassword ? 'primary' : 'secondary'}
            size="sm"
            onPress={() => setUsePassword(true)}
          />
        </View>
      ) : null}

      {!pinConfigured || usePassword ? (
        <TextField
          testID="pin-password"
          label="Account password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          secureToggle
          placeholder="Your PayFlow password"
        />
      ) : (
        <View style={styles.currentPinBlock}>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>Current PIN</Text>
          <PinPad
            testID="current-pin"
            length={4}
            onComplete={setCurrentPin}
            onChange={(value) => {
              if (value.length < 4) setCurrentPin(null);
            }}
          />
          {currentPin ? (
            <Text testID="current-pin-entered" style={[typography.caption, { color: theme.colors.success }]}>
              Current PIN entered
            </Text>
          ) : null}
        </View>
      )}

      <View style={styles.divider} />

      <Text style={[typography.bodyStrong, { color: theme.colors.text }]}>Choose your new 4-digit PIN</Text>
      <PinPad testID="new-pin" length={4} onComplete={(pin) => void submit(pin)} busy={saving} error={error} />

      {localError ? (
        <Text testID="pin-local-error" accessibilityRole="alert" style={[styles.error, { color: theme.colors.error }]}>
          {localError}
        </Text>
      ) : null}
      {notice ? (
        <Text testID="pin-notice" style={[styles.notice, { color: theme.colors.success }]}>
          {notice}
        </Text>
      ) : null}

      <Text style={[typography.micro, { color: theme.colors.textMuted, textAlign: 'center' }]}>
        {isValidTransactionPin(currentPin ?? '') ? '' : 'Minimum 4 digits · avoid repeating or sequential numbers'}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 14,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  currentPinBlock: {
    alignItems: 'center',
    gap: 10,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(129, 139, 131, 0.3)',
    marginVertical: 8,
  },
  error: {
    textAlign: 'center',
  },
  notice: {
    textAlign: 'center',
  },
});

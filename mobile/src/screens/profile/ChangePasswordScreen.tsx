import { StyleSheet, Text } from 'react-native';
import { Screen } from '../../components/Screen';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { useTheme } from '../../theme/ThemeProvider';
import { typography } from '../../theme/colors';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { changePassword, clearProfileNotice } from '../../store/slices/profileSlice';
import { isStrongEnoughPassword, passwordStrength } from '../../utils/validation';
import { useEffect, useState } from 'react';

export function ChangePasswordScreen() {
  const theme = useTheme();
  const dispatch = useAppDispatch();

  const saving = useAppSelector((state) => state.profile.saving);
  const error = useAppSelector((state) => state.profile.error);
  const notice = useAppSelector((state) => state.profile.notice);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const strength = passwordStrength(newPassword);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => dispatch(clearProfileNotice()), 4000);
    return () => clearTimeout(timer);
  }, [notice, dispatch]);

  const submit = async () => {
    setLocalError(null);
    if (currentPassword.length === 0) {
      setLocalError('Enter your current password.');
      return;
    }
    if (!isStrongEnoughPassword(newPassword)) {
      setLocalError('Use at least 8 characters with upper case, lower case and a number.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setLocalError('Both new passwords must match.');
      return;
    }

    const result = await dispatch(changePassword({ currentPassword, newPassword }));
    if (changePassword.fulfilled.match(result)) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
  };

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <Text style={[typography.body, { color: theme.colors.textMuted }]}>
        Changing your password signs out every other device. You will stay signed in here.
      </Text>

      <TextField
        testID="current-password"
        label="Current password"
        value={currentPassword}
        onChangeText={setCurrentPassword}
        secureTextEntry
        secureToggle
      />
      <TextField
        testID="new-password"
        label="New password"
        value={newPassword}
        onChangeText={setNewPassword}
        secureTextEntry
        secureToggle
        hint={newPassword ? `Strength: ${strength.label}` : null}
      />
      <TextField
        testID="confirm-new-password"
        label="Confirm new password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        secureToggle
      />

      {error || localError ? (
        <Text testID="change-password-error" accessibilityRole="alert" style={[styles.error, { color: theme.colors.error }]}>
          {localError ?? error}
        </Text>
      ) : null}
      {notice ? (
        <Text testID="change-password-notice" style={[styles.notice, { color: theme.colors.success }]}>
          {notice}
        </Text>
      ) : null}

      <Button
        testID="change-password-submit"
        label="Update password"
        size="lg"
        loading={saving}
        onPress={() => void submit()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 12,
  },
  error: {
    marginBottom: 12,
  },
  notice: {
    marginBottom: 12,
  },
});

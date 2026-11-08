import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { useTheme } from '../../theme/ThemeProvider';
import { typography } from '../../theme/colors';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { clearProfileNotice, fetchProfile, updateProfile } from '../../store/slices/profileSlice';
import { isValidFullName } from '../../utils/validation';
import { palette } from '../../theme/colors';
import { useEffect, useState } from 'react';

const AVATAR_COLOURS = [palette.primary, palette.success, palette.warning, '#38BDF8', '#F472B6', '#A3E635'];

export function EditProfileScreen() {
  const theme = useTheme();
  const dispatch = useAppDispatch();

  const user = useAppSelector((state) => state.profile.profile?.user ?? state.auth.user);
  const saving = useAppSelector((state) => state.profile.saving);
  const error = useAppSelector((state) => state.profile.error);
  const notice = useAppSelector((state) => state.profile.notice);

  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [avatarColor, setAvatarColor] = useState(user?.avatarColor ?? palette.primary);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    void dispatch(fetchProfile());
  }, [dispatch]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => dispatch(clearProfileNotice()), 2500);
    return () => clearTimeout(timer);
  }, [notice, dispatch]);

  const submit = async () => {
    setLocalError(null);
    if (!isValidFullName(fullName)) {
      setLocalError('Enter your name using letters only (2–80 characters).');
      return;
    }
    await dispatch(updateProfile({ fullName: fullName.trim(), avatarColor }));
  };

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <TextField
        testID="edit-name"
        label="Full name"
        value={fullName}
        onChangeText={setFullName}
        autoComplete="name"
        error={localError ?? null}
      />

      <Text style={[typography.caption, { color: theme.colors.textMuted, marginBottom: 8 }]}>Avatar colour</Text>
      <View style={styles.colours}>
        {AVATAR_COLOURS.map((colour) => {
          const active = avatarColor.toLowerCase() === colour.toLowerCase();
          return (
            <Pressable
              key={colour}
              testID={`avatar-colour-${colour.replace('#', '')}`}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setAvatarColor(colour)}
              style={[
                styles.colour,
                {
                  backgroundColor: colour,
                  borderColor: active ? theme.colors.text : 'transparent',
                  borderWidth: active ? 2 : 0,
                },
              ]}
            />
          );
        })}
      </View>

      <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
        Your email and phone number identify your wallet and cannot be changed here in the demo.
      </Text>

      {error ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: theme.colors.error }]}>
          {error}
        </Text>
      ) : null}
      {notice ? (
        <Text testID="edit-profile-notice" style={[styles.notice, { color: theme.colors.success }]}>
          {notice}
        </Text>
      ) : null}

      <Button testID="edit-save" label="Save changes" size="lg" loading={saving} onPress={() => void submit()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 12,
  },
  colours: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  colour: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  error: {
    marginBottom: 12,
  },
  notice: {
    marginBottom: 12,
  },
});

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { SegmentedControl } from '../../components/SegmentedControl';
import { useTheme } from '../../theme/ThemeProvider';
import { typography } from '../../theme/colors';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { setThemePreference, toggleHideBalances } from '../../store/slices/settingsSlice';
import { updateProfile } from '../../store/slices/profileSlice';
import { API_BASE_URL } from '../../constants/config';
import { useEffect } from 'react';

export function SettingsScreen() {
  const theme = useTheme();
  const dispatch = useAppDispatch();

  const preference = useAppSelector((state) => state.settings.themePreference);
  const hideBalances = useAppSelector((state) => state.settings.hideBalances);
  const user = useAppSelector((state) => state.profile.profile?.user ?? state.auth.user);

  useEffect(() => {
    // Keep the server-side preference in step so it follows the account.
    if (user?.themePreference !== preference) void dispatch(updateProfile({ themePreference: preference }));
  }, [dispatch, preference, user?.themePreference]);

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content} testID="settings-screen">
        <Card>
          <Text style={[typography.bodyStrong, { color: theme.colors.text, marginBottom: 12 }]}>Appearance</Text>
          <SegmentedControl<'SYSTEM' | 'LIGHT' | 'DARK'>
            testID="theme-preference"
            value={preference}
            onChange={(value) => dispatch(setThemePreference(value))}
            segments={[
              { value: 'SYSTEM', label: 'System' },
              { value: 'LIGHT', label: 'Light' },
              { value: 'DARK', label: 'Dark' },
            ]}
          />
          <Text style={[typography.caption, { color: theme.colors.textMuted, marginTop: 10 }]}>
            PayFlow’s palette is green on near-black (dark) or off-white (light). No purple tones anywhere.
          </Text>
        </Card>

        <Card padded={false} style={styles.menu}>
          <ToggleRow
            testID="toggle-hide-balances"
            label="Hide balances by default"
            value={hideBalances}
            onChange={() => dispatch(toggleHideBalances())}
          />
          {user ? (
            <>
              <ToggleRow
                testID="toggle-notify-push"
                label="Push notifications"
                value={user.notifications.push}
                onChange={() => void dispatch(updateProfile({ notifyPush: !user.notifications.push }))}
              />
              <ToggleRow
                testID="toggle-notify-security"
                label="Security alerts"
                value={user.notifications.security}
                onChange={() => void dispatch(updateProfile({ notifySecurity: !user.notifications.security }))}
              />
              <ToggleRow
                testID="toggle-notify-email"
                label="Email notifications"
                value={user.notifications.email}
                onChange={() => void dispatch(updateProfile({ notifyEmail: !user.notifications.email }))}
              />
            </>
          ) : null}
        </Card>

        <Card>
          <Text style={[typography.micro, { color: theme.colors.textMuted }]}>API</Text>
          <Text style={[typography.caption, { color: theme.colors.text, marginTop: 6 }]}>{API_BASE_URL}</Text>
          <Text style={[typography.caption, { color: theme.colors.textMuted, marginTop: 6 }]}>
            The app talks only to the PayFlow API. It never holds a Paystack secret key and never talks to a
            payment provider directly.
          </Text>
        </Card>
      </ScrollView>
    </Screen>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
  testID,
}: {
  label: string;
  value: boolean;
  onChange: () => void;
  testID: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={onChange}
      style={styles.row}
    >
      <Text style={[typography.body, { color: theme.colors.text, flex: 1 }]}>{label}</Text>
      <View style={[styles.switch, { backgroundColor: value ? theme.colors.primary : theme.colors.surfaceAlt }]}>
        <View
          style={[
            styles.knob,
            { backgroundColor: theme.colors.surface, alignSelf: value ? 'flex-end' : 'flex-start' },
          ]}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 14,
    paddingBottom: 40,
  },
  menu: {
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  switch: {
    width: 52,
    height: 30,
    borderRadius: 15,
    padding: 3,
    justifyContent: 'center',
  },
  knob: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
});

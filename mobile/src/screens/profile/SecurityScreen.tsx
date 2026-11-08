import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { useTheme } from '../../theme/ThemeProvider';
import { typography } from '../../theme/colors';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchProfile, setBiometrics } from '../../store/slices/profileSlice';
import { setBiometricUnlock } from '../../store/slices/settingsSlice';
import type { ProfileStackParamList } from '../../navigation/types';

export function SecurityScreen() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();

  const security = useAppSelector((state) => state.profile.profile?.security);
  const user = useAppSelector((state) => state.profile.profile?.user ?? state.auth.user);
  const savedLocally = useAppSelector((state) => state.settings.biometricUnlockEnabled);

  const [hardwareAvailable, setHardwareAvailable] = useState(false);
  const [enrolled, setEnrolled] = useState(false);

  useEffect(() => {
    void dispatch(fetchProfile());
    void (async () => {
      try {
        const available = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        setHardwareAvailable(available);
        setEnrolled(isEnrolled);
      } catch {
        // Biometrics are unavailable (web, simulator). The app still works.
        setHardwareAvailable(false);
        setEnrolled(false);
      }
    })();
  }, [dispatch]);

  const enabled = Boolean(security?.biometricEnabled || savedLocally);

  const toggleBiometrics = useCallback(async () => {
    if (!enabled) {
      try {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Confirm your identity to enable quick unlock',
        });
        if (!result.success) return;
      } catch {
        // No biometric hardware (web/simulator): allow the toggle for the demo,
        // but it never authorises a payment on its own.
      }
    }
    await dispatch(setBiometrics(!enabled));
    dispatch(setBiometricUnlock(!enabled));
  }, [dispatch, enabled]);

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content} testID="security-screen">
        <Card padded={false} style={styles.menu}>
          <Row
            testID="security-pin"
            icon="keypad-outline"
            label="Transaction PIN"
            value={security?.pinConfigured ? 'Set' : 'Not set'}
            tone={security?.pinConfigured ? 'success' : 'warning'}
            onPress={() => navigation.navigate('ChangePin')}
          />
          <Row
            testID="security-password"
            icon="key-outline"
            label="Password"
            value="Change"
            onPress={() => navigation.navigate('ChangePassword')}
          />
          <Row
            testID="security-sessions"
            icon="laptop-outline"
            label="Signed-in devices"
            value={security ? `${security.activeSessions}` : '—'}
            onPress={() => navigation.navigate('Sessions')}
          />
        </Card>

        <Card>
          <View style={styles.biometricHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[typography.bodyStrong, { color: theme.colors.text }]}>Unlock with biometrics</Text>
              <Text style={[typography.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>
                A local convenience only. Your transaction PIN is still required for every payment — biometrics
                never authorise money movement on their own.
              </Text>
            </View>
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: enabled }}
              testID="security-biometrics-toggle"
              onPress={() => void toggleBiometrics()}
              style={[
                styles.switch,
                { backgroundColor: enabled ? theme.colors.primary : theme.colors.surfaceAlt },
              ]}
            >
              <View style={[styles.knob, { backgroundColor: theme.colors.surface, alignSelf: enabled ? 'flex-end' : 'flex-start' }]} />
            </Pressable>
          </View>

          {!hardwareAvailable || !enrolled ? (
            <Text style={[typography.caption, { color: theme.colors.warning, marginTop: 12 }]}>
              {hardwareAvailable
                ? 'No fingerprint or face is enrolled on this device yet.'
                : 'This device has no biometric hardware, so the toggle is stored for demonstration only.'}
            </Text>
          ) : null}
        </Card>

        <Card>
          <Text style={[typography.micro, { color: theme.colors.textMuted }]}>EMAIL</Text>
          <Text style={[typography.body, { color: theme.colors.text, marginTop: 6 }]}>{user?.email}</Text>
          <Text
            style={[
              typography.caption,
              { color: security?.emailVerified ? theme.colors.success : theme.colors.warning, marginTop: 4 },
            ]}
          >
            {security?.emailVerified ? 'Verified' : 'Not verified — some actions are blocked'}
          </Text>
        </Card>

        <Card>
          <Text style={[typography.subtitle, { color: theme.colors.text, marginBottom: 8 }]}>
            How PayFlow protects you
          </Text>
          <Bullet text="Passwords and PINs are hashed with bcrypt; they are never stored or logged in plain text." />
          <Bullet text="Access tokens expire in minutes and refresh tokens rotate on every use, with replay detection." />
          <Bullet text="Every naira is recorded as an immutable double-entry ledger entry in kobo." />
        </Card>
      </ScrollView>
    </Screen>
  );
}

function Row({
  icon,
  label,
  value,
  tone,
  onPress,
  testID,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value?: string;
  tone?: 'success' | 'warning';
  onPress: () => void;
  testID?: string;
}) {
  const theme = useTheme();
  const colour = tone === 'success' ? theme.colors.success : tone === 'warning' ? theme.colors.warning : theme.colors.textMuted;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.row, { borderBottomColor: theme.colors.border }]}
    >
      <Ionicons name={icon} size={20} color={theme.colors.primary} />
      <Text style={[typography.bodyStrong, { color: theme.colors.text, flex: 1, marginLeft: 12 }]}>{label}</Text>
      {value ? <Text style={[typography.caption, { color: colour }]}>{value}</Text> : null}
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
    </Pressable>
  );
}

function Bullet({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <View style={styles.bullet}>
      <Ionicons name="checkmark" size={16} color={theme.colors.primary} />
      <Text style={[typography.caption, { color: theme.colors.textMuted, flex: 1, marginLeft: 10 }]}>{text}</Text>
    </View>
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  biometricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
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
  bullet: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
});

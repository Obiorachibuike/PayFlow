import React, { useCallback, useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/Screen';
import { Avatar } from '../../components/Avatar';
import { Card } from '../../components/Card';
import { StatTile } from '../../components/StatTile';
import { DemoBanner } from '../../components/DemoBanner';
import { useTheme } from '../../theme/ThemeProvider';
import { typography } from '../../theme/colors';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchProfile } from '../../store/slices/profileSlice';
import { logout } from '../../store/slices/authSlice';
import { formatNaira } from '../../utils/money';
import { formatDateTime } from '../../utils/format';
import type { ProfileStackParamList } from '../../navigation/types';

type Navigation = NativeStackNavigationProp<ProfileStackParamList>;

export function ProfileScreen() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const navigation = useNavigation<Navigation>();

  const profile = useAppSelector((state) => state.profile.profile);
  const user = useAppSelector((state) => state.auth.user);
  const wallet = useAppSelector((state) => state.wallet.wallet);

  const load = useCallback(() => {
    void dispatch(fetchProfile());
  }, [dispatch]);

  useEffect(() => {
    load();
  }, [load]);

  const displayUser = profile?.user ?? user;
  const security = profile?.security;
  const stats = profile?.stats;

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content} testID="profile-screen">
        <View style={styles.identity}>
          <Avatar name={displayUser?.fullName ?? 'PayFlow User'} color={displayUser?.avatarColor} size={64} />
          <View style={{ flex: 1 }}>
            <Text testID="profile-name" style={[styles.name, { color: theme.colors.text }]}>
              {displayUser?.fullName ?? 'PayFlow user'}
            </Text>
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>{displayUser?.email}</Text>
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
              {wallet?.maskedWalletTag ?? 'PF-****-0000'} · {displayUser?.phone}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            testID="profile-edit"
            onPress={() => navigation.navigate('EditProfile')}
            style={[styles.editButton, { borderColor: theme.colors.border }]}
          >
            <Ionicons name="create-outline" size={18} color={theme.colors.primary} />
          </Pressable>
        </View>

        <DemoBanner compact message="Demo account. Identity, KYC and balances are simulated." />

        <View style={styles.statsRow}>
          <StatTile
            testID="profile-balance"
            label="Balance"
            value={formatNaira(wallet?.balanceMinor ?? 0)}
            caption="Live from the ledger"
          />
          <StatTile
            testID="profile-transactions"
            label="Transactions"
            value={String(stats?.transactionCount ?? 0)}
            caption="All time"
          />
        </View>

        <Card padded={false} style={styles.menu}>
          <MenuItem
            testID="profile-security"
            icon="shield-checkmark-outline"
            label="Security"
            value={
              security
                ? `PIN ${security.pinConfigured ? 'set' : 'not set'} · ${security.activeSessions} device${
                    security.activeSessions === 1 ? '' : 's'
                  }`
                : undefined
            }
            onPress={() => navigation.navigate('Security')}
          />
          <MenuItem
            testID="profile-beneficiaries"
            icon="people-outline"
            label="Beneficiaries"
            onPress={() => navigation.navigate('Beneficiaries')}
          />
          <MenuItem
            testID="profile-settings"
            icon="settings-outline"
            label="Settings"
            onPress={() => navigation.navigate('Settings')}
          />
          <MenuItem
            testID="profile-ledger"
            icon="file-tray-full-outline"
            label="Ledger entries"
            value="Read-only audit view"
            onPress={() => navigation.navigate('Ledger')}
          />
        </Card>

        <Card padded={false} style={styles.menu}>
          <MenuItem
            testID="profile-password"
            icon="key-outline"
            label="Change password"
            onPress={() => navigation.navigate('ChangePassword')}
          />
          <MenuItem
            testID="profile-pin"
            icon="keypad-outline"
            label="Transaction PIN"
            onPress={() => navigation.navigate('ChangePin')}
          />
        </Card>

        <Card>
          <Text style={[typography.micro, { color: theme.colors.textMuted }]}>ACCOUNT STATUS</Text>
          <View style={styles.statusRow}>
            <Text style={[typography.body, { color: theme.colors.text }]}>Email</Text>
            <Text style={[typography.bodyStrong, { color: security?.emailVerified ? theme.colors.success : theme.colors.warning }]}>
              {security?.emailVerified ? 'Verified' : 'Unverified'}
            </Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={[typography.body, { color: theme.colors.text }]}>KYC</Text>
            <Text style={[typography.bodyStrong, { color: theme.colors.warning }]}>
              {security?.kycStatus ?? 'NONE'} (demo)
            </Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={[typography.body, { color: theme.colors.text }]}>Member since</Text>
            <Text style={[typography.bodyStrong, { color: theme.colors.text }]}>
              {displayUser?.createdAt ? formatDateTime(displayUser.createdAt) : '—'}
            </Text>
          </View>
        </Card>

        <Pressable
          accessibilityRole="button"
          testID="profile-sign-out"
          onPress={() => void dispatch(logout())}
          style={styles.signOut}
        >
          <Ionicons name="log-out-outline" size={20} color={theme.colors.error} />
          <Text style={[typography.bodyStrong, { color: theme.colors.error, marginLeft: 10 }]}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

function MenuItem({
  icon,
  label,
  value,
  onPress,
  testID,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value?: string;
  onPress: () => void;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.menuItem, { borderBottomColor: theme.colors.border }]}
    >
      <Ionicons name={icon} size={20} color={theme.colors.primary} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={[typography.bodyStrong, { color: theme.colors.text }]}>{label}</Text>
        {value ? <Text style={[typography.caption, { color: theme.colors.textMuted }]}>{value}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 14,
    paddingBottom: 48,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  name: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  editButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  menu: {
    paddingHorizontal: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
});

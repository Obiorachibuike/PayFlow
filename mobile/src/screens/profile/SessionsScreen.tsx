import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { useTheme } from '../../theme/ThemeProvider';
import { typography } from '../../theme/colors';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchSessions, revokeSession } from '../../store/slices/profileSlice';
import { formatRelative } from '../../utils/format';
import type { DeviceSession } from '../../types/api';
import { useCallback, useEffect } from 'react';

export function SessionsScreen() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const sessions = useAppSelector((state) => state.profile.sessions);

  const load = useCallback(() => {
    void dispatch(fetchSessions());
  }, [dispatch]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content} testID="sessions-screen">
        {sessions.length === 0 ? (
          <EmptyState
            testID="sessions-empty"
            title="No active devices"
            message="Devices appear here once you sign in from them."
          />
        ) : (
          <Card padded={false} style={styles.card}>
            {sessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                onRevoke={() => void dispatch(revokeSession(session.id))}
              />
            ))}
          </Card>
        )}

        <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
          Revoking a device immediately invalidates its refresh token. If you see a device you do not recognise,
          revoke it and change your password.
        </Text>
      </ScrollView>
    </Screen>
  );
}

function SessionRow({ session, onRevoke }: { session: DeviceSession; onRevoke: () => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: theme.colors.border }]} testID={`session-${session.id}`}>
      <Ionicons
        name={session.platform === 'ios' ? 'phone-portrait-outline' : 'hardware-chip-outline'}
        size={20}
        color={theme.colors.primary}
      />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={[typography.bodyStrong, { color: theme.colors.text }]}>
          {session.deviceName}
          {session.current ? ' · this device' : ''}
        </Text>
        <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
          {session.platform ?? 'unknown'} · last active {formatRelative(session.lastActiveAt)}
        </Text>
      </View>
      {session.current ? null : (
        <Pressable accessibilityRole="button" testID={`revoke-${session.id}`} onPress={onRevoke} style={styles.revoke}>
          <Text style={[typography.caption, { color: theme.colors.error, fontWeight: '700' }]}>Revoke</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 14,
    paddingBottom: 40,
  },
  card: {
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  revoke: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
});

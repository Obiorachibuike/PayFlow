import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '../../components/Screen';
import { EmptyState } from '../../components/EmptyState';
import { useTheme } from '../../theme/ThemeProvider';
import { typography } from '../../theme/colors';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchNotifications } from '../../store/slices/notificationsSlice';
import { formatRelative, groupByDay } from '../../utils/format';
import type { ActivityStackParamList } from '../../navigation/types';
import type { Notification } from '../../types/api';
import { useCallback, useEffect, useMemo } from 'react';

export function ActivityScreen() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const navigation = useNavigation<NativeStackNavigationProp<ActivityStackParamList>>();

  const items = useAppSelector((state) => state.notifications.items);
  const local = useAppSelector((state) => state.notifications.local);
  const loading = useAppSelector((state) => state.notifications.loading);

  const load = useCallback(() => {
    void dispatch(fetchNotifications());
  }, [dispatch]);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => groupByDay<Notification>([...local, ...items], (item) => item.createdAt), [
    items,
    local,
  ]);

  const rows = useMemo(
    () =>
      grouped.flatMap((group) => [
        { type: 'header' as const, id: `header-${group.label}`, label: group.label },
        ...group.items.map((item) => ({ type: 'item' as const, id: item.id, notification: item })),
      ]),
    [grouped],
  );

  if (!loading && rows.length === 0) {
    return (
      <Screen testID="activity-empty-state">
        <EmptyState
          testID="activity-empty"
          title="Nothing to see yet"
          message="Payments, transfers and security alerts land here the moment they happen."
        />
      </Screen>
    );
  }

  return (
    <Screen padded={false} testID="activity-screen">
      <FlatList
        testID="activity-list"
        data={rows}
        keyExtractor={(row) => row.id}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={styles.content}
        renderItem={({ item }) => {
          if (item.type === 'header') {
            return (
              <Text style={[styles.groupHeader, { color: theme.colors.textMuted }]}>{item.label}</Text>
            );
          }

          const notification = item.notification;
          const unread = !notification.readAt;
          const failed = notification.type === 'TRANSACTION_FAILED';
          const transactionId = (notification.data as { transactionId?: string } | null)?.transactionId;

          return (
            <Pressable
              testID={`activity-item-${notification.id}`}
              accessibilityRole="button"
              disabled={!transactionId}
              onPress={() => {
                if (transactionId) navigation.navigate('TransactionDetails', { transactionId });
              }}
              style={[
                styles.item,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: unread ? theme.colors.primary : theme.colors.border,
                  borderRadius: theme.radius.md,
                },
              ]}
            >
              <View style={styles.itemHeader}>
                <Text
                  style={[
                    typography.bodyStrong,
                    { color: failed ? theme.colors.error : theme.colors.text, flex: 1 },
                  ]}
                >
                  {notification.title}
                </Text>
                <Text style={[typography.micro, { color: theme.colors.textMuted }]}>
                  {formatRelative(notification.createdAt)}
                </Text>
              </View>
              <Text style={[typography.caption, { color: theme.colors.textMuted }]}>{notification.body}</Text>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 10,
  },
  groupHeader: {
    marginTop: 12,
    marginBottom: 4,
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  item: {
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
});

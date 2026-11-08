import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { EmptyState } from '../../components/EmptyState';
import { useTheme } from '../../theme/ThemeProvider';
import { typography } from '../../theme/colors';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchNotifications, markAllRead, markRead } from '../../store/slices/notificationsSlice';
import { formatRelative } from '../../utils/format';
import { useCallback, useEffect } from 'react';

export function NotificationsScreen() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const items = useAppSelector((state) => state.notifications.items);
  const local = useAppSelector((state) => state.notifications.local);
  const loading = useAppSelector((state) => state.notifications.loading);
  const unread = useAppSelector((state) => state.notifications.unreadCount);

  const load = useCallback(() => {
    void dispatch(fetchNotifications());
  }, [dispatch]);

  useEffect(() => {
    load();
  }, [load]);

  const all = [...local, ...items];

  return (
    <Screen padded={false} testID="notifications-screen">
      {unread > 0 ? (
        <Pressable
          accessibilityRole="button"
          testID="mark-all-read"
          onPress={() => void dispatch(markAllRead())}
          style={styles.markAll}
        >
          <Text style={[typography.bodyStrong, { color: theme.colors.primary }]}>
            Mark all as read ({unread})
          </Text>
        </Pressable>
      ) : null}

      {all.length === 0 && !loading ? (
        <EmptyState
          testID="notifications-empty"
          title="You’re all caught up"
          message="Security alerts and payment updates arrive here."
        />
      ) : (
        <FlatList
          testID="notifications-list"
          data={all}
          keyExtractor={(item) => item.id}
          refreshing={loading}
          onRefresh={load}
          contentContainerStyle={styles.content}
          renderItem={({ item }) => {
            const isUnread = !item.readAt;
            return (
              <Pressable
                testID={`notification-${item.id}`}
                accessibilityRole="button"
                onPress={() => {
                  if (isUnread && !item.id.startsWith('local-')) void dispatch(markRead(item.id));
                }}
                style={[
                  styles.item,
                  {
                    backgroundColor: isUnread ? theme.colors.surfaceAlt : theme.colors.surface,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.md,
                  },
                ]}
              >
                <View style={styles.row}>
                  <Text style={[typography.bodyStrong, { color: theme.colors.text, flex: 1 }]}>{item.title}</Text>
                  <Text style={[typography.micro, { color: theme.colors.textMuted }]}>
                    {formatRelative(item.createdAt)}
                  </Text>
                </View>
                <Text style={[typography.caption, { color: theme.colors.textMuted }]}>{item.body}</Text>
              </Pressable>
            );
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 10,
  },
  markAll: {
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  item: {
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
});

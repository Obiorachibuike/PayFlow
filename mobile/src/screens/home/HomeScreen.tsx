import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/Screen';
import { BalanceHeader } from '../../components/BalanceHeader';
import { QuickActions, type QuickAction } from '../../components/QuickActions';
import { TransactionRow } from '../../components/TransactionRow';
import { EmptyState } from '../../components/EmptyState';
import { StatTile } from '../../components/StatTile';
import { DemoBanner } from '../../components/DemoBanner';
import { Sparkline } from '../../components/Sparkline';
import { useTheme } from '../../theme/ThemeProvider';
import { typography } from '../../theme/colors';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchWallet, refreshBalance } from '../../store/slices/walletSlice';
import { fetchNotifications } from '../../store/slices/notificationsSlice';
import { toggleHideBalances } from '../../store/slices/settingsSlice';
import { formatNaira } from '../../utils/money';
import type { HomeStackParamList, RootStackParamList } from '../../navigation/types';
import { useCallback, useEffect, useMemo } from 'react';

type Navigation = NativeStackNavigationProp<HomeStackParamList & RootStackParamList>;

export function HomeScreen() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const navigation = useNavigation<Navigation>();

  const wallet = useAppSelector((state) => state.wallet.wallet);
  const stats = useAppSelector((state) => state.wallet.stats);
  const recent = useAppSelector((state) => state.wallet.recent);
  const refreshing = useAppSelector((state) => state.wallet.refreshing || state.wallet.loading);
  const hideBalances = useAppSelector((state) => state.settings.hideBalances);
  const user = useAppSelector((state) => state.auth.user);
  const unread = useAppSelector((state) => state.notifications.unreadCount);

  const load = useCallback(() => {
    void dispatch(fetchWallet());
    void dispatch(fetchNotifications());
  }, [dispatch]);

  useEffect(() => {
    load();
  }, [load]);

  const firstName = user?.fullName?.split(' ')[0] ?? 'there';

  const actions = useMemo<QuickAction[]>(
    () => [
      {
        key: 'fund',
        label: 'Add money',
        icon: 'add-outline',
        testID: 'quick-fund',
        onPress: () => navigation.navigate('FundWallet'),
      },
      {
        key: 'send',
        label: 'Send',
        icon: 'arrow-up-outline',
        testID: 'quick-send',
        onPress: () => navigation.navigate('SendMoney'),
      },
      {
        key: 'withdraw',
        label: 'Withdraw',
        icon: 'arrow-down-outline',
        testID: 'quick-withdraw',
        onPress: () => navigation.navigate('Withdraw'),
      },
      {
        key: 'beneficiaries',
        label: 'Beneficiaries',
        icon: 'people-outline',
        testID: 'quick-beneficiaries',
        onPress: () => navigation.navigate('Beneficiaries' as never),
      },
    ],
    [navigation],
  );

  const trend = useMemo(() => {
    // Demo-only trend: the last six balances derived from recent activity.
    const balance = wallet?.balanceMinor ?? 0;
    return recent
      .slice(0, 6)
      .reduce<number[]>((series, transaction) => {
        const next = (series[series.length - 1] ?? balance) - transaction.signedAmountMinor;
        return [...series, Math.max(0, next)];
      }, [])
      .reverse();
  }, [recent, wallet?.balanceMinor]);

  return (
    <Screen
      scroll
      refreshing={refreshing}
      onRefresh={() => {
        load();
        void dispatch(refreshBalance());
      }}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <View>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
            {new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'}
          </Text>
          <Text testID="home-greeting" style={[styles.name, { color: theme.colors.text }]}>
            {firstName}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Notifications${unread ? `, ${unread} unread` : ''}`}
          testID="home-notifications"
          onPress={() => navigation.navigate('Notifications')}
          style={styles.bell}
        >
          <Ionicons name="notifications-outline" size={22} color={theme.colors.text} />
          {unread > 0 ? (
            <View style={[styles.badge, { backgroundColor: theme.colors.primary }]}>
              <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <DemoBanner compact message="Demo wallet. Balances are simulated or funded with Paystack test keys." />

      <BalanceHeader
        balanceMinor={wallet?.balanceMinor ?? 0}
        currency={wallet?.currency ?? 'NGN'}
        walletTag={wallet?.maskedWalletTag ?? 'PF-****-0000'}
        hidden={hideBalances}
        onToggleHidden={() => dispatch(toggleHideBalances())}
        refreshing={refreshing}
        onRefresh={() => void dispatch(refreshBalance())}
      />

      <QuickActions actions={actions} />

      <View style={styles.statsRow}>
        <StatTile
          testID="stat-money-in"
          label="Money in"
          value={hideBalances ? '••••' : formatNaira(stats?.monthReceivedMinor ?? 0)}
          caption="This month"
          tone="success"
        />
        <StatTile
          testID="stat-money-out"
          label="Money out"
          value={hideBalances ? '••••' : formatNaira(stats?.monthSpentMinor ?? 0)}
          caption="This month"
        />
      </View>

      {trend.length > 1 ? (
        <View
          style={[
            styles.trend,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.lg },
          ]}
        >
          <Text style={[typography.micro, { color: theme.colors.textMuted }]}>RECENT BALANCE TREND (DEMO)</Text>
          <Sparkline data={trend} />
        </View>
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={[typography.subtitle, { color: theme.colors.text }]}>Recent activity</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate('Transactions' as never)}
          testID="see-all-transactions"
        >
          <Text style={[typography.bodyStrong, { color: theme.colors.primary }]}>See all</Text>
        </Pressable>
      </View>

      {recent.length === 0 ? (
        <EmptyState
          testID="home-empty"
          title="No activity yet"
          message="Add demo money to your wallet, then send some to a friend to see the ledger in action."
        />
      ) : (
        recent
          .slice(0, 6)
          .map((transaction) => (
            <TransactionRow
              key={transaction.id}
              transaction={transaction}
              testID={`home-transaction-${transaction.id}`}
              onPress={(item) => navigation.navigate('TransactionDetails', { transactionId: item.id })}
            />
          ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 40,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  name: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  bell: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(129, 139, 131, 0.4)',
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#101510',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  trend: {
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
});

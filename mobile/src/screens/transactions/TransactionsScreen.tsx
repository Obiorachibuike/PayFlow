import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/Screen';
import { SegmentedControl } from '../../components/SegmentedControl';
import { TransactionRow } from '../../components/TransactionRow';
import { EmptyState } from '../../components/EmptyState';
import { useTheme } from '../../theme/ThemeProvider';
import { typography } from '../../theme/colors';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { clearFilters, fetchTransactions, setFilter } from '../../store/slices/transactionsSlice';
import type { Transaction } from '../../types/api';
import type { TransactionsStackParamList } from '../../navigation/types';
import { useCallback, useEffect, useState } from 'react';

type DirectionFilter = 'ALL' | 'in' | 'out';
type StatusFilter = 'ALL' | 'SUCCESSFUL' | 'PENDING' | 'FAILED';

export function TransactionsScreen() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const navigation = useNavigation<NativeStackNavigationProp<TransactionsStackParamList>>();

  const items = useAppSelector((state) => state.transactions.items);
  const filters = useAppSelector((state) => state.transactions.filters);
  const loading = useAppSelector((state) => state.transactions.loading);
  const refreshing = useAppSelector((state) => state.transactions.refreshing);
  const loadingMore = useAppSelector((state) => state.transactions.loadingMore);
  const hasMore = useAppSelector((state) => state.transactions.hasMore);

  const [search, setSearch] = useState('');

  const reload = useCallback(() => {
    void dispatch(fetchTransactions({ refresh: true }));
  }, [dispatch]);

  useEffect(() => {
    reload();
  }, [reload, filters]);

  useEffect(() => {
    const timer = setTimeout(() => {
      dispatch(setFilter({ search }));
    }, 350);
    return () => clearTimeout(timer);
  }, [search, dispatch]);

  const directionSegments: Array<{ value: DirectionFilter; label: string }> = [
    { value: 'ALL', label: 'All' },
    { value: 'in', label: 'Money in' },
    { value: 'out', label: 'Money out' },
  ];

  const statusSegments: Array<{ value: StatusFilter; label: string }> = [
    { value: 'ALL', label: 'Any' },
    { value: 'SUCCESSFUL', label: 'Done' },
    { value: 'PENDING', label: 'Pending' },
    { value: 'FAILED', label: 'Failed' },
  ];

  const renderItem = ({ item }: { item: Transaction }) => (
    <TransactionRow
      transaction={item}
      testID={`transaction-row-${item.id}`}
      onPress={(transaction) => navigation.navigate('TransactionDetails', { transactionId: transaction.id })}
    />
  );

  return (
    <Screen padded={false} testID="transactions-screen" contentContainerStyle={styles.content}>
      <View style={styles.searchRow}>
        <View
          style={[
            styles.search,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.pill,
            },
          ]}
        >
          <Ionicons name="search-outline" size={18} color={theme.colors.textMuted} />
          <TextInput
            testID="transactions-search"
            accessibilityLabel="Search transactions"
            value={search}
            onChangeText={setSearch}
            placeholder="Search name, reference or note"
            placeholderTextColor={theme.colors.textMuted}
            style={[typography.body, { color: theme.colors.text, flex: 1, marginLeft: 8 }]}
          />
        </View>
      </View>

      <SegmentedControl<DirectionFilter>
        testID="direction-filter"
        segments={directionSegments}
        value={(filters.direction ?? 'ALL') as DirectionFilter}
        onChange={(value) => dispatch(setFilter({ direction: value }))}
      />
      <SegmentedControl<StatusFilter>
        testID="status-filter"
        segments={statusSegments}
        value={(filters.status ?? 'ALL') as StatusFilter}
        onChange={(value) => dispatch(setFilter({ status: value }))}
      />

      {items.length === 0 && !loading ? (
        <EmptyState
          testID="transactions-empty"
          title="Nothing here yet"
          message={
            filters.search || filters.direction !== 'ALL' || filters.status !== 'ALL'
              ? 'No transactions match these filters. Try clearing them.'
              : 'Your funding, transfers and withdrawals will show up here.'
          }
          action={
            filters.search || filters.direction !== 'ALL' || filters.status !== 'ALL' ? (
              <Text
                accessibilityRole="button"
                testID="clear-filters"
                onPress={() => {
                  setSearch('');
                  dispatch(clearFilters());
                }}
                style={[typography.bodyStrong, { color: theme.colors.primary }]}
              >
                Clear filters
              </Text>
            ) : undefined
          }
        />
      ) : (
        <FlatList
          testID="transactions-list"
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshing={refreshing || loading}
          onRefresh={reload}
          onEndReached={() => {
            if (hasMore && !loadingMore) void dispatch(fetchTransactions({ refresh: false }));
          }}
          onEndReachedThreshold={0.4}
          contentContainerStyle={styles.list}
          ListFooterComponent={
            loadingMore ? (
              <Text style={[typography.caption, { color: theme.colors.textMuted, paddingVertical: 16 }]}>
                Loading more…
              </Text>
            ) : undefined
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    gap: 12,
    flexGrow: 1,
  },
  searchRow: {
    marginTop: 8,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  list: {
    paddingBottom: 40,
  },
});

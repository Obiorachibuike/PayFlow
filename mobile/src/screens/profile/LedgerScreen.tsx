import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { useTheme } from '../../theme/ThemeProvider';
import { typography } from '../../theme/colors';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchLedger } from '../../store/slices/walletSlice';
import { formatNaira } from '../../utils/money';
import { formatDateTime } from '../../utils/format';
import { useCallback, useEffect } from 'react';

/**
 * Read-only view of the ledger entries behind the wallet balance. Every entry is
 * immutable: a correction is a new entry, never an edit.
 */
export function LedgerScreen() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const entries = useAppSelector((state) => state.wallet.ledger);

  const load = useCallback(() => {
    void dispatch(fetchLedger(50));
  }, [dispatch]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content} testID="ledger-screen">
        <Card>
          <Text style={[typography.body, { color: theme.colors.textMuted }]}>
            Each wallet movement posts two balanced entries — a debit and a credit — in kobo. Entries can never be
            edited or deleted; a reversal posts new entries pointing the other way.
          </Text>
        </Card>

        {entries.length === 0 ? (
          <EmptyState
            testID="ledger-empty"
            title="No entries yet"
            message="Fund your wallet or make a transfer and the ledger entries will appear here."
          />
        ) : (
          entries.map((entry) => (
            <View
              key={entry.id}
              testID={`ledger-entry-${entry.id}`}
              style={[
                styles.entry,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radius.md,
                },
              ]}
            >
              <View style={styles.entryTop}>
                <Text
                  style={[
                    typography.micro,
                    { color: entry.direction === 'CREDIT' ? theme.colors.success : theme.colors.error },
                  ]}
                >
                  {entry.direction}
                </Text>
                <Text style={[typography.bodyStrong, { color: theme.colors.text }]}>
                  {entry.direction === 'CREDIT' ? '+' : '-'}
                  {formatNaira(entry.amountMinor)}
                </Text>
              </View>
              <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                {entry.description ?? entry.type}
              </Text>
              <Text style={[typography.micro, { color: theme.colors.textMuted, marginTop: 4 }]}>
                {entry.reference ?? 'no reference'} · {formatDateTime(entry.createdAt)}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 10,
    paddingBottom: 40,
  },
  entry: {
    borderWidth: 1,
    padding: 14,
    gap: 4,
  },
  entryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});

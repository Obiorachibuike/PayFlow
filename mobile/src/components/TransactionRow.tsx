import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { typography } from '../theme/colors';
import { Avatar } from './Avatar';
import { formatNaira, formatSignedNaira } from '../utils/money';
import { formatRelative } from '../utils/format';
import type { Transaction } from '../types/api';

interface TransactionRowProps {
  transaction: Transaction;
  onPress?: (transaction: Transaction) => void;
  testID?: string;
}

const STATUS_COPY: Record<string, string> = {
  PENDING: 'Pending',
  PROCESSING: 'Processing',
  SUCCESSFUL: 'Successful',
  FAILED: 'Failed',
  REVERSED: 'Reversed',
};

export function TransactionRow({ transaction, onPress, testID }: TransactionRowProps) {
  const theme = useTheme();
  const incoming = transaction.direction === 'in';
  const failed = transaction.status === 'FAILED';
  const pending = transaction.status === 'PENDING' || transaction.status === 'PROCESSING';

  const accent = incoming ? theme.colors.success : theme.colors.text;
  const amountColor = failed ? theme.colors.error : pending ? theme.colors.warning : accent;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${transaction.title}, ${formatNaira(transaction.amountMinor)}, ${
        incoming ? 'money in' : 'money out'
      }`}
      onPress={() => onPress?.(transaction)}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: theme.colors.border, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Avatar
        name={transaction.counterparty ?? transaction.title}
        color={incoming ? theme.colors.primarySoft : theme.colors.surfaceAlt}
        size={40}
      />

      <View style={styles.textBlock}>
        <Text numberOfLines={1} style={[typography.bodyStrong, { color: theme.colors.text }]}>
          {transaction.title}
        </Text>
        <Text numberOfLines={1} style={[typography.caption, { color: theme.colors.textMuted }]}>
          {failed
            ? (transaction.failureReason ?? STATUS_COPY[transaction.status] ?? transaction.status)
            : `${formatRelative(transaction.createdAt)} · ${
                STATUS_COPY[transaction.status] ?? transaction.status
              }`}
        </Text>
      </View>

      <View style={styles.amountBlock}>
        <Text style={[typography.bodyStrong, { color: amountColor }]}>
          {formatSignedNaira(transaction.signedAmountMinor)}
        </Text>
        {pending ? (
          <Text style={[typography.micro, { color: theme.colors.warning }]}>IN PROGRESS</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  textBlock: {
    flex: 1,
    marginHorizontal: 12,
  },
  amountBlock: {
    alignItems: 'flex-end',
  },
});

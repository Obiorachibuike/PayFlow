import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { useTheme } from '../../theme/ThemeProvider';
import { typography } from '../../theme/colors';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchReceipt, fetchTransaction } from '../../store/slices/transactionsSlice';
import { formatNaira } from '../../utils/money';
import { formatDateTime, maskAccountNumber, titleCase } from '../../utils/format';
import type { Receipt } from '../../types/api';
import type { ActivityStackParamList, HomeStackParamList, TransactionsStackParamList } from '../../navigation/types';
import { useEffect, useState } from 'react';

type Route = RouteProp<
  HomeStackParamList & TransactionsStackParamList & ActivityStackParamList,
  'TransactionDetails'
>;

function buildReceiptHtml(receipt: Receipt): string {
  const rows: Array<[string, string]> = [
    ['Reference', receipt.reference],
    ['Type', titleCase(receipt.type.replace('_', ' '))],
    ['Status', titleCase(receipt.status)],
    ['Amount', receipt.amountFormatted],
    ['Fee', formatNaira(receipt.feeMinor)],
    ['Issued', formatDateTime(receipt.issuedAt)],
  ];

  if (receipt.senderName || receipt.recipientName) {
    rows.push(['From / To', `${receipt.senderName ?? 'PayFlow'} → ${receipt.recipientName ?? 'PayFlow'}`]);
  }
  if (receipt.withdrawal) {
    rows.push(['Bank', `${receipt.withdrawal.bankName} · ${maskAccountNumber(receipt.withdrawal.accountNumberLast4)}`]);
    rows.push(['Account name', receipt.withdrawal.accountName]);
  }
  if (receipt.ledgerReference) rows.push(['Ledger entry', receipt.ledgerReference]);

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { font-family: -apple-system, Helvetica, Arial; padding: 32px; color: #101510; }
    h1 { color: #101510; margin-bottom: 4px; }
    .badge { display:inline-block; background:#E8FBE3; color:#101510; padding:4px 10px; border-radius:999px; font-size:12px; font-weight:700; margin-bottom: 20px;}
    table { width: 100%; border-collapse: collapse; }
    td { padding: 10px 0; border-bottom: 1px solid #E3E9E3; font-size: 14px; }
    td:first-child { color: #818B83; width: 40%; }
    .amount { font-size: 30px; font-weight: 800; margin: 12px 0 24px; }
    footer { margin-top: 28px; font-size: 11px; color: #818B83; }
  </style></head><body>
    <h1>${receipt.branding.name}</h1>
    <div class="badge">${receipt.simulated ? 'DEMO / SIMULATED TRANSACTION' : 'PAYSTACK TEST TRANSACTION'}</div>
    <div class="amount">${receipt.amountFormatted}</div>
    <table>${rows.map(([label, value]) => `<tr><td>${label}</td><td>${value}</td></tr>`).join('')}</table>
    <footer>${receipt.branding.name} is a portfolio demo. ${
      receipt.simulated
        ? 'This movement was simulated and no bank was contacted.'
        : 'Funded with Paystack test keys — no real money moved.'
    } Contact ${receipt.branding.supportEmail}.</footer>
  </body></html>`;
}

export function TransactionDetailsScreen() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const route = useRoute<Route>();
  const transactionId = route.params?.transactionId;

  const transaction = useAppSelector((state) => state.transactions.selected);
  const receipt = useAppSelector((state) => state.transactions.receipt);
  const loadingReceipt = useAppSelector((state) => state.transactions.loadingReceipt);

  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (!transactionId) return;
    void dispatch(fetchTransaction(transactionId));
    void dispatch(fetchReceipt(transactionId));
  }, [dispatch, transactionId]);

  const shareReceipt = async () => {
    if (!receipt) return;
    setSharing(true);
    try {
      const { uri } = await Print.printToFileAsync({ html: buildReceiptHtml(receipt) });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `PayFlow receipt ${receipt.reference}` });
      }
    } finally {
      setSharing(false);
    }
  };

  if (!transaction) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: theme.colors.background }]}>
        <Text style={[typography.body, { color: theme.colors.textMuted }]}>Loading transaction…</Text>
      </SafeAreaView>
    );
  }

  const rows: Array<[string, string]> = [
    ['Reference', transaction.reference],
    ['Status', titleCase(transaction.status)],
    ['Type', titleCase(transaction.type.replace('_', ' '))],
    ['Amount', transaction.amountFormatted],
    ['Fee', formatNaira(transaction.feeMinor)],
    ['Created', formatDateTime(transaction.createdAt)],
    ['Completed', transaction.completedAt ? formatDateTime(transaction.completedAt) : '—'],
  ];

  if (transaction.counterparty) rows.splice(3, 0, ['Counterparty', transaction.counterparty]);
  if (transaction.description) rows.push(['Note', transaction.description]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.content} testID="transaction-details">
        <View style={styles.hero}>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
            {transaction.direction === 'in' ? 'You received' : 'You sent'}
          </Text>
          <Text
            testID="transaction-amount"
            style={[
              styles.amount,
              {
                color:
                  transaction.status === 'FAILED'
                    ? theme.colors.error
                    : transaction.direction === 'in'
                      ? theme.colors.success
                      : theme.colors.text,
              },
            ]}
          >
            {formatNaira(transaction.amountMinor)}
          </Text>
          {transaction.status !== 'SUCCESSFUL' ? (
            <View style={[styles.statusChip, { backgroundColor: theme.colors.surfaceAlt }]}>
              <Text style={[typography.micro, { color: theme.colors.warning }]}>{titleCase(transaction.status)}</Text>
            </View>
          ) : null}
        </View>

        <Card>
          {rows.map(([label, value]) => (
            <View key={label} style={styles.row}>
              <Text style={[typography.body, { color: theme.colors.textMuted }]}>{label}</Text>
              <Text style={[typography.bodyStrong, { color: theme.colors.text, flexShrink: 1, textAlign: 'right' }]}>
                {value}
              </Text>
            </View>
          ))}
        </Card>

        {receipt?.simulated ? (
          <View style={[styles.notice, { backgroundColor: theme.colors.warning }]}>
            <Text style={[typography.caption, styles.noticeText]}>
              DEMO · This movement was simulated. No bank or card network was involved.
            </Text>
          </View>
        ) : null}

        <Button
          testID="share-receipt"
          label={loadingReceipt ? 'Preparing receipt…' : 'Share PDF receipt'}
          variant="secondary"
          loading={sharing}
          disabled={!receipt || loadingReceipt}
          onPress={() => void shareReceipt()}
          icon={<Ionicons name="share-outline" size={18} color={theme.colors.text} />}
        />

        {receipt ? (
          <Pressable
            accessibilityRole="button"
            style={styles.link}
            onPress={() => void dispatch(fetchReceipt(transaction.id))}
          >
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
              Receipt reference {receipt.reference} · ledger {receipt.ledgerReference ?? 'pending'}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 20,
    gap: 16,
    paddingBottom: 40,
  },
  hero: {
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  amount: {
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -1,
  },
  statusChip: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    marginTop: 6,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 16,
  },
  notice: {
    borderRadius: 12,
    padding: 12,
  },
  noticeText: {
    color: '#101510',
    fontWeight: '700',
  },
  link: {
    alignItems: 'center',
    paddingVertical: 8,
  },
});

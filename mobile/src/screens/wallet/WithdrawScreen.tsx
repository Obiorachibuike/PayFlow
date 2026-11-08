import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/Screen';
import { Button } from '../../components/Button';
import { AmountInput } from '../../components/AmountInput';
import { TextField } from '../../components/TextField';
import { Sheet } from '../../components/Sheet';
import { PinPad } from '../../components/PinPad';
import { DemoBanner } from '../../components/DemoBanner';
import { EmptyState } from '../../components/EmptyState';
import { useTheme } from '../../theme/ThemeProvider';
import { typography } from '../../theme/colors';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { clearOperationError, withdraw } from '../../store/slices/operationsSlice';
import { fetchBeneficiaries } from '../../store/slices/beneficiariesSlice';
import { fetchTransactions } from '../../store/slices/transactionsSlice';
import { fetchWallet } from '../../store/slices/walletSlice';
import { APP } from '../../constants/config';
import { formatNaira } from '../../utils/money';
import { isValidNigerianAccountNumber } from '../../utils/validation';
import type { RootStackParamList } from '../../navigation/types';
import { useEffect, useMemo, useState } from 'react';

export function WithdrawScreen() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const beneficiaries = useAppSelector((state) => state.beneficiaries.items);
  const { withdrawing, lastWithdrawal, error } = useAppSelector((state) => state.operations);
  const balanceMinor = useAppSelector((state) => state.wallet.wallet?.balanceMinor ?? 0);

  const [beneficiaryId, setBeneficiaryId] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [bankCode, setBankCode] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [amountMinor, setAmountMinor] = useState(0);
  const [narration, setNarration] = useState('');
  const [pinOpen, setPinOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    void dispatch(fetchBeneficiaries());
  }, [dispatch]);

  const destination = useMemo(() => {
    if (beneficiaryId) return beneficiaries.find((item) => item.id === beneficiaryId) ?? null;
    if (accountNumber.length === 10 && bankName && accountName) {
      return {
        id: 'manual',
        accountName,
        bankName,
        accountNumberMasked: `******${accountNumber.slice(-4)}`,
      };
    }
    return null;
  }, [beneficiaryId, beneficiaries, accountNumber, bankName, accountName]);

  const submit = async (pin: string) => {
    setLocalError(null);
    if (!destination) {
      setLocalError('Choose a saved account or enter bank details.');
      return;
    }

    const result = await dispatch(
      withdraw({
        amountMinor,
        beneficiaryId: beneficiaryId ?? undefined,
        bankCode: beneficiaryId ? undefined : bankCode,
        bankName: beneficiaryId ? undefined : bankName,
        accountName: beneficiaryId ? undefined : accountName,
        accountNumber: beneficiaryId ? undefined : accountNumber,
        narration: narration.trim() || undefined,
        pin,
      }),
    );

    if (withdraw.fulfilled.match(result)) {
      setPinOpen(false);
      await dispatch(fetchWallet());
      await dispatch(fetchTransactions({ refresh: true }));
    }
  };

  const settled = lastWithdrawal?.withdrawal;

  if (settled) {
    return (
      <Screen contentContainerStyle={styles.content}>
        <View style={styles.doneBlock}>
          <Ionicons name="checkmark-circle" size={56} color={theme.colors.success} />
          <Text testID="withdraw-success" style={[styles.doneTitle, { color: theme.colors.text }]}>
            {formatNaira(settled.amountMinor)} withdrawn
          </Text>
          <Text style={[typography.body, { color: theme.colors.textMuted, textAlign: 'center' }]}>
            Simulated payout to {settled.bankName} · {settled.accountNumberMasked}
          </Text>
          <View style={[styles.notice, { backgroundColor: theme.colors.warning }]}>
            <Text style={[typography.caption, styles.noticeText]}>
              DEMO · The money left your PayFlow wallet into the sandbox clearing account. No bank transfer was
              made.
            </Text>
          </View>
          <Button testID="withdraw-done" label="Done" size="lg" onPress={() => navigation.goBack()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={() => navigation.goBack()} testID="withdraw-close">
          <Ionicons name="close" size={24} color={theme.colors.text} />
        </Pressable>
        <Text style={[typography.subtitle, { color: theme.colors.text }]}>Withdraw</Text>
        <View style={{ width: 24 }} />
      </View>

      <DemoBanner compact message="Simulated payouts only. PayFlow never sends money to a real bank account." />

      <AmountInput
        testID="withdraw-amount"
        valueMinor={amountMinor}
        onChangeMinor={setAmountMinor}
        minMinor={APP.minWithdrawalMinor}
        maxMinor={APP.maxWithdrawalMinor}
        hint={`Available ${formatNaira(balanceMinor)}`}
        error={amountMinor > balanceMinor ? 'That is more than your available balance.' : null}
      />

      <Text style={[typography.caption, { color: theme.colors.textMuted }]}>Send to</Text>

      {!showManual ? (
        beneficiaries.length === 0 ? (
          <EmptyState
            testID="withdraw-no-beneficiaries"
            title="No saved accounts"
            message="Add a beneficiary, or enter bank details for this withdrawal only."
            action={
              <Button
                testID="withdraw-manual"
                label="Enter bank details"
                variant="secondary"
                onPress={() => setShowManual(true)}
              />
            }
          />
        ) : (
          <View style={styles.list}>
            {beneficiaries.map((beneficiary) => {
              const active = beneficiaryId === beneficiary.id;
              return (
                <Pressable
                  key={beneficiary.id}
                  testID={`withdraw-beneficiary-${beneficiary.id}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setBeneficiaryId(beneficiary.id)}
                  style={[
                    styles.beneficiary,
                    {
                      borderColor: active ? theme.colors.primary : theme.colors.border,
                      backgroundColor: active ? theme.colors.primarySoft : theme.colors.surface,
                      borderRadius: theme.radius.md,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[typography.bodyStrong, { color: theme.colors.text }]}>
                      {beneficiary.accountName}
                    </Text>
                    <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                      {beneficiary.bankName} · {beneficiary.accountNumberMasked}
                      {beneficiary.verified ? '' : ' · unverified'}
                    </Text>
                  </View>
                  {active ? <Ionicons name="checkmark-circle" size={20} color={theme.colors.primary} /> : null}
                </Pressable>
              );
            })}
            <Pressable
              accessibilityRole="button"
              testID="withdraw-use-manual"
              onPress={() => {
                setBeneficiaryId(null);
                setShowManual(true);
              }}
              style={styles.manualLink}
            >
              <Text style={[typography.bodyStrong, { color: theme.colors.primary }]}>Use another account</Text>
            </Pressable>
          </View>
        )
      ) : (
        <View style={styles.list}>
          <TextField
            testID="withdraw-account-number"
            label="Account number"
            value={accountNumber}
            onChangeText={setAccountNumber}
            keyboardType="number-pad"
            maxLength={10}
            placeholder="0123456789"
            error={accountNumber.length === 10 && !isValidNigerianAccountNumber(accountNumber) ? '10 digits required' : null}
          />
          <TextField
            testID="withdraw-bank-code"
            label="Bank code"
            value={bankCode}
            onChangeText={setBankCode}
            keyboardType="number-pad"
            maxLength={3}
            placeholder="058"
          />
          <TextField
            testID="withdraw-bank-name"
            label="Bank name"
            value={bankName}
            onChangeText={setBankName}
            placeholder="GTBank"
          />
          <TextField
            testID="withdraw-account-name"
            label="Account name"
            value={accountName}
            onChangeText={setAccountName}
            placeholder="As it should appear on the receipt"
          />
          <Pressable
            accessibilityRole="button"
            testID="withdraw-use-beneficiary"
            onPress={() => setShowManual(false)}
            style={styles.manualLink}
          >
            <Text style={[typography.bodyStrong, { color: theme.colors.primary }]}>Pick a saved account</Text>
          </Pressable>
        </View>
      )}

      <TextField
        testID="withdraw-narration"
        label="Note (optional)"
        value={narration}
        onChangeText={setNarration}
        maxLength={140}
        placeholder="What is this for?"
      />

      {error || localError ? (
        <Text testID="withdraw-error" accessibilityRole="alert" style={[styles.error, { color: theme.colors.error }]}>
          {localError ?? error}
        </Text>
      ) : null}

      <Button
        testID="withdraw-continue"
        label="Withdraw"
        size="lg"
        disabled={!destination || amountMinor < APP.minWithdrawalMinor || amountMinor > balanceMinor}
        onPress={() => {
          dispatch(clearOperationError());
          setPinOpen(true);
        }}
      />

      <Sheet
        visible={pinOpen}
        title={`Enter your PIN to withdraw ${formatNaira(amountMinor)}`}
        onClose={() => setPinOpen(false)}
      >
        <ScrollView>
          {error ? (
            <Text accessibilityRole="alert" style={[styles.error, { color: theme.colors.error }]}>
              {error}
            </Text>
          ) : null}
          <PinPad testID="withdraw-pin" busy={withdrawing} onComplete={(pin) => void submit(pin)} error={error} />
          <Text style={[typography.caption, { color: theme.colors.textMuted, textAlign: 'center', marginTop: 12 }]}>
            This is a simulated payout: your wallet is debited, no bank is contacted.
          </Text>
        </ScrollView>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 14,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  list: {
    gap: 10,
  },
  beneficiary: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  manualLink: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
  },
  error: {
    textAlign: 'center',
  },
  doneBlock: {
    alignItems: 'center',
    gap: 14,
    paddingVertical: 32,
  },
  doneTitle: {
    fontSize: 26,
    fontWeight: '800',
  },
  notice: {
    borderRadius: 12,
    padding: 12,
  },
  noticeText: {
    color: '#101510',
    fontWeight: '700',
  },
});

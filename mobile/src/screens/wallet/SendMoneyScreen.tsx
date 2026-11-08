import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/Screen';
import { Button } from '../../components/Button';
import { AmountInput } from '../../components/AmountInput';
import { TextField } from '../../components/TextField';
import { Sheet } from '../../components/Sheet';
import { PinPad } from '../../components/PinPad';
import { Avatar } from '../../components/Avatar';
import { DemoBanner } from '../../components/DemoBanner';
import { useTheme } from '../../theme/ThemeProvider';
import { typography } from '../../theme/colors';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  clearIdempotencyKeys,
  clearLookup,
  clearOperationError,
  lookupRecipient,
  sendTransfer,
} from '../../store/slices/operationsSlice';
import { fetchTransactions } from '../../store/slices/transactionsSlice';
import { fetchWallet } from '../../store/slices/walletSlice';
import { APP } from '../../constants/config';
import { formatNaira } from '../../utils/money';
import type { RootStackParamList } from '../../navigation/types';
import { useEffect, useState } from 'react';

type Step = 'recipient' | 'amount' | 'pin' | 'done';

export function SendMoneyScreen() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const { looking, lookup, sending, lastTransfer, error, errorCode } = useAppSelector((state) => state.operations);
  const balanceMinor = useAppSelector((state) => state.wallet.wallet?.balanceMinor ?? 0);

  const [step, setStep] = useState<Step>('recipient');
  const [identifier, setIdentifier] = useState('');
  const [narration, setNarration] = useState('');
  const [amountMinor, setAmountMinor] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      dispatch(clearLookup());
      dispatch(clearOperationError());
      dispatch(clearIdempotencyKeys());
    };
  }, [dispatch]);

  const findRecipient = async () => {
    setLocalError(null);
    const value = identifier.trim();
    if (value.length < 3) {
      setLocalError('Enter an email, phone number or PayFlow tag.');
      return;
    }
    const isEmail = value.includes('@');
    const isTag = /^PF-\d{4}-\d{4}$/i.test(value);
    const result = await dispatch(
      lookupRecipient(isEmail ? { email: value } : isTag ? { walletTag: value } : { phone: value }),
    );
    if (lookupRecipient.fulfilled.match(result)) setStep('amount');
  };

  const submitTransfer = async (pin: string) => {
    if (!lookup) return;
    const result = await dispatch(
      sendTransfer({
        recipient: { walletTag: lookup.walletTag },
        amountMinor,
        description: narration.trim() || undefined,
        pin,
      }),
    );

    if (sendTransfer.fulfilled.match(result)) {
      setStep('done');
      await dispatch(fetchWallet());
      await dispatch(fetchTransactions({ refresh: true }));
    }
  };

  const insufficient = amountMinor > balanceMinor;

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={() => navigation.goBack()} testID="send-close">
          <Ionicons name="close" size={24} color={theme.colors.text} />
        </Pressable>
        <Text style={[typography.subtitle, { color: theme.colors.text }]}>Send money</Text>
        <View style={{ width: 24 }} />
      </View>

      <DemoBanner compact message="Transfers move demo balances between PayFlow wallets." />

      {step === 'recipient' ? (
        <>
          <TextField
            testID="send-identifier"
            label="Send to"
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            placeholder="email, phone or PF-1234-5678"
            error={localError ?? error ?? null}
          />
          <Button
            testID="send-lookup"
            label="Continue"
            size="lg"
            loading={looking}
            onPress={() => void findRecipient()}
          />
        </>
      ) : null}

      {step === 'amount' && lookup ? (
        <>
          <View style={styles.recipientRow}>
            <Avatar name={lookup.name} size={44} />
            <View style={{ flex: 1 }}>
              <Text testID="send-recipient-name" style={[typography.bodyStrong, { color: theme.colors.text }]}>
                {lookup.name}
              </Text>
              <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                {lookup.maskedWalletTag}
                {lookup.verified ? ' · verified' : ''}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              testID="send-change-recipient"
              onPress={() => {
                dispatch(clearLookup());
                setStep('recipient');
              }}
            >
              <Text style={[typography.bodyStrong, { color: theme.colors.primary }]}>Change</Text>
            </Pressable>
          </View>

          <AmountInput
            testID="send-amount"
            valueMinor={amountMinor}
            onChangeMinor={setAmountMinor}
            minMinor={APP.minTransferMinor}
            maxMinor={APP.maxTransferMinor}
            hint={`Available ${formatNaira(balanceMinor)}`}
            error={insufficient ? 'That is more than your available balance.' : null}
          />

          <TextField
            testID="send-narration"
            label="Note (optional)"
            value={narration}
            onChangeText={setNarration}
            maxLength={140}
            placeholder="What is this for?"
          />

          <Button
            testID="send-continue"
            label="Continue"
            size="lg"
            disabled={amountMinor < APP.minTransferMinor || insufficient}
            onPress={() => setStep('pin')}
          />
        </>
      ) : null}

      {step === 'done' && lastTransfer ? (
        <View style={styles.doneBlock}>
          <Ionicons name="checkmark-circle" size={56} color={theme.colors.success} />
          <Text testID="send-success" style={[styles.doneTitle, { color: theme.colors.text }]}>
            {formatNaira(lastTransfer.transaction.amountMinor)} sent
          </Text>
          <Text style={[typography.body, { color: theme.colors.textMuted, textAlign: 'center' }]}>
            {lastTransfer.transaction.recipientName} · {lastTransfer.transaction.reference}
          </Text>
          <Button testID="send-done" label="Done" size="lg" onPress={() => navigation.goBack()} />
        </View>
      ) : null}

      <Sheet
        visible={step === 'pin'}
        title={`Enter your PIN to send ${formatNaira(amountMinor)}`}
        onClose={() => setStep('amount')}
      >
        {error || errorCode === 'INSUFFICIENT_FUNDS' ? (
          <Text accessibilityRole="alert" style={[styles.error, { color: theme.colors.error }]}>
            {error ?? 'Insufficient balance.'}
          </Text>
        ) : null}
        <PinPad
          testID="send-pin"
          busy={sending}
          onComplete={(pin) => void submitTransfer(pin)}
          error={error}
        />
        <Text style={[typography.caption, { color: theme.colors.textMuted, textAlign: 'center', marginTop: 12 }]}>
          Your PIN is hashed on the server. PayFlow never stores it in plain text.
        </Text>
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
  recipientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  error: {
    textAlign: 'center',
    marginBottom: 12,
  },
  doneBlock: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 32,
  },
  doneTitle: {
    fontSize: 26,
    fontWeight: '800',
  },
});

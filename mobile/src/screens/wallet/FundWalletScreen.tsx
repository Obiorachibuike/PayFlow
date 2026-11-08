import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/Screen';
import { Button } from '../../components/Button';
import { AmountInput } from '../../components/AmountInput';
import { SegmentedControl } from '../../components/SegmentedControl';
import { DemoBanner } from '../../components/DemoBanner';
import { useTheme } from '../../theme/ThemeProvider';
import { typography } from '../../theme/colors';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  clearLastResults,
  clearOperationError,
  confirmDemoFunding,
  initializeFunding,
  verifyFunding,
} from '../../store/slices/operationsSlice';
import { fetchWallet } from '../../store/slices/walletSlice';
import { fetchTransactions } from '../../store/slices/transactionsSlice';
import { APP } from '../../constants/config';
import { formatNaira } from '../../utils/money';
import type { RootStackParamList } from '../../navigation/types';

type Channel = 'DEMO' | 'PAYSTACK';

const QUICK_AMOUNTS_MINOR = [1_000_00, 5_000_00, 10_000_00, 20_000_00];

export function FundWalletScreen() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const { funding, verifying, lastFunding, lastVerification, error } = useAppSelector(
    (state) => state.operations,
  );

  const [amountMinor, setAmountMinor] = useState(5_000_00);
  const [channel, setChannel] = useState<Channel>('DEMO');

  useEffect(() => {
    dispatch(clearLastResults());
    return () => {
      dispatch(clearLastResults());
      dispatch(clearOperationError());
    };
  }, [dispatch]);

  const startFunding = async () => {
    await dispatch(initializeFunding({ amountMinor, channel }));
  };

  /**
   * The wallet is never credited by this callback. We ask the server to verify
   * the reference with Paystack (or to settle a demo payment) and only show the
   * new balance once the server reports a successful, amount-matched charge.
   */
  const confirm = async () => {
    if (!lastFunding) return;
    const reference = lastFunding.reference;
    const result =
      lastFunding.channel === 'DEMO'
        ? await dispatch(confirmDemoFunding(reference))
        : await dispatch(verifyFunding(reference));

    if (confirmDemoFunding.fulfilled.match(result) || verifyFunding.fulfilled.match(result)) {
      await dispatch(fetchWallet());
      await dispatch(fetchTransactions({ refresh: true }));
    }
  };

  const credited = lastVerification?.credited === true;

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={() => navigation.goBack()} testID="fund-close">
          <Ionicons name="close" size={24} color={theme.colors.text} />
        </Pressable>
        <Text style={[typography.subtitle, { color: theme.colors.text }]}>Add money</Text>
        <View style={{ width: 24 }} />
      </View>

      <DemoBanner
        compact
        message="Sandbox funding. Card payments run on Paystack test keys; demo credits are simulated."
      />

      <AmountInput
        testID="fund-amount"
        valueMinor={amountMinor}
        onChangeMinor={setAmountMinor}
        minMinor={APP.minFundingMinor}
        maxMinor={APP.maxFundingMinor}
        hint={`Between ${formatNaira(APP.minFundingMinor)} and ${formatNaira(APP.maxFundingMinor)}`}
      />

      <View style={styles.quickRow}>
        {QUICK_AMOUNTS_MINOR.map((value) => {
          const active = amountMinor === value;
          return (
            <Pressable
              key={value}
              testID={`fund-quick-${value}`}
              accessibilityRole="button"
              onPress={() => setAmountMinor(value)}
              style={[
                styles.quickChip,
                {
                  backgroundColor: active ? theme.colors.primary : theme.colors.surface,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radius.pill,
                },
              ]}
            >
              <Text
                style={[
                  typography.caption,
                  { color: active ? theme.colors.primaryContrast : theme.colors.text, fontWeight: '700' },
                ]}
              >
                {formatNaira(value).replace('.00', '')}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <SegmentedControl<Channel>
        testID="fund-channel"
        segments={[
          { value: 'DEMO', label: 'Demo credit' },
          { value: 'PAYSTACK', label: 'Paystack test' },
        ]}
        value={channel}
        onChange={setChannel}
      />

      <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
        {channel === 'DEMO'
          ? 'Demo credit settles instantly against the sandbox clearing account. No provider is contacted.'
          : 'You will be redirected to Paystack’s test checkout. Use a Paystack test card and return here to verify.'}
      </Text>

      {error ? (
        <Text testID="fund-error" accessibilityRole="alert" style={[styles.error, { color: theme.colors.error }]}>
          {error}
        </Text>
      ) : null}

      {!lastFunding ? (
        <Button
          testID="fund-continue"
          label="Continue"
          size="lg"
          loading={funding}
          disabled={amountMinor < APP.minFundingMinor || amountMinor > APP.maxFundingMinor}
          onPress={() => void startFunding()}
        />
      ) : (
        <View style={styles.statusBlock}>
          <Text style={[typography.bodyStrong, { color: theme.colors.text }]}>
            {lastFunding.channel === 'DEMO' ? 'Demo payment created' : 'Paystack checkout ready'}
          </Text>
          <Text testID="fund-reference" style={[typography.caption, { color: theme.colors.textMuted }]}>
            {lastFunding.reference} · {formatNaira(lastFunding.amountMinor)}
          </Text>
          {lastFunding.authorizationUrl ? (
            <Text style={[typography.caption, { color: theme.colors.primary }]}>
              {lastFunding.authorizationUrl}
            </Text>
          ) : null}
          {lastFunding.message ? (
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>{lastFunding.message}</Text>
          ) : null}
          <Text style={[typography.caption, { color: theme.colors.textMuted, marginTop: 6 }]}>
            Complete the payment, then press “I’ve paid — verify”. The wallet only changes after the server
            confirms the amount, currency and status with the provider.
          </Text>

          {credited ? (
            <View style={styles.doneRow}>
              <Ionicons name="checkmark-circle" size={20} color={theme.colors.success} />
              <Text testID="fund-success" style={[typography.bodyStrong, { color: theme.colors.success }]}>
                Credited · {formatNaira(lastVerification?.amountMinor ?? lastFunding.amountMinor)}
              </Text>
            </View>
          ) : (
            <Button
              testID="fund-verify"
              label="I’ve paid — verify"
              size="lg"
              loading={verifying}
              onPress={() => void confirm()}
            />
          )}

          {lastVerification && !credited ? (
            <Text style={[typography.caption, { color: theme.colors.warning }]}>
              {lastVerification.message} Nothing has been credited.
            </Text>
          ) : null}
        </View>
      )}
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
  quickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  quickChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderWidth: 1,
  },
  error: {
    marginTop: 4,
  },
  statusBlock: {
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(129, 139, 131, 0.35)',
    borderRadius: 16,
    padding: 16,
  },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/Screen';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { useTheme } from '../../theme/ThemeProvider';
import { typography } from '../../theme/colors';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { createBeneficiary, fetchBanks, resolveAccount } from '../../store/slices/beneficiariesSlice';
import { isValidNigerianAccountNumber } from '../../utils/validation';
import type { RootStackParamList } from '../../navigation/types';
import { useEffect, useMemo, useState } from 'react';

export function AddBeneficiaryScreen() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const banks = useAppSelector((state) => state.beneficiaries.banks);
  const saving = useAppSelector((state) => state.beneficiaries.saving);
  const error = useAppSelector((state) => state.beneficiaries.error);
  const resolved = useAppSelector((state) => state.beneficiaries.resolvedName);

  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [bankPickerOpen, setBankPickerOpen] = useState(false);

  useEffect(() => {
    void dispatch(fetchBanks());
  }, [dispatch]);

  useEffect(() => {
    if (!resolved || resolved.accountNumber !== accountNumber) return;
    setAccountName(resolved.resolvedName);
  }, [resolved, accountNumber]);

  const selectedBank = useMemo(() => banks.find((bank) => bank.code === bankCode) ?? null, [banks, bankCode]);

  const submit = async () => {
    setLocalError(null);
    if (!selectedBank) {
      setLocalError('Choose the bank for this account.');
      return;
    }
    if (!isValidNigerianAccountNumber(accountNumber)) {
      setLocalError('Nigerian account numbers are exactly 10 digits.');
      return;
    }
    if (accountName.trim().length < 2) {
      setLocalError('Enter the account name as it should appear.');
      return;
    }

    const result = await dispatch(
      createBeneficiary({
        bankCode: selectedBank.code,
        accountNumber: accountNumber.trim(),
        accountName: accountName.trim(),
        isDefault,
      }),
    );

    if (createBeneficiary.fulfilled.match(result)) navigation.goBack();
  };

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={() => navigation.goBack()} testID="add-beneficiary-close">
          <Ionicons name="close" size={24} color={theme.colors.text} />
        </Pressable>
        <Text style={[typography.subtitle, { color: theme.colors.text }]}>Add beneficiary</Text>
        <View style={{ width: 24 }} />
      </View>

      <TextField
        testID="beneficiary-account-number"
        label="Account number"
        value={accountNumber}
        onChangeText={(value) => setAccountNumber(value.replace(/\D/g, ''))}
        keyboardType="number-pad"
        maxLength={10}
        placeholder="0123456789"
      />

      <Text style={[typography.caption, { color: theme.colors.textMuted }]}>Bank</Text>
      <Pressable
        accessibilityRole="button"
        testID="beneficiary-bank-picker"
        onPress={() => setBankPickerOpen((open) => !open)}
        style={[
          styles.picker,
          {
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            borderRadius: theme.radius.md,
          },
        ]}
      >
        <Text style={[typography.body, { color: selectedBank ? theme.colors.text : theme.colors.textMuted }]}>
          {selectedBank ? selectedBank.name : 'Select a bank'}
        </Text>
        <Ionicons name={bankPickerOpen ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textMuted} />
      </Pressable>

      {bankPickerOpen ? (
        <View style={[styles.bankList, { borderColor: theme.colors.border, borderRadius: theme.radius.md }]}>
          <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
            {banks.map((bank) => (
              <Pressable
                key={bank.code}
                accessibilityRole="button"
                testID={`bank-option-${bank.code}`}
                onPress={() => {
                  setBankCode(bank.code);
                  setBankPickerOpen(false);
                }}
                style={styles.bankOption}
              >
                <Text style={[typography.body, { color: theme.colors.text }]}>{bank.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <Button
        testID="beneficiary-resolve"
        label="Look up name (simulated)"
        variant="secondary"
        disabled={accountNumber.length !== 10 || !selectedBank}
        onPress={() => void dispatch(resolveAccount({ accountNumber, bankCode }))}
      />

      {resolved ? (
        <View style={[styles.notice, { backgroundColor: theme.colors.warning }]}>
          <Text style={[typography.caption, styles.noticeText]}>{resolved.note}</Text>
        </View>
      ) : null}

      <TextField
        testID="beneficiary-account-name"
        label="Account name"
        value={accountName}
        onChangeText={setAccountName}
        placeholder="e.g. Ada Obi"
        hint="Saved exactly as you type it — PayFlow cannot verify it against the bank."
      />

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isDefault }}
        testID="beneficiary-default-toggle"
        onPress={() => setIsDefault((value) => !value)}
        style={styles.toggleRow}
      >
        <Ionicons
          name={isDefault ? 'checkbox' : 'square-outline'}
          size={22}
          color={isDefault ? theme.colors.primary : theme.colors.textMuted}
        />
        <Text style={[typography.body, { color: theme.colors.text, marginLeft: 10 }]}>Make default account</Text>
      </Pressable>

      {error || localError ? (
        <Text
          testID="beneficiary-error"
          accessibilityRole="alert"
          style={[styles.error, { color: theme.colors.error }]}
        >
          {localError ?? error}
        </Text>
      ) : null}

      <Button
        testID="beneficiary-save"
        label="Save beneficiary"
        size="lg"
        loading={saving}
        onPress={() => void submit()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 12,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
  },
  bankList: {
    borderWidth: 1,
    marginBottom: 12,
  },
  bankOption: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  notice: {
    borderRadius: 12,
    padding: 12,
  },
  noticeText: {
    color: '#101510',
    fontWeight: '700',
  },
  error: {
    marginTop: 4,
  },
});

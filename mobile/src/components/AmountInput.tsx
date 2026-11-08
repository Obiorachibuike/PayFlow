import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { typography } from '../theme/colors';
import { formatNaira, minorToInputValue, parseNairaToMinor } from '../utils/money';
import { useEffect, useState } from 'react';

interface AmountInputProps {
  /** Current amount in kobo. */
  valueMinor: number;
  onChangeMinor: (minor: number) => void;
  label?: string;
  error?: string | null;
  hint?: string | null;
  minMinor?: number;
  maxMinor?: number;
  editable?: boolean;
  testID?: string;
  autoFocus?: boolean;
}

/**
 * Naira amount field.
 *
 * The user types naira; state always stores integer kobo. Typing is validated on
 * every keystroke so an amount like "12.345" can never reach the API.
 */
export function AmountInput({
  valueMinor,
  onChangeMinor,
  label = 'Amount',
  error,
  hint,
  minMinor,
  maxMinor,
  editable = true,
  testID = 'amount-input',
  autoFocus,
}: AmountInputProps) {
  const theme = useTheme();
  const [text, setText] = useState(() => (valueMinor ? minorToInputValue(valueMinor) : ''));

  // Keep the visible text in step when the amount is set from a quick-amount chip.
  useEffect(() => {
    const parsed = parseNairaToMinor(text) ?? 0;
    if (parsed !== valueMinor) setText(valueMinor ? minorToInputValue(valueMinor) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueMinor]);

  const handleChange = (raw: string) => {
    const cleaned = raw.replace(/[^0-9.,]/g, '');
    setText(cleaned);
    onChangeMinor(parseNairaToMinor(cleaned) ?? 0);
  };

  const belowMinimum = minMinor !== undefined && valueMinor > 0 && valueMinor < minMinor;
  const aboveMaximum = maxMinor !== undefined && valueMinor > maxMinor;
  const message = error ?? (aboveMaximum ? `Maximum is ${formatNaira(maxMinor ?? 0)}` : null);
  const note = hint ?? (belowMinimum ? `Minimum is ${formatNaira(minMinor ?? 0)}` : null);

  return (
    <View style={styles.container}>
      <Text style={[typography.caption, { color: theme.colors.textMuted, marginBottom: 8 }]}>{label}</Text>
      <View
        style={[
          styles.field,
          {
            borderColor: message ? theme.colors.error : theme.colors.border,
            backgroundColor: theme.colors.surface,
            borderRadius: theme.radius.lg,
          },
        ]}
      >
        <Text style={[styles.currency, { color: theme.colors.textMuted }]}>₦</Text>
        <TextInput
          testID={testID}
          accessibilityLabel={`${label} in naira`}
          keyboardType="decimal-pad"
          value={text}
          editable={editable}
          autoFocus={autoFocus}
          onChangeText={handleChange}
          placeholder="0.00"
          placeholderTextColor={theme.colors.textMuted}
          style={[styles.input, { color: theme.colors.text }]}
        />
      </View>

      {message ? (
        <Text accessibilityRole="alert" style={[typography.caption, { color: theme.colors.error, marginTop: 8 }]}>
          {message}
        </Text>
      ) : note ? (
        <Text style={[typography.caption, { color: theme.colors.textMuted, marginTop: 8 }]}>{note}</Text>
      ) : (
        <Text style={[typography.caption, { color: theme.colors.textMuted, marginTop: 8 }]}>
          {valueMinor > 0 ? formatNaira(valueMinor) : 'Enter an amount in naira'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  currency: {
    fontSize: 26,
    fontWeight: '700',
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 30,
    fontWeight: '800',
    paddingVertical: 8,
    letterSpacing: -0.5,
  },
});

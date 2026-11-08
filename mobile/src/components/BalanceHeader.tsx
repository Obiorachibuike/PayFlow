import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { typography } from '../theme/colors';
import { formatNaira } from '../utils/money';

interface BalanceHeaderProps {
  balanceMinor: number;
  currency: string;
  walletTag: string;
  hidden: boolean;
  onToggleHidden: () => void;
  refreshing?: boolean;
  onRefresh?: () => void;
  testID?: string;
}

export function BalanceHeader({
  balanceMinor,
  currency,
  walletTag,
  hidden,
  onToggleHidden,
  refreshing,
  onRefresh,
  testID = 'balance-header',
}: BalanceHeaderProps) {
  const theme = useTheme();

  return (
    <View
      testID={testID}
      style={[
        styles.card,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.xl },
      ]}
    >
      <View style={styles.topRow}>
        <View>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>Available balance</Text>
          <Text
            accessibilityLabel={hidden ? 'Balance hidden' : `Balance ${formatNaira(balanceMinor)}`}
            style={[styles.amount, { color: theme.colors.text }]}
          >
            {hidden ? '₦••••••' : formatNaira(balanceMinor)}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={hidden ? 'Show balance' : 'Hide balance'}
          testID="toggle-balance"
          onPress={onToggleHidden}
          style={styles.iconButton}
        >
          <Ionicons name={hidden ? 'eye-off-outline' : 'eye-outline'} size={20} color={theme.colors.textMuted} />
        </Pressable>
      </View>

      <View style={styles.bottomRow}>
        <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
          {walletTag} · {currency}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh balance"
          testID="refresh-balance"
          onPress={onRefresh}
          disabled={refreshing}
          style={styles.iconButton}
        >
          <Ionicons name="refresh-outline" size={18} color={theme.colors.primary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 20,
    borderWidth: 1,
    gap: 18,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  amount: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1,
    marginTop: 6,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(129, 139, 131, 0.12)',
  },
});

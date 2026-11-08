import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { typography } from '../theme/colors';
import { DEMO_NOTICE } from '../constants/config';

/**
 * Persistent, unmissable reminder that PayFlow is a demo. It appears on the auth
 * screens, the home header and every money-moving screen so nobody mistakes
 * simulated balances for real money.
 */
export function DemoBanner({ compact = false, message = DEMO_NOTICE, testID = 'demo-banner' }: {
  compact?: boolean;
  message?: string;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <View
      testID={testID}
      accessibilityRole="text"
      style={[
        styles.base,
        {
          backgroundColor: theme.colors.warning,
          borderRadius: theme.radius.md,
          padding: compact ? 8 : 12,
        },
      ]}
    >
      <Text style={[typography.micro, styles.text]}>DEMO</Text>
      <Text style={[typography.caption, styles.text, { flex: 1 }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  text: {
    color: '#101510',
    fontWeight: '700',
  },
});

import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { typography } from '../theme/colors';
import { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  message: string;
  icon?: ReactNode;
  action?: ReactNode;
  testID?: string;
}

export function EmptyState({ title, message, icon, action, testID }: EmptyStateProps) {
  const theme = useTheme();
  return (
    <View testID={testID} style={styles.container}>
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text style={[typography.subtitle, { color: theme.colors.text, textAlign: 'center' }]}>{title}</Text>
      <Text style={[typography.body, { color: theme.colors.textMuted, textAlign: 'center', marginTop: 8 }]}>
        {message}
      </Text>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  icon: {
    marginBottom: 16,
  },
  action: {
    marginTop: 20,
  },
});

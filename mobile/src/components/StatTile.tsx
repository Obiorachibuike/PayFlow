import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { typography } from '../theme/colors';
import { ReactNode } from 'react';

interface StatTileProps {
  label: string;
  value: string;
  caption?: string;
  icon?: ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'error';
  testID?: string;
}

export function StatTile({ label, value, caption, icon, tone = 'default', testID }: StatTileProps) {
  const theme = useTheme();
  const color =
    tone === 'success'
      ? theme.colors.success
      : tone === 'warning'
        ? theme.colors.warning
        : tone === 'error'
          ? theme.colors.error
          : theme.colors.text;

  return (
    <View
      testID={testID}
      style={[
        styles.base,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.lg,
          padding: theme.spacing.md,
        },
      ]}
    >
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text style={[typography.micro, { color: theme.colors.textMuted }]}>{label.toUpperCase()}</Text>
      <Text style={[typography.subtitle, { color, marginTop: 4 }]}>{value}</Text>
      {caption ? (
        <Text style={[typography.micro, { color: theme.colors.textMuted, marginTop: 4 }]}>{caption}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flex: 1,
    borderWidth: 1,
  },
  icon: {
    marginBottom: 8,
  },
});

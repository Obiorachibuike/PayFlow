import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { typography } from '../theme/colors';

export interface QuickAction {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  testID?: string;
}

export function QuickActions({ actions }: { actions: QuickAction[] }) {
  const theme = useTheme();

  return (
    <View style={styles.row}>
      {actions.map((action) => (
        <Pressable
          key={action.key}
          testID={action.testID}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={action.onPress}
          style={styles.action}
        >
          <View
            style={[
              styles.icon,
              { backgroundColor: theme.colors.primarySoft, borderRadius: theme.radius.md },
            ]}
          >
            <Ionicons name={action.icon} size={20} color={theme.colors.primary} />
          </View>
          <Text style={[typography.micro, { color: theme.colors.text, marginTop: 8 }]}>{action.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  action: {
    flex: 1,
    alignItems: 'center',
  },
  icon: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

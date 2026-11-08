import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  variant?: 'surface' | 'alt' | 'outline';
  testID?: string;
}

export function Card({ children, style, padded = true, variant = 'surface', testID }: CardProps) {
  const theme = useTheme();
  const background =
    variant === 'alt' ? theme.colors.surfaceAlt : variant === 'outline' ? 'transparent' : theme.colors.surface;

  return (
    <View
      testID={testID}
      style={[
        styles.base,
        {
          backgroundColor: background,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.lg,
          padding: padded ? theme.spacing.lg : 0,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
  },
});

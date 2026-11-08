import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { typography } from '../theme/colors';
import { ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityHint?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  style,
  testID,
  accessibilityHint,
}: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;

  const backgroundColor = (() => {
    if (isDisabled) return theme.colors.surfaceAlt;
    switch (variant) {
      case 'primary':
        return theme.colors.primary;
      case 'danger':
        return theme.colors.error;
      case 'secondary':
        return theme.colors.surfaceAlt;
      default:
        return 'transparent';
    }
  })();

  const textColor = (() => {
    if (isDisabled) return theme.colors.textMuted;
    switch (variant) {
      case 'primary':
        return theme.colors.primaryContrast;
      case 'danger':
        return '#FFFFFF';
      case 'secondary':
        return theme.colors.text;
      default:
        return theme.colors.primary;
    }
  })();

  const height = size === 'sm' ? 40 : size === 'lg' ? 56 : 48;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor,
          height,
          borderRadius: theme.radius.pill,
          opacity: pressed && !isDisabled ? 0.85 : 1,
          borderColor: variant === 'secondary' ? theme.colors.border : 'transparent',
          borderWidth: variant === 'secondary' ? 1 : 0,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <>
          {icon}
          <Text
            style={[
              typography.bodyStrong,
              {
                color: textColor,
                marginLeft: icon ? 8 : 0,
                fontSize: size === 'sm' ? 14 : 15,
              },
            ]}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
});

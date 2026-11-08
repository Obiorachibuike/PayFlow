import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { typography } from '../theme/colors';

interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string | null;
  hint?: string | null;
  prefix?: string;
  suffix?: React.ReactNode;
  secureToggle?: boolean;
  testID?: string;
}

export function TextField({
  label,
  error,
  hint,
  prefix,
  suffix,
  secureToggle = false,
  testID,
  secureTextEntry,
  ...inputProps
}: TextFieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const hidden = secureTextEntry && !revealed;

  return (
    <View style={styles.container}>
      {label ? (
        <Text style={[typography.caption, { color: theme.colors.textMuted, marginBottom: 6 }]} accessibilityRole="text">
          {label}
        </Text>
      ) : null}

      <View
        style={[
          styles.field,
          {
            borderColor: error ? theme.colors.error : focused ? theme.colors.primary : theme.colors.border,
            backgroundColor: theme.colors.surface,
            borderRadius: theme.radius.md,
          },
        ]}
      >
        {prefix ? (
          <Text
            style={[
              typography.body,
              { color: theme.colors.textMuted, marginRight: 8, fontWeight: '600' },
            ]}
          >
            {prefix}
          </Text>
        ) : null}

        <TextInput
          testID={testID}
          accessibilityLabel={label ?? (inputProps.placeholder ?? 'Input')}
          placeholderTextColor={theme.colors.textMuted}
          secureTextEntry={hidden}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[
            typography.body,
            { color: theme.colors.text, flex: 1, paddingVertical: 12, minHeight: 44 },
          ]}
          {...inputProps}
        />

        {secureToggle ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide text' : 'Show text'}
            onPress={() => setRevealed((value) => !value)}
            style={styles.suffix}
          >
            <Text style={[typography.caption, { color: theme.colors.primary, fontWeight: '700' }]}>
              {revealed ? 'Hide' : 'Show'}
            </Text>
          </Pressable>
        ) : null}

        {suffix ? <View style={styles.suffix}>{suffix}</View> : null}
      </View>

      {error ? (
        <Text
          accessibilityRole="alert"
          style={[typography.caption, { color: theme.colors.error, marginTop: 6 }]}
        >
          {error}
        </Text>
      ) : hint ? (
        <Text style={[typography.caption, { color: theme.colors.textMuted, marginTop: 6 }]}>{hint}</Text>
      ) : null}
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
    paddingHorizontal: 14,
  },
  suffix: {
    marginLeft: 8,
  },
});

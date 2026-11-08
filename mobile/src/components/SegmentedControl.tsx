import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { typography } from '../theme/colors';

export interface Segment<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  segments: Array<Segment<T>>;
  value: T;
  onChange: (value: T) => void;
  testID?: string;
}

export function SegmentedControl<T extends string>({ segments, value, onChange, testID }: SegmentedControlProps<T>) {
  const theme = useTheme();
  return (
    <View
      testID={testID}
      style={[
        styles.container,
        { backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill, borderColor: theme.colors.border },
      ]}
    >
      {segments.map((segment) => {
        const active = segment.value === value;
        return (
          <Pressable
            key={segment.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(segment.value)}
            style={[
              styles.segment,
              {
                backgroundColor: active ? theme.colors.primary : 'transparent',
                borderRadius: theme.radius.pill,
              },
            ]}
          >
            <Text
              style={[
                typography.caption,
                { color: active ? theme.colors.primaryContrast : theme.colors.textMuted, fontWeight: '700' },
              ]}
            >
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
});

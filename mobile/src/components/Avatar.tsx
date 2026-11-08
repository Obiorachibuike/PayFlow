import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { typography } from '../theme/colors';
import { initialsOf } from '../utils/format';

interface AvatarProps {
  name: string;
  color?: string;
  size?: number;
  testID?: string;
}

export function Avatar({ name, color, size = 44, testID }: AvatarProps) {
  const theme = useTheme();
  const background = color ?? theme.colors.primarySoft;

  return (
    <View
      testID={testID}
      style={[
        styles.base,
        {
          backgroundColor: background,
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}
    >
      <Text
        style={[
          typography.bodyStrong,
          {
            color: theme.colors.text,
            fontSize: size * 0.36,
            fontWeight: '700',
          },
        ]}
      >
        {initialsOf(name) || '?'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

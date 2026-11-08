import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';

interface SparklineProps {
  /** Ordered oldest → newest, in minor units. */
  data: number[];
  width?: number;
  height?: number;
  testID?: string;
}

/**
 * Tiny balance trend chart. Purely decorative for demo data; it never implies a
 * forecast or a real financial product.
 */
export function Sparkline({ data, width = 260, height = 64, testID }: SparklineProps) {
  const theme = useTheme();
  const points = data.length > 1 ? data : [0, 0];
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;

  const coordinates = points.map((value, index) => {
    const x = (index / (points.length - 1)) * (width - 8) + 4;
    const y = height - 6 - ((value - min) / range) * (height - 16);
    return { x, y };
  });

  const path = coordinates
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(' ');

  const last = coordinates[coordinates.length - 1];

  return (
    <View testID={testID} style={styles.container}>
      <Svg width={width} height={height}>
        <Path d={path} stroke={theme.colors.primary} strokeWidth={2.5} fill="none" strokeLinecap="round" />
        {last ? <Circle cx={last.x} cy={last.y} r={3.5} fill={theme.colors.primary} /> : null}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
});

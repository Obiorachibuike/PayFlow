import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeProvider';
import { typography } from '../theme/colors';
import { useEffect, useRef, useState } from 'react';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'biometric', '0', 'back'] as const;

interface PinPadProps {
  length?: number;
  onComplete: (pin: string) => void;
  onChange?: (pin: string) => void;
  error?: string | null;
  /** Adds a biometric shortcut; it only fills the PIN from the device keychain. */
  biometricEnabled?: boolean;
  onBiometric?: () => void;
  testID?: string;
  busy?: boolean;
}

/**
 * PIN entry.
 *
 * The PIN is held in component state, passed up on completion and never
 * persisted or logged. Biometrics (when enabled) are a local convenience that
 * replays a stored credential — the server still verifies the PIN hash.
 */
export function PinPad({
  length = 4,
  onComplete,
  onChange,
  error,
  biometricEnabled = false,
  onBiometric,
  testID = 'pin-pad',
  busy = false,
}: PinPadProps) {
  const theme = useTheme();
  const [pin, setPin] = useState('');
  const pinRef = useRef('');

  useEffect(() => {
    pinRef.current = pin;
    onChange?.(pin);
  }, [pin, onChange]);

  const press = async (key: (typeof KEYS)[number]) => {
    if (busy) return;
    if (key === 'back') {
      setPin((current) => current.slice(0, -1));
      return;
    }
    if (key === 'biometric') {
      onBiometric?.();
      return;
    }
    void Haptics.selectionAsync();
    setPin((current) => {
      if (current.length >= length) return current;
      const next = `${current}${key}`;
      if (next.length === length) {
        // Defer so the last dot renders before the network call starts.
        setTimeout(() => onComplete(next), 80);
      }
      return next;
    });
  };

  const reset = () => setPin('');

  useEffect(() => {
    if (error) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  return (
    <View testID={testID} style={styles.container}>
      <View style={styles.dots} accessibilityLabel={`${pin.length} of ${length} digits entered`}>
        {Array.from({ length }).map((_, index) => {
          const filled = index < pin.length;
          return (
            <View
              key={index}
              testID={`${testID}-dot-${index}`}
              style={[
                styles.dot,
                {
                  borderColor: error ? theme.colors.error : filled ? theme.colors.primary : theme.colors.border,
                  backgroundColor: filled ? theme.colors.primary : 'transparent',
                },
              ]}
            />
          );
        })}
      </View>

      {error ? (
        <Text accessibilityRole="alert" style={[typography.body, { color: theme.colors.error, textAlign: 'center' }]}>
          {error}
        </Text>
      ) : null}

      <View style={styles.grid}>
        {KEYS.map((key) => {
          const hiddenBiometric = key === 'biometric' && !biometricEnabled;
          return (
            <Pressable
              key={key}
              testID={`${testID}-key-${key}`}
              accessibilityRole="button"
              accessibilityLabel={
                key === 'back' ? 'Delete' : key === 'biometric' ? 'Use biometrics' : `Digit ${key}`
              }
              disabled={busy || hiddenBiometric}
              onPress={() => void press(key)}
              style={({ pressed }) => [
                styles.key,
                {
                  backgroundColor: pressed ? theme.colors.surfaceAlt : 'transparent',
                  opacity: hiddenBiometric ? 0 : 1,
                },
              ]}
            >
              {key === 'back' ? (
                <Text style={[styles.actionKey, { color: theme.colors.text }]}>⌫</Text>
              ) : key === 'biometric' ? (
                <Text style={[styles.actionKey, { color: theme.colors.primary }]}>⌘</Text>
              ) : (
                <Text style={[styles.keyText, { color: theme.colors.text }]}>{key}</Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 18,
  },
  dots: {
    flexDirection: 'row',
    gap: 16,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
    justifyContent: 'center',
    gap: 12,
  },
  key: {
    width: '28%',
    aspectRatio: 1.4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  keyText: {
    fontSize: 24,
    fontWeight: '600',
  },
  actionKey: {
    fontSize: 22,
    fontWeight: '600',
  },
});

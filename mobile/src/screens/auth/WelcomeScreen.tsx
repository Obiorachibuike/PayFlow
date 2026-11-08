import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '../../components/Screen';
import { Button } from '../../components/Button';
import { DemoBanner } from '../../components/DemoBanner';
import { useTheme } from '../../theme/ThemeProvider';
import { typography } from '../../theme/colors';
import { brand } from '../../theme';
import type { AuthStackParamList } from '../../navigation/types';

export function WelcomeScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();

  return (
    <Screen padded contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={[styles.mark, { backgroundColor: theme.colors.primary }]}>
          <Text style={[styles.markText, { color: theme.colors.primaryContrast }]}>₦</Text>
        </View>
        <Text style={[styles.brand, { color: theme.colors.text }]}>{brand.name}</Text>
        <Text style={[typography.body, { color: theme.colors.textMuted, textAlign: 'center' }]}>
          {brand.tagline}
        </Text>
      </View>

      <DemoBanner />

      <View style={styles.actions}>
        <Button
          testID="welcome-create-account"
          label="Create an account"
          size="lg"
          onPress={() => navigation.navigate('Register')}
        />
        <Button
          testID="welcome-sign-in"
          label="I already have an account"
          variant="secondary"
          size="lg"
          onPress={() => navigation.navigate('Login')}
        />
      </View>

      <Text style={[typography.caption, { color: theme.colors.textMuted, textAlign: 'center' }]}>
        PayFlow is a portfolio demo. Wallets are funded in Paystack test mode and every payout is simulated, so
        no real money ever moves.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    justifyContent: 'space-between',
    gap: 24,
  },
  hero: {
    alignItems: 'center',
    gap: 12,
    marginTop: 48,
  },
  mark: {
    width: 76,
    height: 76,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markText: {
    fontSize: 38,
    fontWeight: '800',
  },
  brand: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  actions: {
    gap: 12,
  },
});

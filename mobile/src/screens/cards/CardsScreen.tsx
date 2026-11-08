import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { useTheme } from '../../theme/ThemeProvider';
import { typography } from '../../theme/colors';
import { useAppSelector } from '../../store/hooks';
import { formatNaira } from '../../utils/money';

/**
 * Cards is a UI-only showcase.
 *
 * PayFlow does not issue cards, does not store card numbers or CVVs, and has no
 * card processor. Every figure below is clearly labelled as a demo preview.
 */
export function CardsScreen() {
  const theme = useTheme();
  const user = useAppSelector((state) => state.auth.user);
  const wallet = useAppSelector((state) => state.wallet.wallet);

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Cards</Text>
        <Text style={[typography.caption, { color: theme.colors.textMuted }]}>Preview only</Text>
      </View>

      <View style={[styles.virtualCard, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
        <View style={styles.cardTop}>
          <Ionicons name="card-outline" size={22} color={theme.colors.primary} />
          <Text style={[typography.micro, { color: theme.colors.primary }]}>DEMO CARD · NOT ISSUED</Text>
        </View>

        <Text style={[styles.cardNumber, { color: theme.colors.text }]}>•••• •••• •••• ••••</Text>

        <View style={styles.cardBottom}>
          <View>
            <Text style={[typography.micro, { color: theme.colors.textMuted }]}>CARD HOLDER</Text>
            <Text style={[typography.bodyStrong, { color: theme.colors.text }]}>
              {user?.fullName?.toUpperCase() ?? 'PAYFLOW DEMO'}
            </Text>
          </View>
          <View>
            <Text style={[typography.micro, { color: theme.colors.textMuted }]}>WALLET BALANCE</Text>
            <Text style={[typography.bodyStrong, { color: theme.colors.text }]}>
              {formatNaira(wallet?.balanceMinor ?? 0)}
            </Text>
          </View>
        </View>
      </View>

      <View style={[styles.notice, { backgroundColor: theme.colors.warning }]}>
        <Text style={[typography.caption, styles.noticeText]}>
          DEMO · PayFlow does not issue cards and never stores a card number or CVV. This screen shows how a card
          product would look inside the app.
        </Text>
      </View>

      <Card>
        <Text style={[typography.subtitle, { color: theme.colors.text, marginBottom: 8 }]}>
          What is real in this app
        </Text>
        <BulletItem text="Wallet balances backed by a double-entry ledger in PostgreSQL" />
        <BulletItem text="Transfers between PayFlow wallets, signed with your transaction PIN" />
        <BulletItem text="Sandbox funding through Paystack test mode with server-side verification" />
        <BulletItem text="Simulated withdrawals that debit the wallet into a clearing account" />
      </Card>

      <Card>
        <Text style={[typography.subtitle, { color: theme.colors.text, marginBottom: 8 }]}>
          What is simulated
        </Text>
        <BulletItem text="Card issuance, virtual card numbers and CVVs" />
        <BulletItem text="Bank payouts and account name lookups" />
        <BulletItem text="Any balance shown as seeded demo data" />
      </Card>
    </Screen>
  );
}

function BulletItem({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <View style={styles.bullet}>
      <Ionicons name="checkmark" size={16} color={theme.colors.primary} />
      <Text style={[typography.body, { color: theme.colors.textMuted, flex: 1, marginLeft: 10 }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  virtualCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 22,
    gap: 24,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardNumber: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 3,
  },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  notice: {
    borderRadius: 14,
    padding: 12,
  },
  noticeText: {
    color: '#101510',
    fontWeight: '700',
  },
  bullet: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
});

/**
 * PayFlow demo seed.
 *
 * Creates two fully verified demo users with ledger-backed balances, a handful of
 * realistic transactions and notifications so the mobile app has something to show.
 *
 * Everything here goes through the same double-entry ledger as production code —
 * no balances are ever written directly.
 */
import { eq } from 'drizzle-orm';
import { closeDatabase, db } from '../src/db';
import { withTransaction } from '../src/db/transaction';
import {
  banks,
  beneficiaries,
  notifications,
  payments,
  transactionPins,
  transactions,
  transfers,
  users,
  wallets,
  withdrawals,
} from '../src/db/schema';
import { logger } from '../src/config/logger';
import { generateReference } from '../src/utils/references';
import { formatNaira } from '../src/utils/money';
import { hashPassword, hashPin } from '../src/utils/crypto';
import { createWalletForUser } from '../src/modules/wallet/wallet.service';
import { postLedgerTransaction, SYSTEM_LEDGER_ACCOUNTS } from '../src/modules/ledger/ledger.service';

const BANKS = [
  { code: '044', name: 'Access Bank' },
  { code: '058', name: 'GTBank' },
  { code: '057', name: 'Zenith Bank' },
  { code: '011', name: 'First Bank of Nigeria' },
  { code: '033', name: 'United Bank for Africa' },
  { code: '50211', name: 'Kuda Microfinance Bank' },
  { code: '999992', name: 'OPay Digital Services' },
  { code: '50515', name: 'Moniepoint MFB' },
  { code: '035', name: 'Wema Bank' },
  { code: '221', name: 'Stanbic IBTC Bank' },
  { code: '070', name: 'Fidelity Bank' },
  { code: '032', name: 'Union Bank of Nigeria' },
  { code: '214', name: 'First City Monument Bank' },
  { code: '232', name: 'Sterling Bank' },
  { code: '076', name: 'Polaris Bank' },
  { code: '999991', name: 'PalmPay' },
];

const DEMO_USERS = [
  {
    fullName: 'Ada Obi',
    email: 'ada@payflow.demo',
    phone: '+2348031234567',
    password: 'Flow1234',
    pin: '1234',
    avatarColor: '#39FF14',
    openingMinor: 12_500_000n, // ₦125,000.00
  },
  {
    fullName: 'Tunde Balogun',
    email: 'tunde@payflow.demo',
    phone: '+2348069876543',
    password: 'Flow1234',
    pin: '1234',
    avatarColor: '#22C55E',
    openingMinor: 4_850_000n, // ₦48,500.00
  },
];

async function seedBanks() {
  for (const bank of BANKS) {
    await db.insert(banks).values(bank).onConflictDoNothing({ target: banks.code });
  }
  logger.info({ count: BANKS.length }, 'Banks seeded');
}

async function fundWallet(userId: string, walletId: string, ledgerAccountId: string, amountMinor: bigint) {
  await withTransaction(async (tx) => {
    const reference = generateReference('PAY');
    const [transaction] = await tx
      .insert(transactions)
      .values({
        reference,
        type: 'FUNDING',
        status: 'SUCCESSFUL',
        amountMinor,
        description: 'Wallet funding (demo seed)',
        recipientWalletId: walletId,
        recipientName: 'PayFlow demo wallet',
        initiatedByUserId: userId,
        completedAt: new Date(),
        metadata: { seeded: true },
      })
      .returning();

    await postLedgerTransaction(tx, {
      type: 'FUNDING',
      description: `Wallet funding ${reference}`,
      transactionId: transaction!.id,
      reference: `LTX-${reference}`,
      legs: [
        {
          ledgerAccountId: SYSTEM_LEDGER_ACCOUNTS.PAYMENT_CLEARING,
          direction: 'DEBIT',
          amountMinor,
        },
        { ledgerAccountId, direction: 'CREDIT', amountMinor, walletId },
      ],
      metadata: { seeded: true },
    });

    await tx.insert(payments).values({
      reference,
      transactionId: transaction!.id,
      userId,
      walletId,
      provider: 'DEMO',
      providerReference: `DEMO-${reference}`,
      status: 'SUCCESSFUL',
      amountMinor,
      channel: 'demo',
      gatewayResponse: 'Seeded demo funding',
      paidAt: new Date(),
      verifiedAt: new Date(),
      metadata: { seeded: true },
    });

    await tx.insert(notifications).values({
      userId,
      type: 'WALLET_FUNDED',
      title: 'Wallet funded',
      body: `${formatNaira(amountMinor)} was added to your PayFlow wallet.`,
      data: { reference },
    });
  });
}

async function seedTransfer(from: { userId: string; walletId: string; accountId: string; name: string }, to: { userId: string; walletId: string; accountId: string; name: string }, amountMinor: bigint) {
  await withTransaction(async (tx) => {
    const reference = generateReference('TRF');
    const [transaction] = await tx
      .insert(transactions)
      .values({
        reference,
        type: 'TRANSFER_OUT',
        status: 'SUCCESSFUL',
        amountMinor,
        description: 'Dinner split',
        senderWalletId: from.walletId,
        recipientWalletId: to.walletId,
        senderName: from.name,
        recipientName: to.name,
        initiatedByUserId: from.userId,
        completedAt: new Date(),
        metadata: { seeded: true },
      })
      .returning();

    await postLedgerTransaction(tx, {
      type: 'TRANSFER_OUT',
      description: `Internal transfer ${reference}`,
      transactionId: transaction!.id,
      reference: `LTX-${reference}`,
      legs: [
        { ledgerAccountId: from.accountId, direction: 'DEBIT', amountMinor, walletId: from.walletId },
        { ledgerAccountId: to.accountId, direction: 'CREDIT', amountMinor, walletId: to.walletId },
      ],
      metadata: { seeded: true },
    });

    await tx.insert(transfers).values({
      transactionId: transaction!.id,
      senderUserId: from.userId,
      recipientUserId: to.userId,
      fromWalletId: from.walletId,
      toWalletId: to.walletId,
      note: 'Dinner split',
    });

    await tx.insert(notifications).values([
      {
        userId: from.userId,
        type: 'TRANSFER_SENT',
        title: 'Transfer sent',
        body: `${formatNaira(amountMinor)} sent to ${to.name}.`,
        data: { reference },
      },
      {
        userId: to.userId,
        type: 'TRANSFER_RECEIVED',
        title: 'Money received',
        body: `${formatNaira(amountMinor)} from ${from.name}.`,
        data: { reference },
      },
    ]);
  });
}

async function seedWithdrawal(userId: string, walletId: string, accountId: string, name: string, amountMinor: bigint, bank: { code: string; name: string }) {
  await withTransaction(async (tx) => {
    const reference = generateReference('WDR');
    const [transaction] = await tx
      .insert(transactions)
      .values({
        reference,
        type: 'WITHDRAWAL',
        status: 'SUCCESSFUL',
        amountMinor,
        description: `Withdrawal to ${bank.name}`,
        senderWalletId: walletId,
        senderName: name,
        recipientName: name,
        initiatedByUserId: userId,
        completedAt: new Date(),
        metadata: { simulated: true, seeded: true },
      })
      .returning();

    await postLedgerTransaction(tx, {
      type: 'WITHDRAWAL',
      description: `Simulated withdrawal ${reference}`,
      transactionId: transaction!.id,
      reference: `LTX-${reference}`,
      legs: [
        { ledgerAccountId: accountId, direction: 'DEBIT', amountMinor, walletId },
        { ledgerAccountId: SYSTEM_LEDGER_ACCOUNTS.PAYMENT_CLEARING, direction: 'CREDIT', amountMinor },
      ],
      metadata: { simulated: true, seeded: true },
    });

    await tx.insert(withdrawals).values({
      transactionId: transaction!.id,
      userId,
      walletId,
      bankName: bank.name,
      bankCode: bank.code,
      accountName: name,
      accountNumberLast4: '6789',
      simulated: true,
    });

    await tx.insert(notifications).values({
      userId,
      type: 'WITHDRAWAL_PROCESSED',
      title: 'Withdrawal processed (demo)',
      body: `${formatNaira(amountMinor)} withdrawal to ${bank.name} completed in demo mode.`,
      data: { reference },
    });
  });
}

async function main() {
  await seedBanks();

  for (const config of DEMO_USERS) {
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, config.email)).limit(1);
    if (existing) {
      logger.info({ email: config.email }, 'Demo user already exists — skipping');
      continue;
    }

    const passwordHash = await hashPassword(config.password);
    const pinHash = await hashPin(config.pin);

    const { user, wallet } = await withTransaction(async (tx) => {
      const [created] = await tx
        .insert(users)
        .values({
          fullName: config.fullName,
          email: config.email,
          phone: config.phone,
          passwordHash,
          avatarColor: config.avatarColor,
          emailVerifiedAt: new Date(),
          kycStatus: 'VERIFIED',
          themePreference: 'SYSTEM',
        })
        .returning();

      const newWallet = await createWalletForUser(tx, created!.id);

      await tx.insert(transactionPins).values({
        userId: created!.id,
        pinHash,
      });

      return { user: created!, wallet: newWallet };
    });

    await fundWallet(user.id, wallet.id, wallet.ledgerAccountId, config.openingMinor);

    logger.info(
      { email: config.email, password: config.password, pin: config.pin, balance: formatNaira(config.openingMinor) },
      'Demo user created',
    );
  }

  // Relationship + activity between the two demo users.
  const [ada] = await db.select().from(users).where(eq(users.email, 'ada@payflow.demo')).limit(1);
  const [tunde] = await db.select().from(users).where(eq(users.email, 'tunde@payflow.demo')).limit(1);

  if (ada && tunde) {
    const [adaWallet] = await db.select().from(wallets).where(eq(wallets.userId, ada.id)).limit(1);
    const [tundeWallet] = await db.select().from(wallets).where(eq(wallets.userId, tunde.id)).limit(1);

    const [existingTransfer] = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.type, 'TRANSFER_OUT'))
      .limit(1);

    if (adaWallet && tundeWallet && !existingTransfer) {
      await seedTransfer(
        { userId: ada.id, walletId: adaWallet.id, accountId: adaWallet.ledgerAccountId, name: ada.fullName },
        { userId: tunde.id, walletId: tundeWallet.id, accountId: tundeWallet.ledgerAccountId, name: tunde.fullName },
        1_250_000n, // ₦12,500.00
      );

      await seedTransfer(
        { userId: tunde.id, walletId: tundeWallet.id, accountId: tundeWallet.ledgerAccountId, name: tunde.fullName },
        { userId: ada.id, walletId: adaWallet.id, accountId: adaWallet.ledgerAccountId, name: ada.fullName },
        350_000n, // ₦3,500.00
      );

      await seedWithdrawal(ada.id, adaWallet.id, adaWallet.ledgerAccountId, ada.fullName, 2_000_000n, {
        code: '058',
        name: 'GTBank',
      });

      await db
        .insert(beneficiaries)
        .values({
          userId: ada.id,
          bankCode: '058',
          bankName: 'GTBank',
          accountNumber: '0123456789',
          accountNumberLast4: '6789',
          accountName: 'Ada Obi',
          verifiedStatus: 'UNVERIFIED',
          isDefault: true,
        })
        .onConflictDoNothing();

      await db.insert(notifications).values({
        userId: ada.id,
        type: 'SYSTEM',
        title: 'Welcome to PayFlow',
        body: 'Your demo wallet is ready. Explore funding, transfers and receipts.',
      });

      logger.info('Demo activity seeded');
    }
  }

  const [finalWallet] = ada
    ? await db.select().from(wallets).where(eq(wallets.userId, ada.id)).limit(1)
    : [];

  logger.info({ balance: finalWallet ? formatNaira(finalWallet.balanceMinor) : 'n/a' }, 'Seed complete');
  await closeDatabase();
}

main().catch(async (error) => {
  logger.error({ err: error }, 'Seed failed');
  await closeDatabase();
  process.exit(1);
});

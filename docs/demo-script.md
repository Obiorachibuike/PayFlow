# Demo script

A five-minute tour that exercises the whole money path. Everything below is simulated
or runs on Paystack **test** keys — no real money moves.

## Before you start

```bash
cd backend && npm run db:setup   # local PostgreSQL + migrations + seed
cd backend && npm run dev        # API on http://localhost:4000
cd mobile  && npm start          # scan the QR, or `npm run web` for the browser
```

Demo accounts: `ada@payflow.demo` / `tunde@payflow.demo`, password `Flow1234`,
transaction PIN `1234`.

## 1. Register a fresh account (2 min)

1. **Create an account** → full name, email, `0803 123 4567`, password `Flow1234`.
2. The verification screen shows the code (demo mode). Copy it → **Verify email**.
   Try sending money before verifying to see `EMAIL_NOT_VERIFIED`.
3. Land on **Home**: empty balance, demo banner, quick actions.

## 2. Fund the wallet with a demo credit (1 min)

1. **Add money → ₦5,000 → Demo credit → Continue**.
2. Note the reference (`PF-PAY-…`). The wallet has **not** changed yet.
3. Press **I’ve paid — verify**. The app asks the *server* to verify; only after the
   server confirms status, amount and currency does the balance move to ₦5,000.
4. **Profile → Ledger entries** shows the `DEBIT SYS:PAYMENT_CLEARING` /
   `CREDIT WALLET:…` pair.

## 3. Fund with Paystack test mode (1 min, needs test keys)

1. **Add money → ₦2,000 → Paystack test → Continue**.
2. Open the returned checkout URL and pay with a Paystack test card.
3. Back in the app press **I’ve paid — verify**.
4. To see the guards: initialise ₦2,000, then tamper with the amount server-side
   (or use `simulate: 'failure'`) — the payment fails, a `TRANSACTION_FAILED`
   notification appears, and **nothing** is credited.

## 4. Send money (1 min)

1. **Send** → enter `tunde@payflow.demo` → the app resolves the recipient and shows the
   masked wallet tag.
2. Enter ₦1,500 and a note → **Continue** → enter PIN `1234`.
3. Try the wrong PIN first to see `PIN_INVALID`; try ₦100,000 to see
   `INSUFFICIENT_FUNDS`.
4. On success the receipt is shareable as a **PDF** (share sheet) and is marked as a
   demo movement.

## 5. Withdraw to a bank (1 min)

1. **Withdraw** → **Add beneficiary** → account number `0123456789` → pick GTBank →
   **Look up name (simulated)** — note the warning that the bank was never contacted.
2. Save it, then withdraw ₦2,000 with the PIN.
3. The success screen, the receipt and the notification all say the payout is
   **simulated**: the money left the wallet into the sandbox clearing account and no
   bank transfer was made.

## 6. Show the engineering (2 min)

* **Profile → Ledger entries** — immutable debit/credit pairs behind every movement.
* **Profile → Security** — PIN state, signed-in devices, biometrics toggle with the
  note that biometrics never authorise a payment.
* **Profile → Settings** — theme, hide balances, notification preferences; switch to
  light mode to show the palette.
* **Cards** — demo-only card preview with the “not issued” notice.
* `curl http://localhost:4000/api/health` and open `http://localhost:4000/api/docs`.
* `cd backend && npm run db:reconcile` — proves the ledger balances and every wallet
  matches its entries.
* `cd backend && npm test` / `cd mobile && npm test` — 164 tests, all green.

## Failure paths worth showing

| Action | Result |
| --- | --- |
| Transfer to yourself | `409 SELF_TRANSFER` |
| Transfer above the daily outflow cap | `409 LIMIT_EXCEEDED` with the limit and used amount |
| Replay an `Idempotency-Key` with a different amount | `422 IDEMPOTENCY_KEY_REUSED` |
| Use a refresh token twice | `401 TOKEN_REUSE_DETECTED`, all devices signed out |
| Replay a Paystack webhook with the same event id | `duplicate`, no second credit |

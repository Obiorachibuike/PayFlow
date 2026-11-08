# PayFlow architecture

This document describes how the system is put together and, more importantly, **why**
the money-moving parts are shaped the way they are.

## 1. System overview

```
Mobile (Expo / React Native)
  ├── Redux Toolkit store (auth, wallet, transactions, beneficiaries,
  │   notifications, profile, operations, settings)
  ├── services/client.ts  → fetch wrapper: envelope, timeouts, single-flight refresh
  └── screens/            → never talk to a provider; only to the PayFlow API

        │  HTTPS · JSON · Bearer JWT · Idempotency-Key on money routes
        ▼

API (Node 22 · Express 5 · TypeScript strict)
  middleware: requestId → pino-http → helmet/CSP → cors → rate limit → auth → zod
  routers:    auth, wallet, payments, transfers, withdrawals, beneficiaries,
              transactions, notifications, profile
  services:   pure-ish business logic; every money movement funnels through
              modules/ledger/ledger.service.ts

        │  SQL in a transaction
        ▼

PostgreSQL 18
  ├── ledger_transactions / ledger_entries (append-only, triggers enforce immutability)
  ├── wallets (balance cache kept in lock-step with the ledger)
  ├── transactions (canonical journal: FUNDING, TRANSFER_*, WITHDRAWAL, …)
  ├── payments, transfers, withdrawals, beneficiaries, banks
  ├── users, transaction_pins, refresh_tokens, device_sessions, otp_tokens
  ├── idempotency_records, webhook_events, notifications, audit_logs
  └── schema_migrations
```

The API is the only component that talks to Paystack. The mobile app never sees a
Paystack key and never decides whether money moved.

## 2. Money model

| Rule | Implementation |
| --- | --- |
| Integer minor units (kobo) everywhere | `bigint` columns; `utils/money.ts` on both sides; JS numbers only cross the HTTP boundary after `Number()` conversion of values known to be safe |
| No floats in arithmetic | Amounts are parsed to integers at the edge (`parseNairaToMinor`) and re-validated by Zod (`z.number().int().positive()`) |
| Double entry | `postLedgerTransaction(tx, { legs })` writes a `ledger_transactions` row plus N `ledger_entries` rows whose debits equal credits |
| Immutable entries | BEFORE UPDATE/DELETE triggers on `ledger_entries` raise an exception; corrections post new entries |
| Wallet balance is derived | `wallets.balance_minor` is updated inside the same transaction that posts the entries, and `db:reconcile` asserts equality with the ledger |
| Overdraw impossible | The ledger write path checks the resulting balance and raises `INSUFFICIENT_FUNDS`; wallet rows also carry a non-negative assertion |

### Ledger accounts

Three system accounts plus one account per wallet:

| Account | Type | Meaning |
| --- | --- | --- |
| `SYS:PAYMENT_CLEARING` | ASSET | Sandbox cash. Credits a wallet when funding succeeds, receives money for withdrawals |
| `SYS:PLATFORM_REVENUE` | REVENUE | Fees (reserved; no fees are charged in the demo) |
| `SYS:TRANSFER_CLEARING` | LIABILITY | Bridges the two legs of an internal transfer |
| `WALLET:<uuid>` | ASSET | One per wallet |

Example — ₦2,000 demo funding:

```
ledger_transactions: FUNDING, reference LTX-PF-PAY-…
  DEBIT  SYS:PAYMENT_CLEARING   200000   (walletId null)
  CREDIT WALLET:<ada>           200000   (walletId ada)
```

Example — ₦500 transfer from Ada to Tunde:

```
DEBIT  WALLET:<ada>               50000
CREDIT SYS:TRANSFER_CLEARING      50000
DEBIT  SYS:TRANSFER_CLEARING      50000
CREDIT WALLET:<tunde>             50000
```

Internal transfers are posted as one balanced transaction with four legs so the
journal row (`transactions`) can stay canonical while both wallets show movement.

## 3. Concurrency and idempotency

Two independent mechanisms keep retries and races from moving money twice:

1. **`Idempotency-Key` header** (required on payments, transfers and withdrawals).
   `middleware/idempotency.ts` stores `{ userId, scope, key, requestHash, response }`
   in `idempotency_records` inside the same transaction as the business write:
   * same key + same body → the stored response is replayed (`201`, identical reference);
   * same key + different body → `422 IDEMPOTENCY_KEY_REUSED`;
   * concurrent requests with the same key → unique-constraint conflict resolves to a
     single executed operation.
2. **Row-level locking.** The money path selects the wallet `FOR UPDATE` inside the
   transaction, so two competing debits serialise; the loser sees the updated balance
   and gets `409 INSUFFICIENT_FUNDS`.

Provider-side dedupe is separate: `webhook_events` stores the Paystack event id with a
unique constraint, returning `{ outcome: 'duplicate' }` for redeliveries.

## 4. Authentication and sessions

```
login ──► access token (JWT, ~15 min)  +  refresh token (opaque id + secret, 30 days)
                │                                   │
                │  Authorization: Bearer            │  POST /auth/refresh
                ▼                                   ▼
        middleware/auth.ts                 tokens.service.rotateRefreshToken
        verifies signature, expiry,        └─ hash-compares the secret, issues a NEW
        user status, and that the            refresh token, revokes the old one
        device session is not revoked
```

* Refresh tokens are stored **hashed**; only the id is stored in plain text.
* Rotation is atomic: revoke old → issue new in one transaction.
* **Replay detection**: using a revoked/rotated refresh token revokes the entire
  rotation family *and* every device session for that user, then returns
  `401 TOKEN_REUSE_DETECTED`.
* `device_sessions` powers “signed-in devices” and per-device push tokens. Revoking a
  session immediately invalidates its refresh token.
* Changing the password (or resetting it) revokes all refresh tokens and device
  sessions; the current device keeps working until its access token expires.

## 5. Payments

```
mobile                     API                        Paystack (test)
  │  POST /payments/initialize ──► create pending payment
  │ ◄── { reference, authorizationUrl } ──┤
  │  open checkout ─────────────────────────────────────►  card entry (test card)
  │  GET  /payments/verify/:reference ──► provider verify
  │                                        ├─ status success AND amount match AND
  │                                        │  currency match → credit via ledger
  │ ◄── { credited: true, walletBalance } ──┘
  │                                        └─ mismatch → payment FAILED, notification
  │
  └── webhook (server→server): HMAC-SHA512 over the RAW body, event id dedupe,
      then the same verification + credit path.
```

The raw body is captured by `app.ts` (`express.json({ verify })`) before any parsing,
because signature verification is only meaningful over the exact bytes received.

The demo channel (`channel: 'DEMO'`) runs the identical verification path against a
simulated provider so the flow can be exercised without keys. It is rejected for any
Paystack-backed payment (`409 DEMO_ONLY`) so a demo confirmation can never settle a
real intent.

## 6. Error model and observability

* Envelope: `{ data, meta? }` on success, `{ error: { code, message, details? }, requestId }`
  on failure. Codes are stable strings (`INSUFFICIENT_FUNDS`, `PIN_INVALID`,
  `IDEMPOTENCY_KEY_REUSED`, `PAYMENT_AMOUNT_MISMATCH`, …) and the mobile client maps a
  few of them to specific copy.
* PostgreSQL/Drizzle errors are unwalked to their driver code (`pgErrorCode`) so unique
  violations map to `409` rather than `500`.
* Every response carries a `requestId`; pino logs are JSON in production and pretty in
  development, with `password`, `pin`, `token`, `authorization` and `secret` redacted.
* `/api/health` reports service, environment, demo mode, whether Paystack is
  configured, and database latency.

## 7. Mobile architecture

```
index.js → src/App.tsx
  Provider (Redux) → SafeAreaProvider → ThemeProvider → RootNavigator
                                            ├── AuthNavigator  (welcome, login, register,
                                            │                   verify, forgot, reset)
                                            └── MainNavigator  (bottom tabs)
                                                  ├── Home        (balance, quick actions, recent)
                                                  ├── Transactions (filters, pagination, receipts)
                                                  ├── Cards        (demo UI)
                                                  ├── Activity     (notifications)
                                                  └── Profile      (security, settings, ledger)
                                            + modals: FundWallet, SendMoney, Withdraw,
                                                      AddBeneficiary
```

* **State**: one slice per domain. Thunks own the async work and return reject values
  `{ message, code }` so screens can show server copy verbatim.
* **Money**: `utils/money.ts` is the only place that formats or parses amounts; the
  store holds kobo.
* **Theme**: `theme/colors.ts` defines the palette (primary `#39FF14`, dark bg
  `#080B09`, light bg `#F7F9F7`, muted `#818B83`, success/warning/error) and
  `ThemeProvider` resolves SYSTEM/LIGHT/DARK from Redux + `Appearance`.
* **Offline behaviour**: the client fails loudly rather than optimistically. A failed
  transfer leaves the balance untouched; failed payments are shown as failed.

## 8. Deployment notes

* The API is stateless apart from PostgreSQL, so it scales horizontally; the only
  shared state is the database and the JWT secrets.
* Run `npm run db:migrate` (idempotent, tracked in `schema_migrations`) before or as
  part of a deploy, then `npm run db:reconcile` as a post-deploy check.
* `DEMO_MODE` must be `false` outside development: it is what allows OTP codes and
  reset tokens to be echoed by the API.
* Rate limits are per-instance; put a shared limiter in front if you run more than one.

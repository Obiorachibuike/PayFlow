# Testing

```bash
cd backend && npm test          # 111 tests / 8 suites
cd backend && npm run test:coverage
cd mobile  && npm test          # 56 tests / 8 suites
cd backend && npm run typecheck # tsc --noEmit (strict + noUncheckedIndexedAccess)
cd mobile  && npm run typecheck
```

Both suites are hermetic: the backend starts a real PostgreSQL 18 instance with
`embedded-postgres` (no Docker, no system service), and the mobile suite mocks every
Expo/native module and never touches the network.

## Backend (`backend/tests`)

| Suite | What it proves |
| --- | --- |
| `auth.test.ts` (13) | Registration + email verification, login lockout, refresh rotation, replay detection revoking the family and device sessions, logout, password reset, OTP resend, protected routes |
| `ledger.test.ts` (8) | Every ledger transaction balances, wallet balances equal their ledger entries, funding and transfer post the expected legs, entries are immutable at the DB level, unbalanced writes and direct overdraws are rejected, a demo payment is never credited twice, the owner can read their ledger |
| `transfers.test.ts` (14) | PIN enforcement, self-transfer, unknown recipient, limits, insufficient funds, idempotency (same key → one movement; same key + different body → `422`), concurrency (parallel same-key requests create exactly one transfer; two 60%-of-balance debits produce one success and one `INSUFFICIENT_FUNDS`), receipts |
| `payments.test.ts` (15) | Initialise with limits and idempotency, verify credits only on provider success, amount and currency mismatch handling, failed and pending provider states, cross-user verification attempts, webhook signature rejection, duplicate suppression, unhandled events, simulated failure, `DEMO_ONLY` guard |
| `withdrawals.test.ts` (15) | Simulated payout moves money and is labelled simulated, ledger reconciles, wrong PIN does not move money, overdraw and limits rejected, beneficiary or full bank details required, idempotency, beneficiary withdrawals, notification content, listing/detail/ownership, audit log |
| `beneficiaries.test.ts` (12) | Save/list/ownership, 10-digit validation, unknown bank, duplicates, single default, rename without changing bank details, soft delete, cross-user isolation, simulated name lookup, bank list |
| `wallet.test.ts` (19) | Wallet serialisation and Naira formatting, available balance, isolation between users, money in/out stats, signed amounts and direction, direction/type/search filters, keyset pagination, receipts, notifications (read, read-all, push token), health, docs, 404 envelope, unauthenticated rejection |
| `profile.test.ts` (15) | Profile payload excludes secrets, theme and notification updates, invalid input, password change (wrong current, reuse, sessions revoked, refresh token rejected, new login works, hash stored), PIN change/reset/validation, session list and revocation, biometrics never authorising a debit |

Helpers live in `tests/helpers/harness.ts` (app factory, database reset, user factory,
funding helper) and `tests/setup/*` (env, embedded PostgreSQL lifecycle).

## Mobile (`mobile/src`)

| Suite | What it proves |
| --- | --- |
| `utils/money.test.ts` | Naira formatting across magnitudes, signed amounts, parsing typed/pasted input, rejecting non-amounts, round-tripping, fee rounding |
| `utils/validation.test.ts` | Email, Nigerian phone normalisation, password strength, weak PIN detection, account numbers, full names |
| `store/authSlice.test.ts` | Login success/failure transitions, logout and forced sign-out clearing credentials, merging profile updates, theme preference mapping |
| `store/operationsSlice.test.ts` | An idempotency key is minted once per money operation, reused when a retry follows a lost response, honoured when supplied, and cleared after the movement succeeds |
| `services/__tests__/client.test.ts` | Envelope unwrapping, query building, error mapping to `ApiError`, network failure handling, idempotency header, single-flight refresh with retry, sign-out when the refresh is rejected |
| `components/__tests__/AmountInput.test.tsx` | Typed naira → kobo, pasted formatting stripped, invalid input reports zero, formatted hint, maximum warning |
| `components/__tests__/TransactionRow.test.tsx` | Title/amount/direction rendering, press callback, failure reason instead of timestamp |
| `screens/auth/__tests__/LoginScreen.test.tsx` | Invalid email and short password never reach the API, email trimmed and lower-cased with a device context, server message surfaced, demo credentials shown |

`src/test/render.tsx` renders screens with the real providers (Redux store, safe area,
theme). RNTL 14’s `render` and `fireEvent` are asynchronous — **await them**; the setup
file awaits `cleanup()` after each test to avoid overlapping `act()` scopes.

## Continuous integration

```yaml
# .github/workflows/ci.yml (suggested)
- run: npm ci && npm run typecheck && npm test   # in backend/
- run: npm ci && npm run typecheck && npm test   # in mobile/
```

The backend suite needs no services; it boots its own PostgreSQL. Add
`npm run db:reconcile` as a post-deploy smoke check.

# Security model

PayFlow is a demo, but it is built as if real money depended on it. This document lists
the controls that exist, the places where the demo intentionally stops, and what would
be required before this could hold real funds.

## 1. Credentials

| Credential | Storage | Notes |
| --- | --- | --- |
| Password | `users.password_hash` (bcrypt, configurable cost) | Never logged, never returned by any endpoint; `serializeUser` has no `passwordHash` field |
| Transaction PIN | `transaction_pins.pin_hash` (bcrypt) | Verified server-side for every transfer and withdrawal; lockout after repeated failures |
| Access token | Mobile secure storage (Keychain/Keystore) | JWT, short TTL, verified on every request |
| Refresh token | Stored **hashed** server-side; kept in secure storage on device | Rotates on every use |
| Device identifier | Secure storage, per install | Used for the session list and push tokens |
| Paystack secret key | Server environment only | Never bundled, never returned; the app only receives a checkout URL |

The API logger redacts `password`, `confirmPassword`, `pin`, `newPin`, `currentPin`,
`token`, `refreshToken`, `accessToken`, `authorization` and `secret` keys from every log
line.

## 2. Session handling

```
access token  ── 15 min, stateless, carries userId + sessionId (sid) + jti
refresh token ── 30 days, random id + 256-bit secret, stored hashed, rotated on use
```

* Every refresh revokes the presented token and issues a new one atomically.
* Presenting a token that was already rotated or revoked triggers **replay detection**:
  the whole token family and every device session for that user are revoked, and the
  request fails with `401 TOKEN_REUSE_DETECTED`.
* `requireAuth` also checks that the `sid` still resolves to an un-revoked
  `device_sessions` row, so revoking a device takes effect on the next request.
* Changing or resetting the password revokes all refresh tokens and device sessions.

## 3. Authorisation

* Every non-public route requires a valid access token; ownership is enforced in the
  query (`WHERE user_id = $1`), never by trusting an id from the client.
* Transfers, withdrawals and funding additionally require `requireVerifiedEmail`.
* Transactions, withdrawals and beneficiaries are scoped to the caller — another
  user’s id returns `404`, not `403`, so ids cannot be probed.

## 4. Money movement controls

* **PIN for every debit.** There is no way to move money with only an access token or a
  biometric.
* **Biometrics are local convenience.** `POST /profile/biometrics` stores a flag; it
  never authorises a payment and the server still requires the PIN.
* **Limits.** Per-transaction minimum/maximum for funding, transfers and withdrawals, a
  daily outflow cap and a maximum wallet balance.
* **Idempotency.** Money routes require an `Idempotency-Key`; replays replay the
  original response instead of executing twice.
* **Ledger invariants.** Database triggers prevent editing or deleting ledger entries;
  balance assertions prevent negative balances; `npm run db:reconcile` verifies the
  books.
* **Provider verification.** A wallet is credited only after the server confirms status,
  amount **and** currency with the provider (or settles a demo payment). The mobile
  “I’ve paid” callback is only a request to verify.

## 5. Webhooks

* Signature: HMAC-SHA512 of the **raw** request body compared in constant time.
* The raw body is captured before JSON parsing (`express.json({ verify })`).
* Every event id is inserted into `webhook_events` with a unique constraint, so a
  redelivery returns `{ outcome: 'duplicate' }` and credits nothing.
* Unhandled event types return `{ outcome: 'ignored' }`.

## 6. Transport & hardening

* Helmet with a CSP tuned for Swagger UI, CORS restricted by `CORS_ORIGINS`, JSON body
  limit, request ids, and rate limits per route family (global, auth, OTP, financial).
* Rate-limit keys are produced with `ipKeyGenerator`, so IPv6 clients are bucketed
  instead of evading limits by rotating through their address range.
* Zod validates every body, query and param; unknown enum values and out-of-range
  amounts are rejected before reaching a service.
* Errors never leak stack traces; production responses carry only `code`, `message`,
  optional `details` and a `requestId`.

## 7. Deliberate demo limitations

These are fine for a portfolio demo and would have to change for real money:

1. `DEMO_MODE=true` echoes email-verification codes and password-reset tokens in API
   responses. **Never** enable it outside development.
2. Withdrawals are simulated: the wallet is debited into `SYS:PAYMENT_CLEARING` and no
   bank transfer is made.
3. Beneficiary account names are user-supplied and stored as `UNVERIFIED`; the
   `/resolve-account` endpoint returns a mock name labelled `SIMULATED`.
4. Paystack keys are **test** keys. Real keys, real payouts and KYC are out of scope.
5. The Cards tab is static UI. No card is issued and no card data is ever collected.
6. Logs are written to stdout in JSON; a production deployment would ship them to a
   store with restricted access and a retention policy.

## 8. Reporting a problem

This is a portfolio project with no bug bounty. Open an issue in the repository with a
description and the `requestId` from the error response.

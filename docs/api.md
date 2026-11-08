# PayFlow API

Interactive OpenAPI 3.0.3 documentation is served at **`/api/docs`** and generated from
`backend/src/docs/openapi.ts`. This page is a condensed reference.

Base URL: `http://localhost:4000/api` (override with `PORT`).

## Conventions

* Success: `{ "data": …, "meta": { … } }`
* Failure: `{ "error": { "code": "…", "message": "…", "details": … }, "requestId": "…" }`
* All money is **integer minor units** (kobo). `amountMinor: 150000` means ₦1,500.00.
* Money-moving routes require an `Idempotency-Key` header.
* Authenticated routes require `Authorization: Bearer <access token>`.

### Common error codes

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Body/query failed Zod validation |
| 400 | `IDEMPOTENCY_KEY_REQUIRED` | Money route called without an idempotency key |
| 400 | `PIN_INVALID` | Wrong transaction PIN |
| 400 | `LIMIT_EXCEEDED` | Below minimum / above maximum / daily outflow cap |
| 400 | `INVALID_ACCOUNT_DETAILS` | Account number that is not 10 digits |
| 401 | `UNAUTHORIZED`, `INVALID_TOKEN`, `TOKEN_EXPIRED`, `INVALID_CREDENTIALS` | Missing/expired/bad credentials |
| 401 | `TOKEN_REUSE_DETECTED` | Refresh token replay — every session was revoked |
| 403 | `EMAIL_NOT_VERIFIED` | Action requires a verified email |
| 404 | `RECIPIENT_NOT_FOUND`, `BENEFICIARY_NOT_FOUND`, `BANK_NOT_FOUND`, `NOT_FOUND` | Unknown resource |
| 409 | `INSUFFICIENT_FUNDS` | Wallet cannot cover the debit |
| 409 | `SELF_TRANSFER`, `DUPLICATE_BENEFICIARY`, `CONFLICT` | Rule violation |
| 409 | `PAYMENT_AMOUNT_MISMATCH`, `PAYMENT_CURRENCY_MISMATCH` | Verified charge does not match the intent |
| 409 | `DEMO_ONLY` | Demo confirmation attempted on a provider payment |
| 422 | `IDEMPOTENCY_KEY_REUSED` | Same key, different body |
| 429 | `RATE_LIMITED` | Rate limit hit |

## Health & docs

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/health` | Service, environment, `demoMode`, `paystackConfigured`, DB latency |
| GET | `/docs` | Swagger UI |

## Auth — `/auth`

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| POST | `/register` | `fullName, email, phone, password, confirmPassword, device` | Creates wallet + ledger account; returns `verification.demoCode` in demo mode |
| POST | `/login` | `email, password, device` | Returns user, tokens, wallet |
| POST | `/refresh` | `refreshToken` | Rotates the refresh token |
| POST | `/logout` | `refreshToken` | Revokes the token and its device session |
| POST | `/verify-email` | `code` | Returns an updated user |
| POST | `/resend-verification` | – | Issues a new code |
| POST | `/forgot-password` | `email` | Returns `resetToken` in demo mode |
| POST | `/reset-password` | `token, password, confirmPassword` | Revokes all sessions |

## Wallet — `/wallet`

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/` | Wallet, stats and five recent transactions |
| GET | `/balance` | Balance, available balance, pending outflow, `asOf` |
| GET | `/transactions?limit&cursor&status&direction` | Keyset-paginated feed for the wallet |
| GET | `/ledger?limit` | Read-only ledger entries behind the balance |
| POST | `/` | Idempotent wallet creation (NGN only today) |

## Payments — `/payments`

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/initialize` | `amountMinor` (or `amount`), `channel: 'PAYSTACK' \| 'DEMO'`, optional `simulate`. Requires `Idempotency-Key`. Returns `reference` + `authorizationUrl` |
| GET | `/verify/:reference` | Re-verifies with the provider; credits only on success with a matching amount **and** currency |
| POST | `/demo/confirm` | `{ reference }` — settles a DEMO-channel payment through the same path |
| POST | `/webhook` | Paystack webhook: HMAC-SHA512 over the raw body, event-id dedupe |

`GET /payments/verify/:reference` responds with
`{ reference, status, alreadyProcessed, credited, amountMinor, walletBalanceMinor, payment, transaction, message }`.

## Transfers — `/transfers`

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/resolve-recipient` | `{ email }`, `{ phone }` or `{ walletTag }` → `{ recipient: { name, walletTag, maskedWalletTag, avatarColor, walletId, userId } }` |
| POST | `/` | `{ recipient, amountMinor, description?, pin }` + `Idempotency-Key` → `{ transaction, walletBalanceMinor, receipt }` |
| GET | `/:id` | Single transfer |

## Withdrawals — `/withdrawals`

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/` | `{ amountMinor, pin, beneficiaryId? | bankCode/bankName/accountName/accountNumber, narration? }` + `Idempotency-Key` → `{ withdrawal, receipt }` (always `simulated: true`) |
| GET | `/` | Recent withdrawals |
| GET | `/:id` | Single withdrawal (owner only) |

## Beneficiaries — `/beneficiaries`, `/banks`

| Method | Path | Notes |
| --- | --- | --- |
| GET, POST | `/beneficiaries` | List / create (`bankCode, accountNumber, accountName, isDefault?`) |
| PATCH, DELETE | `/beneficiaries/:id` | Rename or make default; soft delete |
| POST | `/beneficiaries/resolve-account` | `{ accountNumber, bankCode }` → simulated name lookup (`verificationStatus: 'SIMULATED'`) |
| GET | `/banks` | Active bank list |

Saved beneficiaries are always `verifiedStatus: 'UNVERIFIED'` — PayFlow never claims a
bank verified a name.

## Transactions — `/transactions`

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/?limit&cursor&status&type&direction&search&from&to` | Keyset pagination, filters, ILIKE search over reference/description/counterparty |
| GET | `/:id` | Single transaction (owner only) |
| GET | `/:id/receipt` | Branded receipt payload, including `simulated` and the ledger reference |

## Notifications — `/notifications`

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/?limit&cursor&unreadOnly` | Feed |
| PATCH | `/:id/read` | Mark one read |
| POST | `/read-all` | Mark all read, returns `{ updated }` |
| POST | `/push-token` | `{ pushToken }` — registers an Expo push token for the current device session |

## Profile — `/profile`

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/` | User, wallet, stats and security summary (`pinConfigured`, `activeSessions`, …) |
| PATCH | `/` | `fullName`, `avatarColor`, `themePreference`, `biometricEnabled`, `notify*` |
| PATCH | `/password` | `{ currentPassword, newPassword }` — revokes all sessions |
| PATCH | `/pin` | `{ newPin, currentPin? , password? }` — create or change the PIN |
| POST | `/biometrics` | `{ enabled }` — local convenience toggle only |
| GET | `/sessions` | Devices with `current` flag |
| DELETE | `/sessions/:id` | Revoke one session |

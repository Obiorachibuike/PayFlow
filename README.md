# PayFlow

**A portfolio-grade fintech wallet: real double-entry accounting, sandbox payments, zero fake money.**

PayFlow is a full-stack mobile wallet built as a demonstration of production-grade
fintech engineering: a React Native (Expo) client, a Node/Express/TypeScript API and a
PostgreSQL ledger that never loses a kobo.

> ### ⚠️ This is a demo, not a bank
> PayFlow is a **portfolio project**. It is not a licensed financial product and it does
> not move real money:
> * Wallet funding runs on **Paystack test keys** (or a fully simulated demo channel).
> * Withdrawals are **simulated** — money leaves the wallet into a sandbox clearing
>   account and no bank transfer is ever made.
> * Beneficiary account names are typed by the user and are **never** presented as
>   bank-verified.
> * The **Cards** tab is UI-only. PayFlow issues no cards and never stores a card
>   number or CVV.
> * Seeded demo balances are clearly labelled.
>
> Every screen that shows money carries a demo banner, and every receipt states whether
> the movement was simulated or a Paystack test transaction.

---

## Table of contents

1. [What it does](#what-it-does)
2. [Screens](#screens)
3. [Architecture](#architecture)
4. [Tech stack](#tech-stack)
5. [Repository layout](#repository-layout)
6. [Quick start](#quick-start)
7. [Demo accounts & demo script](#demo-accounts--demo-script)
8. [Money, ledger and correctness rules](#money-ledger-and-correctness-rules)
9. [Security model](#security-model)
10. [Payments (Paystack test mode)](#payments-paystack-test-mode)
11. [Testing](#testing)
12. [API documentation](#api-documentation)
13. [Building the Android app (EAS)](#building-the-android-app-eas)
14. [Environment variables](#environment-variables)
15. [Limitations & roadmap](#limitations--roadmap)
16. [License](#license)

---

## What it does

| Area | Capability |
| --- | --- |
| Accounts | Email + password registration, OTP email verification (demo code echoed), password reset that signs every device out |
| Sessions | Short-lived JWT access tokens, rotating refresh tokens with replay detection, per-device session list with remote revoke |
| Wallet | One NGN wallet per user, wallet tag (`PF-1234-5678`), live balance derived from the ledger, hide-balance toggle |
| Funding | Paystack **test** checkout or an instant demo credit; the wallet moves **only** after server-side verification |
| Transfers | P2P transfers by email / phone / wallet tag, authorised by a 4-digit transaction PIN, idempotent per key |
| Withdrawals | Simulated payouts to saved beneficiaries or ad-hoc bank details, PIN-authorised, labelled simulated everywhere |
| Beneficiaries | Save, rename, default and soft-delete accounts; simulated (clearly labelled) name lookup |
| History | Filterable, keyset-paginated transaction feed, transaction detail, branded PDF receipt via share sheet |
| Notifications | Server-generated activity feed (payments, transfers, security alerts) + Expo push token registration |
| Profile & settings | Edit name/avatar colour, change password, create/change PIN, biometrics toggle, device list, ledger audit view, light/dark/system theme |
| Ops | `/api/health`, structured redacted logs, OpenAPI docs, ledger reconciliation CLI, rate limiting on auth and money routes |

---

## Screens

Five bottom tabs, each a nested stack:

| Tab | What is on it |
| --- | --- |
| **Home** | Greeting, unread badge, balance card with hide/show, quick actions (Add money, Send, Withdraw, Beneficiaries), money-in/out tiles, balance trend sparkline, recent activity |
| **Transactions** | Search + direction and status filters, keyset-paginated feed, transaction detail with shareable PDF receipt |
| **Cards** | Demo-only virtual card preview with an explicit “not issued” notice |
| **Activity** | Day-grouped notification feed; failed payments are surfaced as failed, never as successful |
| **Profile** | Identity, KYC/email status, security (PIN, password, devices, biometrics), beneficiaries, settings, read-only ledger entries |

Money flows open as modals: **Add money**, **Send money** (resolve recipient → amount → PIN → receipt),
**Withdraw** (beneficiary or manual bank details → amount → PIN → simulated settlement).

> **Screenshots.** This repository is developed in a headless sandbox, so captured
> device screenshots are not committed here. The app runs in a browser via
> `npm run web` in `mobile/` (or as an Android build) — see
> [`docs/screenshots/README.md`](docs/screenshots/README.md) for the exact frames to
> capture and where to drop them (`docs/screenshots/*.png`, referenced below).

---

## Architecture

```
┌──────────────────────────┐        HTTPS/JSON         ┌──────────────────────────────┐
│  Mobile app (Expo/RN)    │  Bearer JWT + refresh     │  PayFlow API (Express 5)     │
│  Redux Toolkit store     │ ───────────────────────►  │  Zod validation, rate limits │
│  SecureStore tokens      │ ◄───────────────────────  │  Services → Drizzle → PG     │
└──────────────────────────┘   { data, meta } envelope └───────────────┬──────────────┘
                                                                       │
                                                         ┌─────────────▼─────────────┐
                                                         │ PostgreSQL 18             │
                                                         │ double-entry ledger       │
                                                         │ immutable entry triggers  │
                                                         └─────────────┬─────────────┘
                                                                       │
                                                        ┌──────────────▼──────────────┐
                                                        │ Paystack TEST API (server   │
                                                        │ side only; secret key never │
                                                        │ leaves the backend)         │
                                                        └─────────────────────────────┘
```

Full write-up: [`docs/architecture.md`](docs/architecture.md) (data model, ledger
design, idempotency, token rotation, error envelope, deployment notes).

---

## Tech stack

**Mobile** — Expo SDK 58 · React Native 0.88 · React 19.3 · TypeScript strict ·
React Navigation 7 (native stack + bottom tabs) · Redux Toolkit 2 · Expo SecureStore,
LocalAuthentication, Notifications, Print/Sharing (PDF receipts), Haptics ·
Jest + `@testing-library/react-native`.

**Backend** — Node 22 · Express 5 · TypeScript strict · Drizzle ORM + `pg` ·
PostgreSQL 18 · Zod · JWT (jsonwebtoken) · bcryptjs · Helmet · pino ·
express-rate-limit · swagger-ui-express · Jest + Supertest against an embedded
PostgreSQL instance.

No Prisma (its engine downloads are unavailable in this environment), so migrations are
hand-written SQL applied by a deterministic runner in `backend/drizzle/`.

---

## Repository layout

```
PayFlow/
├── backend/
│   ├── drizzle/0000_init.sql     # schema, ledger triggers, balance assertions
│   ├── scripts/dev-db.mjs        # one-command local PostgreSQL + migrate + seed
│   ├── scripts/seed.ts           # demo banks, users, activity
│   ├── src/
│   │   ├── app.ts, server.ts     # Express app + bootstrap
│   │   ├── config/               # zod-validated env, pino logger with redaction
│   │   ├── db/                   # pool, schema, transaction helper, migration runner
│   │   ├── docs/openapi.ts       # OpenAPI 3.0.3 spec (served at /api/docs)
│   │   ├── middleware/           # auth, rate limits, idempotency, errors, request id
│   │   ├── modules/              # auth, wallet, ledger, payments, transfers,
│   │   │                         # withdrawals, beneficiaries, transactions,
│   │   │                         # notifications, profile, audit, security
│   │   └── utils/                # money (kobo), errors, crypto, references, serializers
│   └── tests/                    # 111 Jest/Supertest tests
├── mobile/
│   ├── app.json, app.config.js, eas.json
│   ├── assets/                   # icon, adaptive icon, splash, favicon
│   └── src/
│       ├── components/           # design-system primitives
│       ├── navigation/           # root, auth, tab navigator
│       ├── screens/              # auth, home, transactions, cards, activity,
│       │                         # profile, wallet flows, beneficiaries
│       ├── services/             # API client (refresh rotation), storage, device
│       ├── store/                # RTK slices + thunks
│       ├── theme/                # palette, spacing, typography, ThemeProvider
│       └── utils/                # money, validation, formatting, ids
└── docs/                         # architecture, api, security, testing, demo script
```

---

## Quick start

Requirements: Node 20+, npm, and (for the API) a PostgreSQL instance — the bundled
script can run an embedded one for you.

```bash
# 1. Backend
cd backend
npm install
cp .env.example .env          # then edit DATABASE_URL / JWT secrets
npm run db:setup              # starts a local PostgreSQL, migrates and seeds
npm run dev                   # http://localhost:4000  →  docs at /api/docs

# 2. Mobile (in a second terminal)
cd mobile
npm install
EXPO_PUBLIC_API_BASE_URL=http://localhost:4000 npm start   # scan the QR with Expo Go
# or, for a browser build:
EXPO_PUBLIC_API_BASE_URL=http://localhost:4000 npm run web
```

`npm run db:setup` starts PostgreSQL on `127.0.0.1:55432` using `embedded-postgres`,
applies `drizzle/0000_init.sql` and seeds 16 banks plus two demo users. Use
`npm run db:reset` to wipe and start over, and `npm run db:reconcile` to verify that
the ledger balances and every wallet matches its entries.

---

## Demo accounts & demo script

| Email | Password | PIN | Opening balance |
| --- | --- | --- | --- |
| `ada@payflow.demo` | `Flow1234` | `1234` | ₦96,000.00 |
| `tunde@payflow.demo` | `Flow1234` | `1234` | ₦57,500.00 |

A guided click-through lives in [`docs/demo-script.md`](docs/demo-script.md). In short:

1. Sign in (or register — the verification code is shown on screen in demo mode and
   logged by the API in development).
2. **Add money → Demo credit → ₦2,000 → Continue → I’ve paid — verify.** The wallet
   moves only after the server confirms the reference.
3. **Send →** enter the other demo email → amount → PIN `1234`.
4. **Withdraw →** pick or add a beneficiary → amount → PIN `1234`. The receipt says
   *simulated*.
5. **Profile → Ledger entries** to see the debit/credit pair behind every movement.

---

## Money, ledger and correctness rules

These are enforced by the database and covered by tests, not by convention:

* **Integer minor units only.** All money is kobo (`bigint`). No floats. The mobile
  client converts typed naira to kobo at the edge; the server re-validates.
* **Double entry.** Every movement posts a balanced ledger transaction — debits equal
  credits, per transaction and globally.
* **Append-only.** `UPDATE`/`DELETE` on `ledger_entries` raise a database error; a
  correction is a new entry, never an edit.
* **Wallets have no independent balance.** `wallets.balance_minor` is a cache
  maintained inside the same transaction as the entries and asserted against the
  ledger by `npm run db:reconcile`.
* **Idempotency.** Money-moving routes require an `Idempotency-Key`; a replay returns
  the original result, and reusing a key with a different body is a `422`.
* **No negative balances.** Balance assertions inside the ledger write path reject an
  overdraw even if a service is called directly.
* **Failed means failed.** A payment that the provider does not confirm — or that
  mismatches on amount or currency — is marked `FAILED`, notified as failed, and never
  credited.

---

## Security model

Details in [`docs/security.md`](docs/security.md). Highlights:

* Passwords and transaction PINs are bcrypt-hashed; neither is ever logged, returned
  or stored in plain text. The pino logger redacts `password`, `pin`, `token`,
  `authorization` and `secret` fields.
* Access tokens live ~15 minutes; refresh tokens rotate on every use. Presenting an
  already-used refresh token is treated as theft: the whole rotation family is revoked
  and the request is rejected with `TOKEN_REUSE_DETECTED`.
* Biometrics are a **local convenience only**. They can unlock the app; they never
  authorise a payment — the PIN is still required and re-verified server-side.
* Paystack webhooks are verified with HMAC-SHA512 over the **raw** request body, and
  every event id is stored so a redelivery cannot credit twice.
* The mobile app never holds a Paystack key of any kind; it only ever receives a
  hosted checkout URL from the backend.
* Rate limits are applied per route family (global, auth, OTP, financial), and
  IPv6 clients are bucketed so limits cannot be evaded by rotating addresses.

---

## Payments (Paystack test mode)

1. `POST /api/payments/initialize` creates a pending payment server-side and returns a
   Paystack **test** checkout URL (`channel: 'PAYSTACK'`) or a demo intent
   (`channel: 'DEMO'`).
2. The app opens the URL in a browser / in-app webview. **The mobile callback is never
   trusted** — it does not carry money.
3. The app calls `GET /api/payments/verify/:reference`; the server asks Paystack and
   credits the wallet **only** when status is success **and** amount and currency match
   the pending payment exactly. Mismatches return `409 PAYMENT_AMOUNT_MISMATCH` /
   `PAYMENT_CURRENCY_MISMATCH` and mark the payment failed.
4. `POST /api/payments/webhook` handles `charge.success` asynchronously with signature
   verification and a `webhook_events` dedupe table, so a duplicate delivery is a no-op.

Without Paystack keys configured, use the `DEMO` channel: it exercises the identical
verification path with a simulated provider.

---

## Testing

```bash
cd backend && npm test        # 111 tests, 8 suites, real PostgreSQL via embedded-postgres
cd mobile  && npm test        # 53 tests, 7 suites (Jest + React Native Testing Library)
cd mobile  && npm run typecheck
cd backend && npm run typecheck
```

Coverage highlights (see [`docs/testing.md`](docs/testing.md)):

* **Ledger**: every transaction balances, wallet balances reconcile, entries are
  immutable at the DB level, unbalanced writes and direct overdraws are rejected, a
  demo payment is never credited twice.
* **Auth**: rotation, replay detection, lockout, password reset revoking sessions,
  email verification gating.
* **Transfers/withdrawals**: PIN enforcement, limits, idempotency, concurrency
  (two parallel requests with the same key produce exactly one movement; two
  competing debits produce one success and one `INSUFFICIENT_FUNDS`).
* **Payments**: verification with matching/mismatching amount and currency, failed and
  pending provider states, webhook signature rejection, duplicate suppression, demo
  channel.
* **Mobile**: money formatting/parsing, validation rules, auth/settings reducers,
  API client (envelope unwrapping, single-flight token refresh, error mapping,
  idempotency header), and the login screen’s validation and submission behaviour.

---

## API documentation

Interactive docs: **http://localhost:4000/api/docs** (generated from
`backend/src/docs/openapi.ts`). A condensed endpoint list with error codes is in
[`docs/api.md`](docs/api.md).

Responses use one envelope:

```jsonc
// success
{ "data": { ... }, "meta": { "limit": 20, "hasMore": true, "nextCursor": "..." } }
// failure
{ "error": { "code": "INSUFFICIENT_FUNDS", "message": "Insufficient wallet balance", "details": { } },
  "requestId": "9b1f…" }
```

---

## Building the Android app (EAS)

`mobile/eas.json` defines `development`, `preview` (APK, internal distribution) and
`production` profiles, each with `EXPO_PUBLIC_API_BASE_URL` baked in.

```bash
cd mobile
npm install -g eas-cli
eas login
eas build --profile preview --platform android    # APK for testers
eas build --profile production --platform android # AAB for the Play Store
eas submit --platform android --latest
```

For a bare workflow, `npx expo prebuild` generates `android/` and `ios/`. The
Android package is `com.payflow.app`.

---

## Environment variables

**Backend** (`backend/.env`, documented in `backend/.env.example`): `DATABASE_URL`,
`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `PORT`, `CORS_ORIGINS`, `BCRYPT_ROUNDS`,
`DEMO_MODE`, Paystack test keys (`PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`,
`PAYSTACK_WEBHOOK_SECRET`, `PAYSTACK_BASE_URL`), rate-limit and money limits.
`.env` is git-ignored; only `.env.example` is committed.

**Mobile**: `EXPO_PUBLIC_API_BASE_URL` (defaults to `http://localhost:4000`; see
`app.config.js`). Nothing secret is ever bundled.

---

## Limitations & roadmap

* Single currency (NGN) — the schema and money helpers are currency-ready.
* No real KYC, no real payouts, no card issuing (by design).
* PDF receipts are generated on-device with `expo-print`; no server-side statement
  service.
* Push notifications register a token and render an in-app feed; a real Expo push
  pipeline requires an account project.
* Roadmap: multi-currency wallets, statement export API, admin reconciliation
  dashboard, scheduled transfers, biometric-secured PIN vault.

---

## License

MIT — see [`LICENSE`](LICENSE).

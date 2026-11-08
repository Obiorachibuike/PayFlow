# PayFlow API

Express 5 + TypeScript (strict) + PostgreSQL + Drizzle ORM. Double-entry ledger,
immutable entries, Paystack **test-mode** funding, simulated withdrawals.

See the [root README](../README.md) for the product overview and
[`docs/`](../docs) for architecture, API reference, security and testing notes.

## Getting started

```bash
npm install
cp .env.example .env     # set DATABASE_URL and JWT secrets
npm run db:setup         # local PostgreSQL (55432) + migrations + seed
npm run dev              # http://localhost:4000
```

* OpenAPI docs: **http://localhost:4000/api/docs**
* Health: **http://localhost:4000/api/health**

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | `tsx watch` development server |
| `npm run build` / `npm start` | Compile to `dist/` (excludes tests) and run |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:setup` | Start a local embedded PostgreSQL, migrate, seed |
| `npm run db:reset` | Wipe the local data directory and start over |
| `npm run db:migrate` | Apply `drizzle/*.sql` (tracked in `schema_migrations`) |
| `npm run db:seed` | Demo banks, users and activity |
| `npm run db:reconcile` | Assert the ledger balances and wallets match their entries |
| `npm test` | Jest + Supertest against a real PostgreSQL instance |

## Layout

```
src/
├── app.ts               # Express app: helmet, cors, rate limits, request id, raw body
├── server.ts            # bootstrap + graceful shutdown
├── config/              # zod-validated env, pino logger (redaction)
├── db/                  # pool, drizzle schema, transaction helper, migration runner
├── docs/openapi.ts      # OpenAPI 3.0.3 served at /api/docs
├── middleware/          # auth, idempotency, rate limits, errors, request context
├── modules/             # auth, wallet, ledger, payments, transfers, withdrawals,
│                        # beneficiaries, transactions, notifications, profile,
│                        # audit, security (PIN)
├── utils/               # money (kobo), errors, crypto, references, serializers
tests/                   # 111 tests, 8 suites
drizzle/0000_init.sql    # schema, ledger triggers, balance assertions
```

## Money rules (non-negotiable)

* All amounts are **integer kobo** (`bigint`). No floats.
* Every movement is a balanced ledger transaction; entries are **append-only**
  (database triggers block `UPDATE`/`DELETE`).
* `wallets.balance_minor` is a cache maintained inside the same transaction as the
  entries and verified by `npm run db:reconcile`.
* Money routes require an `Idempotency-Key` and select the wallet `FOR UPDATE`, so
  retries and races cannot double-move money.
* A wallet is credited **only** after server-side verification of status, amount and
  currency — never from a mobile callback.

## Demo mode

With `DEMO_MODE=true` the API echoes email-verification codes and password-reset
tokens so the flows can be completed without an email provider. **Set it to `false`
anywhere that is not development.**

Paystack keys are **test** keys only. Without them, use `channel: 'DEMO'` on
`POST /api/payments/initialize` — it runs the identical verification path with a
simulated provider.

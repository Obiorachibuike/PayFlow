-- PayFlow initial schema
-- All monetary values are BIGINT minor units (kobo).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
CREATE TYPE user_status AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');
CREATE TYPE kyc_status AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED');
CREATE TYPE wallet_status AS ENUM ('ACTIVE', 'FROZEN', 'CLOSED');
CREATE TYPE transaction_type AS ENUM ('FUNDING', 'TRANSFER_IN', 'TRANSFER_OUT', 'WITHDRAWAL', 'REFUND', 'PAYMENT', 'ADJUSTMENT');
CREATE TYPE transaction_status AS ENUM ('PENDING', 'PROCESSING', 'SUCCESSFUL', 'FAILED', 'REVERSED');
CREATE TYPE ledger_account_type AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');
CREATE TYPE entry_direction AS ENUM ('DEBIT', 'CREDIT');
CREATE TYPE payment_channel AS ENUM ('PAYSTACK', 'DEMO');
CREATE TYPE payment_status AS ENUM ('PENDING', 'SUCCESSFUL', 'FAILED', 'ABANDONED');
CREATE TYPE verification_status AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'SIMULATED', 'FAILED');
CREATE TYPE otp_type AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET', 'PHONE_VERIFICATION', 'LOGIN_2FA');
CREATE TYPE notification_type AS ENUM ('WALLET_FUNDED', 'TRANSFER_RECEIVED', 'TRANSFER_SENT', 'WITHDRAWAL_PROCESSED', 'TRANSACTION_FAILED', 'TRANSACTION_PENDING', 'SECURITY_ALERT', 'SYSTEM');
CREATE TYPE webhook_status AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');
CREATE TYPE theme_preference AS ENUM ('SYSTEM', 'LIGHT', 'DARK');

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  phone text NOT NULL UNIQUE,
  full_name text NOT NULL,
  password_hash text NOT NULL,
  password_updated_at timestamptz NOT NULL DEFAULT now(),
  email_verified_at timestamptz,
  phone_verified_at timestamptz,
  status user_status NOT NULL DEFAULT 'ACTIVE',
  kyc_status kyc_status NOT NULL DEFAULT 'UNVERIFIED',
  failed_login_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  avatar_color text NOT NULL DEFAULT '#39FF14',
  theme_preference theme_preference NOT NULL DEFAULT 'SYSTEM',
  biometric_enabled boolean NOT NULL DEFAULT false,
  notify_push boolean NOT NULL DEFAULT true,
  notify_email boolean NOT NULL DEFAULT true,
  notify_security boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT users_email_lowercase CHECK (email = lower(email)),
  CONSTRAINT users_failed_login_non_negative CHECK (failed_login_attempts >= 0)
);
CREATE INDEX idx_users_status ON users (status);
CREATE INDEX idx_users_created_at ON users (created_at);

CREATE TABLE transaction_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  pin_hash text NOT NULL,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE device_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  device_id text NOT NULL,
  device_name text,
  platform text,
  app_version text,
  ip_address text,
  user_agent text,
  biometric_enabled boolean NOT NULL DEFAULT false,
  push_token text,
  last_active_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_device_sessions_user_device ON device_sessions (user_id, device_id);
CREATE INDEX idx_device_sessions_user_revoked ON device_sessions (user_id, revoked_at);

CREATE TABLE refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  family_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  device_session_id uuid REFERENCES device_sessions (id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_reason text,
  replaced_by_hash text,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_tokens_user_revoked ON refresh_tokens (user_id, revoked_at);
CREATE INDEX idx_refresh_tokens_family ON refresh_tokens (family_id);
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens (expires_at);

CREATE TABLE otp_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type otp_type NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_otp_tokens_user_type ON otp_tokens (user_id, type);
CREATE INDEX idx_otp_tokens_expires ON otp_tokens (expires_at);

-- ---------------------------------------------------------------------------
-- Ledger & wallets
-- ---------------------------------------------------------------------------
CREATE TABLE ledger_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  type ledger_account_type NOT NULL,
  currency text NOT NULL DEFAULT 'NGN',
  balance_minor bigint NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ledger_accounts_type ON ledger_accounts (type);

CREATE TABLE wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  currency text NOT NULL DEFAULT 'NGN',
  wallet_tag text NOT NULL UNIQUE,
  balance_minor bigint NOT NULL DEFAULT 0,
  status wallet_status NOT NULL DEFAULT 'ACTIVE',
  ledger_account_id uuid NOT NULL UNIQUE REFERENCES ledger_accounts (id),
  last_activity_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT wallets_balance_non_negative CHECK (balance_minor >= 0)
);
CREATE UNIQUE INDEX uq_wallets_user_currency ON wallets (user_id, currency);
CREATE INDEX idx_wallets_status ON wallets (status);

CREATE TABLE ledger_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  transaction_id uuid UNIQUE,
  type transaction_type NOT NULL,
  description text NOT NULL,
  currency text NOT NULL DEFAULT 'NGN',
  posted_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ledger_transactions_posted ON ledger_transactions (posted_at);
CREATE INDEX idx_ledger_transactions_type ON ledger_transactions (type);

CREATE TABLE ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_transaction_id uuid NOT NULL REFERENCES ledger_transactions (id) ON DELETE RESTRICT,
  ledger_account_id uuid NOT NULL REFERENCES ledger_accounts (id) ON DELETE RESTRICT,
  direction entry_direction NOT NULL,
  amount_minor bigint NOT NULL,
  currency text NOT NULL DEFAULT 'NGN',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ledger_entries_amount_positive CHECK (amount_minor > 0)
);
CREATE INDEX idx_ledger_entries_account ON ledger_entries (ledger_account_id, created_at);
CREATE INDEX idx_ledger_entries_transaction ON ledger_entries (ledger_transaction_id);

-- ---------------------------------------------------------------------------
-- Transactions & typed records
-- ---------------------------------------------------------------------------
CREATE TABLE transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  type transaction_type NOT NULL,
  status transaction_status NOT NULL DEFAULT 'PENDING',
  amount_minor bigint NOT NULL,
  fee_minor bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'NGN',
  description text,
  sender_wallet_id uuid REFERENCES wallets (id),
  recipient_wallet_id uuid REFERENCES wallets (id),
  sender_name text,
  recipient_name text,
  initiated_by_user_id uuid NOT NULL REFERENCES users (id),
  failure_reason text,
  completed_at timestamptz,
  reversed_at timestamptz,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT transactions_amount_positive CHECK (amount_minor > 0),
  CONSTRAINT transactions_participant_required CHECK (sender_wallet_id IS NOT NULL OR recipient_wallet_id IS NOT NULL)
);
CREATE INDEX idx_transactions_sender ON transactions (sender_wallet_id, created_at);
CREATE INDEX idx_transactions_recipient ON transactions (recipient_wallet_id, created_at);
CREATE INDEX idx_transactions_initiator ON transactions (initiated_by_user_id, created_at);
CREATE INDEX idx_transactions_status ON transactions (status, created_at);
CREATE INDEX idx_transactions_type ON transactions (type, created_at);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  transaction_id uuid UNIQUE REFERENCES transactions (id),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  wallet_id uuid NOT NULL REFERENCES wallets (id) ON DELETE CASCADE,
  provider payment_channel NOT NULL,
  provider_reference text,
  status payment_status NOT NULL DEFAULT 'PENDING',
  amount_minor bigint NOT NULL,
  currency text NOT NULL DEFAULT 'NGN',
  authorization_url text,
  access_code text,
  channel text,
  gateway_response text,
  paid_at timestamptz,
  verified_at timestamptz,
  verify_payload jsonb,
  metadata jsonb,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_amount_positive CHECK (amount_minor > 0)
);
CREATE INDEX idx_payments_user ON payments (user_id, created_at);
CREATE INDEX idx_payments_status ON payments (status);
CREATE INDEX idx_payments_provider_reference ON payments (provider_reference);

CREATE TABLE transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL UNIQUE REFERENCES transactions (id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL REFERENCES users (id),
  recipient_user_id uuid NOT NULL REFERENCES users (id),
  from_wallet_id uuid NOT NULL REFERENCES wallets (id),
  to_wallet_id uuid NOT NULL REFERENCES wallets (id),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT transfers_distinct_wallets CHECK (from_wallet_id <> to_wallet_id)
);
CREATE INDEX idx_transfers_sender ON transfers (sender_user_id, created_at);
CREATE INDEX idx_transfers_recipient ON transfers (recipient_user_id, created_at);

CREATE TABLE beneficiaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  bank_code text NOT NULL,
  bank_name text NOT NULL,
  account_number text NOT NULL,
  account_number_last4 text NOT NULL,
  account_name text NOT NULL,
  verified_status verification_status NOT NULL DEFAULT 'UNVERIFIED',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT beneficiaries_account_number_digits CHECK (account_number ~ '^[0-9]{10}$')
);
CREATE UNIQUE INDEX uq_beneficiaries_user_bank_account ON beneficiaries (user_id, bank_code, account_number);
CREATE INDEX idx_beneficiaries_user ON beneficiaries (user_id, deleted_at);

CREATE TABLE withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL UNIQUE REFERENCES transactions (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id),
  wallet_id uuid NOT NULL REFERENCES wallets (id),
  beneficiary_id uuid REFERENCES beneficiaries (id),
  bank_name text NOT NULL,
  bank_code text NOT NULL,
  account_name text NOT NULL,
  account_number_last4 text NOT NULL,
  simulated boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_withdrawals_user ON withdrawals (user_id, created_at);

CREATE TABLE banks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Platform / operations
-- ---------------------------------------------------------------------------
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  data jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_created ON notifications (user_id, created_at);
CREATE INDEX idx_notifications_user_read ON notifications (user_id, read_at);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  ip_address text,
  user_agent text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_actor ON audit_logs (actor_user_id, created_at);
CREATE INDEX idx_audit_logs_action ON audit_logs (action, created_at);

CREATE TABLE webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider payment_channel NOT NULL,
  event_id text NOT NULL UNIQUE,
  event_type text,
  signature_valid boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL,
  status webhook_status NOT NULL DEFAULT 'RECEIVED',
  error text,
  attempts integer NOT NULL DEFAULT 1,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_webhook_events_provider ON webhook_events (provider, created_at);
CREATE INDEX idx_webhook_events_status ON webhook_events (status);

CREATE TABLE idempotency_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  scope text NOT NULL,
  key text NOT NULL,
  request_hash text NOT NULL,
  status_code integer NOT NULL DEFAULT 0,
  response_body jsonb,
  resource_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX uq_idempotency_user_scope_key ON idempotency_records (user_id, scope, key);
CREATE INDEX idx_idempotency_expires ON idempotency_records (expires_at);

-- ---------------------------------------------------------------------------
-- Ledger integrity guards
-- ---------------------------------------------------------------------------

-- Ledger entries are append-only: no UPDATE, no DELETE. Corrections must be
-- posted as new, reversing entries.
CREATE OR REPLACE FUNCTION payflow_prevent_ledger_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries is append-only (% rejected on %)', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ledger_entries_immutable
  BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION payflow_prevent_ledger_mutation();

CREATE TRIGGER trg_ledger_transactions_immutable
  BEFORE DELETE ON ledger_transactions
  FOR EACH ROW EXECUTE FUNCTION payflow_prevent_ledger_mutation();

-- A materialised ledger account balance may never go negative.
CREATE OR REPLACE FUNCTION payflow_prevent_negative_ledger_balance() RETURNS trigger AS $$
BEGIN
  IF NEW.balance_minor < 0 THEN
    RAISE EXCEPTION 'ledger account % would have a negative balance (%)', NEW.code, NEW.balance_minor
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ledger_account_balance_non_negative
  BEFORE UPDATE ON ledger_accounts
  FOR EACH ROW EXECUTE FUNCTION payflow_prevent_negative_ledger_balance();

-- A posted ledger transaction must balance: total debits = total credits.
CREATE OR REPLACE FUNCTION payflow_assert_balanced_ledger_transaction(target uuid) RETURNS void AS $$
DECLARE
  debit_total bigint;
  credit_total bigint;
BEGIN
  SELECT COALESCE(SUM(amount_minor) FILTER (WHERE direction = 'DEBIT'), 0),
         COALESCE(SUM(amount_minor) FILTER (WHERE direction = 'CREDIT'), 0)
    INTO debit_total, credit_total
    FROM ledger_entries
   WHERE ledger_transaction_id = target;

  IF debit_total <> credit_total THEN
    RAISE EXCEPTION 'unbalanced ledger transaction %: debits=% credits=%', target, debit_total, credit_total
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- System ledger accounts (fixed ids so migrations/seeds can be idempotent)
-- ---------------------------------------------------------------------------
INSERT INTO ledger_accounts (id, code, name, type, currency, balance_minor, is_system)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'SYS:PAYMENT_CLEARING', 'Payment clearing (sandbox cash)', 'ASSET', 'NGN', 0, true),
  ('00000000-0000-4000-8000-000000000002', 'SYS:PLATFORM_REVENUE', 'Platform revenue', 'REVENUE', 'NGN', 0, true),
  ('00000000-0000-4000-8000-000000000003', 'SYS:TRANSFER_CLEARING', 'Internal transfer clearing', 'LIABILITY', 'NGN', 0, true)
ON CONFLICT (code) DO NOTHING;

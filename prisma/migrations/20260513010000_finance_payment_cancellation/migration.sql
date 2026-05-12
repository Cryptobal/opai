-- Add cancellation fields to FinancePayment so an admin revert can mark
-- a payment as cancelled when its last linked rendicion is unwound.
ALTER TABLE finance.finance_payments
  ADD COLUMN IF NOT EXISTS cancelled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS cancelled_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS cancelled_by_id TEXT NULL;

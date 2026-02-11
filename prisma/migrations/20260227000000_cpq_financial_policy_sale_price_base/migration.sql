-- Add financial/policy toggle and sale price base for CPQ quotes
ALTER TABLE cpq.quote_parameters
  ADD COLUMN IF NOT EXISTS financial_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sale_price_base NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS policy_enabled BOOLEAN NOT NULL DEFAULT false;

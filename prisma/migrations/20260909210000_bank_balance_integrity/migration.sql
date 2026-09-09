-- Aditiva: cuadratura de saldo bancario (computed/delta) y umbral por tenant.
-- Sin DROP, sin ALTER de columnas existentes. Snapshots previos quedan con NULL.

ALTER TABLE "finance"."finance_bank_account_balances"
  ADD COLUMN "computed_balance" DECIMAL(14, 2),
  ADD COLUMN "delta_clp" DECIMAL(14, 2);

ALTER TABLE "finance"."finance_cashflow_config"
  ADD COLUMN "bank_balance_discrepancy_threshold_clp" INTEGER NOT NULL DEFAULT 100000;

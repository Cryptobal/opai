-- Ledger bancario: el saldo de una cuenta pasa a ser
--   OPENING (saldo inicial al cierre de una fecha) + Σ movimientos visibles posteriores.
-- Las demás fuentes (MANUAL / IMPORT / CALCULATED) quedan como lecturas del
-- banco que solo se comparan contra el ledger (cuadratura).

ALTER TYPE "finance"."FinanceBalanceSource" ADD VALUE IF NOT EXISTS 'OPENING';

-- Posibles duplicados: misma huella con id de proveedor distinto. Se insertan
-- (cuentan en el saldo) y el usuario los resuelve en Cuadratura.
ALTER TABLE "finance"."finance_bank_transactions"
  ADD COLUMN IF NOT EXISTS "dup_suspect_of_id" UUID,
  ADD COLUMN IF NOT EXISTS "dup_resolved_at" TIMESTAMPTZ(6);

CREATE INDEX IF NOT EXISTS "idx_finance_bank_tx_dup_suspect"
  ON "finance"."finance_bank_transactions"("tenant_id", "dup_suspect_of_id");

-- "SALDO INICIAL" de la cartola importada (candidato a OPENING).
ALTER TABLE "finance"."finance_bank_statement_imports"
  ADD COLUMN IF NOT EXISTS "opening_balance" DECIMAL(14,2);

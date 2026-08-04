-- Flujo cartola-first: bandeja de ingresos = solo abonos bancarios.
-- ADITIVO e idempotente. Default true; no toca semántica de filas existentes
-- más allá del nuevo flag (leído en derive/load).

ALTER TABLE "finance"."finance_cashflow_config"
  ADD COLUMN IF NOT EXISTS "bandeja_income_bank_only" BOOLEAN NOT NULL DEFAULT true;

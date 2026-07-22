-- Flujo v3 follow-ups F1/F2 — ADITIVO e idempotente.
-- Dos columnas nuevas en finance_cashflow_config; nada existente cambia.

ALTER TABLE "finance"."finance_cashflow_config"
  ADD COLUMN IF NOT EXISTS "collection_lag_days" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "finance"."finance_cashflow_config"
  ADD COLUMN IF NOT EXISTS "flow_warn_threshold_clp" INTEGER NOT NULL DEFAULT 8000000;

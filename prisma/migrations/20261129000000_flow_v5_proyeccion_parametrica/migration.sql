-- Flujo v5 — proyeccion parametrica. ADITIVO e idempotente.
-- Campos nuevos en finance_cashflow_config + end_after_occurrences en
-- finance_flow_plan_recurrences. Nada existente cambia.

ALTER TABLE "finance"."finance_cashflow_config"
  ADD COLUMN IF NOT EXISTS "project_received_dtes_as_expense" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "finance"."finance_cashflow_config"
  ADD COLUMN IF NOT EXISTS "finiquitos_avg_months" INTEGER NOT NULL DEFAULT 6;

ALTER TABLE "finance"."finance_cashflow_config"
  ADD COLUMN IF NOT EXISTS "finiquitos_manual_monthly_clp" INTEGER;

ALTER TABLE "finance"."finance_cashflow_config"
  ADD COLUMN IF NOT EXISTS "f29_credit_avg_months" INTEGER NOT NULL DEFAULT 6;

ALTER TABLE "finance"."finance_flow_plan_recurrences"
  ADD COLUMN IF NOT EXISTS "end_after_occurrences" INTEGER;

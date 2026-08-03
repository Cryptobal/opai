-- Flujo de Caja v4 — Egresos recurrentes en UF (ADITIVO).
-- Enum FlowPlanCurrency + columnas nullable/default en finance_flow_plan_recurrences.
-- No toca datos existentes (default CLP).

DO $$ BEGIN
  CREATE TYPE "finance"."FlowPlanCurrency" AS ENUM ('CLP', 'UF');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "finance"."finance_flow_plan_recurrences"
  ADD COLUMN IF NOT EXISTS "currency" "finance"."FlowPlanCurrency" NOT NULL DEFAULT 'CLP';

ALTER TABLE "finance"."finance_flow_plan_recurrences"
  ADD COLUMN IF NOT EXISTS "amount_uf" DECIMAL(10,4);

ALTER TABLE "finance"."finance_flow_plan_recurrences"
  ADD COLUMN IF NOT EXISTS "uf_policy" TEXT;

ALTER TABLE "finance"."finance_flow_plan_recurrences"
  ADD COLUMN IF NOT EXISTS "uf_custom_day" INTEGER;

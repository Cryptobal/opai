-- Flujo v5.1 — recurrencia % ventas netas. ADITIVO e idempotente.
-- Enum nuevo FlowRecurrenceAmountMode + columnas amount_mode / pct_sales.

DO $$ BEGIN
  CREATE TYPE "finance"."FlowRecurrenceAmountMode" AS ENUM ('FIXED', 'PCT_SALES');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "finance"."finance_flow_plan_recurrences"
  ADD COLUMN IF NOT EXISTS "amount_mode" "finance"."FlowRecurrenceAmountMode" NOT NULL DEFAULT 'FIXED';

ALTER TABLE "finance"."finance_flow_plan_recurrences"
  ADD COLUMN IF NOT EXISTS "pct_sales" DECIMAL(6, 4);

CREATE INDEX IF NOT EXISTS "idx_finance_flow_plan_recurrence_tenant_mode"
  ON "finance"."finance_flow_plan_recurrences" ("tenant_id", "amount_mode");

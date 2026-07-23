-- Flujo de Caja v3 — Egresos recurrentes de PLAN (§5J). Schema ADITIVO.
-- Crea 1 enum + 1 tabla nueva en el schema finance. NO toca ninguna tabla
-- existente. Idempotente (IF NOT EXISTS / DO-block) para tolerar re-deploys.

DO $$ BEGIN
  CREATE TYPE "finance"."FlowRecurrenceFrequency" AS ENUM (
    'WEEKLY', 'BIWEEKLY', 'MONTHLY'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "finance"."finance_flow_plan_recurrences" (
  "id"           UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id"    TEXT NOT NULL,
  "row_id"       UUID NOT NULL,
  "amount"       DECIMAL(14,2) NOT NULL,
  "frequency"    "finance"."FlowRecurrenceFrequency" NOT NULL,
  "day_of_month" INTEGER,
  "start_date"   DATE NOT NULL,
  "end_date"     DATE,
  "created_by"   TEXT,
  "created_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "finance_flow_plan_recurrences_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_finance_flow_plan_recurrence_tenant_row"
  ON "finance"."finance_flow_plan_recurrences"("tenant_id", "row_id");

DO $$ BEGIN
  ALTER TABLE "finance"."finance_flow_plan_recurrences"
    ADD CONSTRAINT "finance_flow_plan_recurrences_row_id_fkey"
    FOREIGN KEY ("row_id") REFERENCES "finance"."finance_flow_rows"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

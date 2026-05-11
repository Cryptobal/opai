-- ─── 1. Nuevo campo weekClosingDow en cashflow config ───
ALTER TABLE "finance"."finance_cashflow_config"
  ADD COLUMN IF NOT EXISTS "week_closing_dow" INTEGER NOT NULL DEFAULT 5;

COMMENT ON COLUMN "finance"."finance_cashflow_config"."week_closing_dow"
  IS '0=Dom, 1=Lun, ..., 5=Vie, 6=Sáb. Día de cierre semanal del tenant. Default 5 (viernes).';

-- ─── 2. Tabla de snapshots de cierre semanal ───
CREATE TABLE IF NOT EXISTS "finance"."finance_cashflow_weekly_close" (
  "id"                          UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id"                   TEXT NOT NULL,
  "week_end_date"               DATE NOT NULL,
  "week_start_date"             DATE NOT NULL,
  "bank_balance_clp"            DECIMAL(14,2) NOT NULL,
  "projected_balance_clp"       DECIMAL(14,2) NOT NULL,
  "variance_clp"                DECIMAL(14,2) NOT NULL,
  "unassigned_bank_count"       INTEGER NOT NULL DEFAULT 0,
  "unassigned_bank_total_clp"   DECIMAL(14,2) NOT NULL DEFAULT 0,
  "unfulfilled_proj_count"      INTEGER NOT NULL DEFAULT 0,
  "unfulfilled_proj_total_clp"  DECIMAL(14,2) NOT NULL DEFAULT 0,
  "closed_by"                   TEXT,
  "closed_at"                   TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "notes"                       TEXT,
  CONSTRAINT "finance_cashflow_weekly_close_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_cashflow_weekly_close"
  ON "finance"."finance_cashflow_weekly_close"("tenant_id", "week_end_date");

CREATE INDEX IF NOT EXISTS "idx_cashflow_weekly_close_tenant_date"
  ON "finance"."finance_cashflow_weekly_close"("tenant_id", "week_end_date" DESC);

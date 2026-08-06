-- Flujo v3: liquidación de proyección por celda + config residual.
-- Aditiva: sin DROP, sin NOT NULL sobre columnas existentes, sin backfill.

CREATE TYPE "finance"."FlowCellSettlementMode" AS ENUM ('AUTO', 'CLOSED');

CREATE TABLE IF NOT EXISTS "finance"."finance_flow_cell_settlements" (
  "id"                   UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id"            TEXT NOT NULL,
  "row_id"               UUID NOT NULL,
  "week_start"           DATE NOT NULL,
  "mode"                 "finance"."FlowCellSettlementMode" NOT NULL DEFAULT 'AUTO',
  "closed_projected_clp" DECIMAL(14,2),
  "updated_by"           TEXT,
  "created_at"           TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"           TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "finance_flow_cell_settlements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_finance_flow_cell_settlement"
  ON "finance"."finance_flow_cell_settlements"("tenant_id", "row_id", "week_start");

CREATE INDEX IF NOT EXISTS "idx_finance_flow_cell_settlement_week"
  ON "finance"."finance_flow_cell_settlements"("tenant_id", "week_start");

DO $$ BEGIN
  ALTER TABLE "finance"."finance_flow_cell_settlements"
    ADD CONSTRAINT "finance_flow_cell_settlements_row_id_fkey"
    FOREIGN KEY ("row_id") REFERENCES "finance"."finance_flow_rows"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "finance"."finance_cashflow_config"
  ADD COLUMN IF NOT EXISTS "residual_carry_enabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "finance"."finance_cashflow_config"
  ADD COLUMN IF NOT EXISTS "residual_min_clp" INTEGER NOT NULL DEFAULT 10000;

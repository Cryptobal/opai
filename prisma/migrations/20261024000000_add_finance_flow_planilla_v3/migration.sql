-- Flujo de Caja v3 "Modo Planilla" — schema ADITIVO.
-- Solo crea: 2 enums + 2 tablas nuevas en el schema finance.
-- NO toca FinanceCashflowItem/Occurrence ni ninguna tabla existente.
-- Idempotente (IF NOT EXISTS / DO-block) para tolerar re-deploys.

-- Enums
DO $$ BEGIN
  CREATE TYPE "finance"."FlowSection" AS ENUM (
    'INGRESOS', 'REMUNERACIONES', 'IMPUESTOS', 'GAV', 'FINANCIAMIENTO', 'OTROS'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "finance"."FlowRowMapping" AS ENUM (
    'ACCOUNT_INSTALLATION', 'CATEGORY', 'SUPPLIER', 'MANUAL'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Fila de la planilla
CREATE TABLE IF NOT EXISTS "finance"."finance_flow_rows" (
  "id"              UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id"       TEXT NOT NULL,
  "section"         "finance"."FlowSection" NOT NULL,
  "name"            TEXT NOT NULL,
  "order_index"     INTEGER NOT NULL,
  "mapping"         "finance"."FlowRowMapping" NOT NULL DEFAULT 'MANUAL',
  "crm_account_id"  UUID,
  "installation_id" UUID,
  "category_id"     UUID,
  "supplier_id"     UUID,
  "archived_at"     TIMESTAMPTZ(6),
  "created_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "finance_flow_rows_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_finance_flow_row_tenant_section"
  ON "finance"."finance_flow_rows"("tenant_id", "section", "order_index");

CREATE INDEX IF NOT EXISTS "idx_finance_flow_row_account_inst"
  ON "finance"."finance_flow_rows"("tenant_id", "crm_account_id", "installation_id");

-- Celda de plan (fila × semana → monto)
CREATE TABLE IF NOT EXISTS "finance"."finance_flow_plan_cells" (
  "id"         UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id"  TEXT NOT NULL,
  "row_id"     UUID NOT NULL,
  "week_start" DATE NOT NULL,
  "amount"     DECIMAL(14,2) NOT NULL,
  "updated_by" TEXT,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "finance_flow_plan_cells_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_finance_flow_plan_cell"
  ON "finance"."finance_flow_plan_cells"("tenant_id", "row_id", "week_start");

CREATE INDEX IF NOT EXISTS "idx_finance_flow_plan_cell_week"
  ON "finance"."finance_flow_plan_cells"("tenant_id", "week_start");

DO $$ BEGIN
  ALTER TABLE "finance"."finance_flow_plan_cells"
    ADD CONSTRAINT "finance_flow_plan_cells_row_id_fkey"
    FOREIGN KEY ("row_id") REFERENCES "finance"."finance_flow_rows"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

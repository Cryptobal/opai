-- ════════════════════════════════════════════════════════════════
--  Factoring · Batches (Fase 2 — cesión bulk de N facturas)
-- ════════════════════════════════════════════════════════════════
--
-- Una empresa de factoring envía a veces UNA simulación cubriendo
-- N facturas. Modelo nuevo `finance_factoring_batches` agrupa esas
-- N operaciones bajo un mismo documento y guarda los TOTALES del
-- batch. El costo financiero se prorratea por monto bruto de cada
-- factura → cada FinanceFactoringOperation hijo guarda su share en
-- los campos `sim_*` y `commission_amount`.

CREATE TABLE IF NOT EXISTS "finance"."finance_factoring_batches" (
  "id"                          UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id"                   TEXT NOT NULL,
  "code"                        TEXT NOT NULL,
  "factoring_company_id"        UUID NOT NULL,

  "simulation_file_url"         TEXT,
  "simulation_file_key"         TEXT,
  "simulation_file_name"        TEXT,
  "simulation_extracted_at"     TIMESTAMPTZ(6),
  "simulation_extracted_json"   JSONB,

  "fecha_cesion"                DATE NOT NULL,
  "fecha_vencimiento"           DATE NOT NULL,
  "plazo_dias"                  INTEGER NOT NULL,

  "total_invoice_amount"        DECIMAL(14,2) NOT NULL DEFAULT 0,
  "total_monto_a_girar"         DECIMAL(14,2),
  "total_dif_precio"            DECIMAL(14,2),
  "total_comision"              DECIMAL(14,2),
  "total_iva"                   DECIMAL(14,2),
  "total_gastos_legal"          DECIMAL(14,2),
  "total_notaria"               DECIMAL(14,2),
  "total_gastos_operacionales"  DECIMAL(14,2),
  "total_costo_financiero"      DECIMAL(14,2),
  "effective_monthly_rate"      DECIMAL(8,4),

  "operations_count"            INTEGER NOT NULL DEFAULT 0,
  "notes"                       TEXT,
  "created_by"                  TEXT NOT NULL,
  "created_at"                  TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"                  TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "finance_factoring_batches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fk_factoring_batch_company"
    FOREIGN KEY ("factoring_company_id")
    REFERENCES "finance"."finance_factoring_companies"("id")
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_factoring_batch_code"
  ON "finance"."finance_factoring_batches"("tenant_id", "code");

CREATE INDEX IF NOT EXISTS "idx_factoring_batch_company"
  ON "finance"."finance_factoring_batches"("tenant_id", "factoring_company_id");

CREATE INDEX IF NOT EXISTS "idx_factoring_batch_fecha"
  ON "finance"."finance_factoring_batches"("tenant_id", "fecha_cesion" DESC);

-- Link individual operations to their batch (optional 1:1 ya no aplica;
-- N:1 desde operation → batch).
ALTER TABLE "finance"."finance_factoring_operations"
  ADD COLUMN IF NOT EXISTS "batch_id" UUID;

ALTER TABLE "finance"."finance_factoring_operations"
  ADD CONSTRAINT "fk_factoring_op_batch"
  FOREIGN KEY ("batch_id")
  REFERENCES "finance"."finance_factoring_batches"("id")
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_factoring_op_batch"
  ON "finance"."finance_factoring_operations"("batch_id")
  WHERE "batch_id" IS NOT NULL;

COMMENT ON TABLE "finance"."finance_factoring_batches"
  IS 'Agrupador de N FinanceFactoringOperation bajo una misma simulación enviada por el cesionario. Totales para reporting; costos prorrateados a cada operation hijo.';

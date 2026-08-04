-- Notas libres por celda de planilla (fila × semana). Aditivo e idempotente.

CREATE TABLE IF NOT EXISTS "finance"."finance_flow_cell_notes" (
  "id"         UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id"  TEXT NOT NULL,
  "row_id"     UUID NOT NULL,
  "week_start" DATE NOT NULL,
  "body"       TEXT NOT NULL,
  "updated_by" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "finance_flow_cell_notes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_finance_flow_cell_note"
  ON "finance"."finance_flow_cell_notes"("tenant_id", "row_id", "week_start");

CREATE INDEX IF NOT EXISTS "idx_finance_flow_cell_note_week"
  ON "finance"."finance_flow_cell_notes"("tenant_id", "week_start");

DO $$ BEGIN
  ALTER TABLE "finance"."finance_flow_cell_notes"
    ADD CONSTRAINT "finance_flow_cell_notes_row_id_fkey"
    FOREIGN KEY ("row_id") REFERENCES "finance"."finance_flow_rows"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

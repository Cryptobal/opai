-- Agrega columna nullable dte_id a finance_cashflow_occurrences + índice +
-- FK con ON DELETE SET NULL. Permite vincular cada cuota proyectada con su
-- DTE (borrador o emitido) sin romper si el DTE se elimina.

ALTER TABLE "finance"."finance_cashflow_occurrences" ADD COLUMN "dte_id" UUID;

CREATE INDEX "idx_cashflow_occ_dte" ON "finance"."finance_cashflow_occurrences"("tenant_id", "dte_id");

ALTER TABLE "finance"."finance_cashflow_occurrences" ADD CONSTRAINT "finance_cashflow_occurrences_dte_id_fkey"
  FOREIGN KEY ("dte_id") REFERENCES "finance"."finance_dtes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

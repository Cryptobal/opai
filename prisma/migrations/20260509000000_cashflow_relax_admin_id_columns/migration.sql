-- created_by y matched_by referencian Admin.id, que es un CUID (no UUID).
-- Cambiamos el tipo de columna a TEXT para aceptar el CUID sin romper el insert.

ALTER TABLE "finance"."finance_cashflow_items"
  ALTER COLUMN "created_by" TYPE TEXT USING "created_by"::text;

ALTER TABLE "finance"."finance_cashflow_occurrences"
  ALTER COLUMN "matched_by" TYPE TEXT USING "matched_by"::text;

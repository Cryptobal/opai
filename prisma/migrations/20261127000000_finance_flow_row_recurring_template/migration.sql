-- Flujo v3: 1 fila de planilla por programación de facturación.
-- Columna aditiva + unique parcial (solo cuando hay template).

ALTER TABLE "finance"."finance_flow_rows"
  ADD COLUMN IF NOT EXISTS "recurring_template_id" UUID;

CREATE INDEX IF NOT EXISTS "idx_finance_flow_row_tenant_template"
  ON "finance"."finance_flow_rows"("tenant_id", "recurring_template_id");

-- Una sola fila activa por template (NULL no participa).
CREATE UNIQUE INDEX IF NOT EXISTS "uq_finance_flow_row_tenant_template"
  ON "finance"."finance_flow_rows"("tenant_id", "recurring_template_id")
  WHERE "recurring_template_id" IS NOT NULL;

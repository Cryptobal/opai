-- Vínculo borrador/factura → programación recurrente + período (YYYY-MM) que factura.
-- Aditivo y nulleable. Idempotente (IF NOT EXISTS) porque las columnas ya se
-- agregaron en caliente a prod antes de este deploy; migrate deploy queda no-op.
ALTER TABLE "finance"."finance_dtes" ADD COLUMN IF NOT EXISTS "recurring_template_id" UUID;
ALTER TABLE "finance"."finance_dtes" ADD COLUMN IF NOT EXISTS "billing_period" TEXT;

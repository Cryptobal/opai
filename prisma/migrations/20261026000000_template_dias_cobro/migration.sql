-- Flujo v3: término de pago POR CONTRATO en la programación de facturación.
-- ADITIVO e idempotente. NULL = usa el default del tenant
-- (finance_cashflow_config.collection_lag_days).

ALTER TABLE "finance"."finance_dte_recurring_templates"
  ADD COLUMN IF NOT EXISTS "dias_cobro_desde_factura" INTEGER;

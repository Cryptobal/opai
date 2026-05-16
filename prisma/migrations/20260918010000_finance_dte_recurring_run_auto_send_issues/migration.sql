-- Migration: finance_dte_recurring_run_auto_send_issues
-- Agrega columna auto_send_issues (JSONB nullable) a finance_dte_recurring_runs.
-- Captura errores de auto-envío parciales cuando el draft se creó correctamente
-- pero al menos un envío de Proforma/Estado de Pago falló.

ALTER TABLE "finance"."finance_dte_recurring_runs"
  ADD COLUMN IF NOT EXISTS "auto_send_issues" JSONB;

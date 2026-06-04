-- Mueve el reajuste IPC desde FinanceCashflowItem hacia FinanceDteRecurringTemplate
-- (Programación), en modo "manual con alerta": el cron NO modifica montos, solo
-- avisa cuando se acerca la fecha de reajuste para que el usuario ingrese el % real.
-- Aditivo y nulleable. Idempotente (IF NOT EXISTS) para que `migrate deploy` sea
-- no-op si las columnas ya se agregaron en caliente.
ALTER TABLE "finance"."finance_dte_recurring_templates"
  ADD COLUMN IF NOT EXISTS "has_ipc_adjustment" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "finance"."finance_dte_recurring_templates"
  ADD COLUMN IF NOT EXISTS "ipc_adjustment_months" INTEGER;
ALTER TABLE "finance"."finance_dte_recurring_templates"
  ADD COLUMN IF NOT EXISTS "ipc_start_date" DATE;
ALTER TABLE "finance"."finance_dte_recurring_templates"
  ADD COLUMN IF NOT EXISTS "ipc_last_alerted_for" DATE;

-- Índice para que el cron de avisos filtre rápido las plantillas con IPC activo.
CREATE INDEX IF NOT EXISTS "idx_dte_recurring_ipc"
  ON "finance"."finance_dte_recurring_templates" ("tenant_id", "has_ipc_adjustment");

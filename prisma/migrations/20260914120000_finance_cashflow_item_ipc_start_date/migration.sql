-- AddColumn: ancla opcional del calendario IPC. Si es NULL, el código
-- cae a `start_date` del item (compat retroactiva). Útil para contratos
-- vigentes hace años que recién configuran IPC: el reajuste empieza
-- desde la fecha real, no desde el inicio del contrato.
ALTER TABLE "finance"."finance_cashflow_items"
ADD COLUMN IF NOT EXISTS "ipc_start_date" DATE;

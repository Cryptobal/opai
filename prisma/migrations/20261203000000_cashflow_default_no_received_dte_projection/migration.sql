-- Flujo cartola-first: tenants nuevos no proyectan DTEs recibidos como egreso.
-- ADITIVO: solo cambia el DEFAULT de columna. No toca filas existentes.

ALTER TABLE "finance"."finance_cashflow_config"
  ALTER COLUMN "project_received_dtes_as_expense" SET DEFAULT false;
